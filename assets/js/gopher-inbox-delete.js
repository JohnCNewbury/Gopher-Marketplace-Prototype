/* ============================================================================
   GopherInboxDelete — shared inbox delete behaviour for all 4 web portals
   Spec: G40-100. Owner 2026-07-28: "Need to update the inboxes on all platforms
   to allow users to delete messages… The UI/UX will be the same for all 4 web
   platforms and the prototypes."

   WHY A SHARED MODULE: Request, Connect, Go and Deals each have a DIFFERENT
   inbox data model (request-derived threads / worker-side threads / one canonical
   support thread), but the same .inbox-row shape and the same required behaviour.
   So the behaviour lives here once and each portal supplies only a tiny adapter
   describing where its rows live. Four copies would drift within a week.

   TWO-STAGE DELETE, per the ticket:
     1. swipe-left (touch) or the row's ✕ (pointer)  → Inbox ..... > Deleted
     2. delete from the Deleted tab                  → PERMANENT, confirmed
   Explicitly NOT in scope, and deliberately not built: restore-to-Inbox, and any
   "silence" affordance.

   PROTOTYPE BOUNDARY — read before "finishing" this:
   Deletion state is in memory, like the rest of these dashboards; it does not
   survive a reload. The 90-day purge is implemented as a CHECK-ON-READ against a
   deletedAt stamp (the ticket permits "a check-on-fetch in the Inbox API" as an
   alternative to a job runner) — there is no background job here and there cannot
   be. Production still needs: a real deleted_at column, the purge job, and the
   admin expires_at auto-move evaluated server-side. Those are backend seams.
   ========================================================================== */
(function (root) {
  'use strict';

  var PURGE_DAYS = 90;
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ---- 90-day purge -----------------------------------------------------
     Returns true once a message has sat in Deleted for PURGE_DAYS. Callers
     filter on this at render time, which is why a purged message disappears
     without any user action — matching the ticket's Scenario 4. */
  function isPurged(deletedAt, now) {
    if (!deletedAt) return false;
    var t = (deletedAt instanceof Date) ? deletedAt.getTime() : new Date(deletedAt).getTime();
    if (isNaN(t)) return false;
    return ((now || Date.now()) - t) >= PURGE_DAYS * DAY_MS;
  }

  function daysLeft(deletedAt, now) {
    if (!deletedAt) return PURGE_DAYS;
    var t = (deletedAt instanceof Date) ? deletedAt.getTime() : new Date(deletedAt).getTime();
    if (isNaN(t)) return PURGE_DAYS;
    return Math.max(0, Math.ceil(PURGE_DAYS - (((now || Date.now()) - t) / DAY_MS)));
  }

  /* ---- Admin-expiration auto-move (ticket Scenario 5) --------------------
     An admin message carrying expiresAt moves Inbox -> Deleted the moment that
     time passes, and from then on obeys the ordinary Deleted rules. Evaluated
     on read for the same reason as the purge. Returns true if it moved. */
  function applyAdminExpiry(msg, now) {
    if (!msg || msg.deletedAt || !msg.expiresAt) return false;
    var t = (msg.expiresAt instanceof Date) ? msg.expiresAt.getTime() : new Date(msg.expiresAt).getTime();
    if (isNaN(t) || (now || Date.now()) < t) return false;
    msg.deletedAt = new Date(t).toISOString();   // stamped at EXPIRY, not "now",
    msg.autoExpired = true;                      // so the 90 days runs from then
    return true;
  }

  /* ---- Confirmation ------------------------------------------------------
     Copy is fixed by the ticket. One overlay is reused across every portal so
     the wording cannot drift between them. */
  function confirmPermanent(onConfirm) {
    var ov = document.getElementById('ibxConfirmOverlay');
    if (!ov) {
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="ibx-confirm-overlay" id="ibxConfirmOverlay" hidden>' +
          '<div class="ibx-confirm" role="dialog" aria-modal="true" aria-labelledby="ibxConfirmTitle">' +
            '<h4 id="ibxConfirmTitle">Delete permanently?</h4>' +
            '<p>This cannot be undone.</p>' +
            '<div class="ibx-confirm-actions">' +
              '<button type="button" class="ibx-confirm-btn ibx-cancel" id="ibxCancel">Cancel</button>' +
              '<button type="button" class="ibx-confirm-btn ibx-delete" id="ibxDelete">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap.firstChild);
      ov = document.getElementById('ibxConfirmOverlay');
      var close = function () { ov.hidden = true; ov.__cb = null; };
      document.getElementById('ibxCancel').addEventListener('click', close);
      document.getElementById('ibxDelete').addEventListener('click', function () {
        var cb = ov.__cb; close(); if (typeof cb === 'function') cb();
      });
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !ov.hidden) close();
      });
    }
    ov.__cb = onConfirm;
    ov.hidden = false;
    var d = document.getElementById('ibxDelete'); if (d) d.focus();
  }

  /* ---- Tabs -------------------------------------------------------------- */
  function tabsHTML(active, inboxCount, deletedCount) {
    var c = function (n) { return n ? '<span class="ibx-count">' + n + '</span>' : ''; };
    return '<div class="ibx-tabs">' +
      '<button type="button" class="ibx-tab' + (active === 'deleted' ? '' : ' on') + '" data-ibx-tab="inbox">Inbox' + c(inboxCount) + '</button>' +
      '<button type="button" class="ibx-tab' + (active === 'deleted' ? ' on' : '') + '" data-ibx-tab="deleted">Deleted' + c(deletedCount) + '</button>' +
      '</div>';
  }

  /* ---- Row chrome -------------------------------------------------------
     `deleted` picks the destructive path: in the Inbox the ✕ moves the row to
     Deleted silently (recoverable-by-design is NOT offered, but the row is not
     gone either); in Deleted it is permanent, so it always routes through
     confirmPermanent(). */
  function wrapRow(rowHTML, id, deleted) {
    return '<div class="ibx-rowwrap" data-ibx-id="' + id + '">' +
      '<button type="button" class="ibx-swipe" data-ibx-act="' + (deleted ? 'purge' : 'trash') + '" data-ibx-for="' + id + '">Delete</button>' +
      rowHTML +
      '<button type="button" class="ibx-del" data-ibx-act="' + (deleted ? 'purge' : 'trash') + '" data-ibx-for="' + id + '" ' +
        'aria-label="' + (deleted ? 'Delete permanently' : 'Move to Deleted') + '" title="' + (deleted ? 'Delete permanently' : 'Move to Deleted') + '">&times;</button>' +
      '</div>';
  }

  /* ---- Wiring -----------------------------------------------------------
     opts: { root, onTrash(id), onPurge(id), onTab(name) }
     Touch swipe-left reveals the red bed; a second swipe-right closes it. Only
     one row stays open at a time, which is what stops a half-open row sitting
     behind the list after the user moves on. */
  function bind(opts) {
    var root = opts.root; if (!root) return;

    root.querySelectorAll('[data-ibx-tab]').forEach(function (b) {
      b.addEventListener('click', function () { opts.onTab && opts.onTab(b.getAttribute('data-ibx-tab')); });
    });

    root.querySelectorAll('[data-ibx-act]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();                       // never open the thread
        var id = b.getAttribute('data-ibx-for');
        if (b.getAttribute('data-ibx-act') === 'purge') {
          confirmPermanent(function () { opts.onPurge && opts.onPurge(id); });
        } else {
          opts.onTrash && opts.onTrash(id);
        }
      });
    });

    root.querySelectorAll('.ibx-rowwrap').forEach(function (w) {
      var x0 = null;
      w.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      w.addEventListener('touchmove', function (e) {
        if (x0 === null) return;
        var dx = e.touches[0].clientX - x0;
        if (dx < -34) {
          root.querySelectorAll('.ibx-rowwrap.ibx-open').forEach(function (o) { if (o !== w) o.classList.remove('ibx-open'); });
          w.classList.add('ibx-open'); x0 = null;
        } else if (dx > 34) { w.classList.remove('ibx-open'); x0 = null; }
      }, { passive: true });
      w.addEventListener('touchend', function () { x0 = null; }, { passive: true });
    });
  }

  root.GopherInboxDelete = {
    PURGE_DAYS: PURGE_DAYS,
    isPurged: isPurged,
    daysLeft: daysLeft,
    applyAdminExpiry: applyAdminExpiry,
    confirmPermanent: confirmPermanent,
    tabsHTML: tabsHTML,
    wrapRow: wrapRow,
    bind: bind
  };
})(window);
