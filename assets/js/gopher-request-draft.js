/* gopher-request-draft.js — the cross-platform REQUEST DRAFT kernel.
   ===================================================================
   Gopher Request (web) and the Gopher Request App are one product on two platforms.
   A request started on one must resume on the other, losing nothing that matters and
   leaking nothing that shouldn't travel. This module is the single definition of what
   a resumable request IS: which fields cross the wire, which never do, how two devices
   reconcile, and what must be re-derived rather than trusted on arrival.

   It is deliberately PURE: no DOM, no fetch, no globals, no platform APIs. That is what
   lets the same file run in the static web build, in a React/Capacitor bundle, and in a
   Node test harness. Storage and transport live in gopher-request-draft-store.js.

   MODULE FORMAT — UMD (CommonJS + AMD + browser global).
   The older shared modules (gopher-request-logic.js et al) are IIFE + window.X only,
   which a bundler can consume solely for side-effect. That is a real obstacle to the
   React/Capacitor target, so this one exports properly in all three worlds while still
   attaching window.GopherRequestDraft for the current script-tag surfaces.

   CONTRACT SOURCE: docs/handoff/request-app-parity/canonical-request-state-schema.md
   (§1 persisted-vs-transient, §2 the 42-field core, §3 reconciled drift). This file is
   the executable form of that document; run_parity_harness.py asserts they agree, and
   asserts no surface re-implements any of this locally. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.GopherRequestDraft = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Bump when the shape of `data` changes in a way older clients can't read.
     migrate() must gain a step for every bump — a draft written by yesterday's app
     has to open in today's web build, which is the entire point of the feature. */
  var DRAFT_VERSION = 1;

  /* ── 1. THE CONTRACT ─────────────────────────────────────────────────────────
     Fields that ARE the request. These travel. Grouped by owning step so this list
     stays diffable against the schema doc and against makeInitialState(). */
  var CONTRACT_FIELDS = [
    /* flow    */ 'step', 'maxStepReached', 'category',
    /* describe*/ 'description', 'hasPic',
    /* deliv.  */ 'ageRestricted', 'itemsPurchased', 'costOfItems', 'idRequiredAtCompletion',
    /* item    */ 'itemCount', 'multipleItems', 'hazardous',
    /* rider   */ 'numRiders', 'numBags', 'specialInstructions',
    /* workers */ 'moreThanOneWorker', 'numWorkers', 'payByHour', 'numHours',
                  'workerSelection', 'hireAgainGophers',
    /* pickup  */ 'noSpecificPickup', 'pickupStairs', 'serviceElevatorPickup', 'pickupStops',
    /* dropoff */ 'destStairs', 'serviceElevatorDest', 'dropoffStops', 'tripDistance',
    /* pay     */ 'payMode', 'payAmount', 'lowOfferAck', 'suggestedOfferUsed', 'junkTier',
    /* schedule*/ 'scheduleType', 'flexibleWindow', 'schedDate', 'timeSlot',
                  'scheduleConfirmed', 'selectedDate',
    /* review  */ 'promoCode', 'promoApplied', 'paymentMethod', 'waiverChecked',
    /* deal    */ 'fromDeal', 'dealKind', 'dealBoost'
  ];

  /* ── 2. TRANSIENT — per-session UI, never persisted ──────────────────────────
     Which accordion is open is not part of a request. Acknowledgement flags belong
     here too and that is a decision, not an oversight: a backstop the user cleared on
     their phone must fire again on the laptop, because the laptop re-runs the gate
     against the description that actually arrived. Persisting the ack would let a
     resumed request skip a gate it never actually passed on this device. */
  var TRANSIENT_FIELDS = [
    'openInfo', 'openCatInfo', 'osOpen', 'paymentPickerOpen', 'sseOpen', 'wteOpen',
    'profileOpen', 'calViewISO', 'descriptionPlaceholder', 'descriptionIsPlaceholder',
    'ageKeywordAck', 'agePurchaseAck', 'agePurchaseDismissed', 'waiverPrompted',
    'dupWarnAck', 'lowAvailabilityAck', 'promoError', 'submittedAt'
  ];

  /* ── 3. SENSITIVE — must NEVER be written to a draft, anywhere, ever ─────────
     `idVerification` carries idFrontSrc / selfieSrc: data-URL photographs of a
     government ID and a live selfie. `picThumbs[].src` are full base64 images.
     Three independent reasons these are excluded, any one of which is sufficient:
       1. PII. A draft is stored server-side and synced to other devices; identity
          documents must not be duplicated into a convenience cache.
       2. The backend logs whole request bodies when the socket debugger flag is on
          (index.js) — a synced ID photo would land in application logs.
       3. Size. The draft endpoint shares a 30-req/sec global limiter and a 10 MB body
          limit with live order traffic; base64 images would abuse both.
     Identity verification is therefore per-device by construction and is re-derived on
     arrival (see sanitizeOnResume). Photos are reported as a COUNT so the resuming
     device can tell the user what to re-attach, rather than silently losing them. */
  var SENSITIVE_FIELDS = ['idVerification', 'picThumbs'];

  /* Re-consent on arrival. These are affirmative user acts, not data: a waiver ticked
     on the phone must not pre-tick on the laptop where the user may submit without ever
     seeing it. Carrying data forward is convenience; carrying consent forward is not
     ours to do. Flip a field out of this list only on an explicit owner decision. */
  var RECONSENT_FIELDS = ['waiverChecked', 'lowOfferAck'];

  function contractFields() { return CONTRACT_FIELDS.slice(); }
  function transientFields() { return TRANSIENT_FIELDS.slice(); }
  function sensitiveFields() { return SENSITIVE_FIELDS.slice(); }
  function reconsentFields() { return RECONSENT_FIELDS.slice(); }

  /* ── plumbing ─────────────────────────────────────────────────────────────── */

  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(clone);
    var out = {}, k;
    for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = clone(v[k]);
    return out;
  }

  function isEmptyish(v) {
    return v === null || v === undefined || v === '' ||
           (Array.isArray(v) && (v.length === 0 || (v.length === 1 && v[0] === '')));
  }

  /* ── 4. toDraft — state → wire payload ──────────────────────────────────────
     Whitelist, never blacklist. A new field added to a surface's makeInitialState()
     does NOT silently start syncing (and a new *sensitive* field does not silently
     leak); it stays out until it is added to CONTRACT_FIELDS deliberately, and the
     parity harness reports it as undocumented drift in the meantime. */
  function toDraft(state, meta) {
    state = state || {};
    meta = meta || {};
    var data = {}, i, k;

    for (i = 0; i < CONTRACT_FIELDS.length; i++) {
      k = CONTRACT_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(state, k)) data[k] = clone(state[k]);
    }

    /* Photos: count only — never the bytes. See SENSITIVE_FIELDS. */
    var thumbs = state.picThumbs;
    data.picCount = Array.isArray(thumbs) ? thumbs.length : 0;
    data.hasPic = data.picCount > 0;

    return {
      v: DRAFT_VERSION,
      rev: typeof meta.rev === 'number' ? meta.rev : 0,
      updatedAt: meta.updatedAt || null,       // server-authoritative; client never invents it
      clientId: meta.clientId || null,         // which device wrote this
      origin: meta.origin || null,             // 'web' | 'app' — for the resume prompt copy
      data: data
    };
  }

  /* ── 5. applyDraft — wire payload → state ───────────────────────────────────
     Returns a NEW state object; never mutates the caller's. Unknown/extra keys in the
     draft are ignored (forward-compat: a newer client's field must not crash an older
     one). Transient and sensitive keys are impossible here because they were never
     written, but we re-filter anyway — defence in depth against a hand-edited or
     replayed payload. */
  function applyDraft(draft, baseState) {
    var out = clone(baseState || {});
    if (!draft || !draft.data) return out;

    var d = migrate(draft).data, i, k;
    for (i = 0; i < CONTRACT_FIELDS.length; i++) {
      k = CONTRACT_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = clone(d[k]);
    }
    return out;
  }

  /* ── 6. sanitizeOnResume — what must NOT be trusted on arrival ──────────────
     A draft is data the user typed, not a verdict the system reached. Anything that
     was a *decision* gets re-made on the device that will actually submit.
     `now` is injected so this is deterministic and testable. */
  function sanitizeOnResume(state, now) {
    var out = clone(state || {});
    var today = (now instanceof Date ? now : new Date(now || Date.now()));
    var notes = [];

    /* Identity verification never transfers — re-run on the submitting device. */
    out.idVerification = {
      idFrontCaptured: false, selfieCaptured: false,
      idFrontSrc: null, selfieSrc: null, savedOnFile: false, submittedAt: null
    };

    /* Photos did not travel. Reset the local array and let the UI prompt. */
    out.picThumbs = [];
    out.hasPic = false;

    /* Affirmative consent is re-taken here. */
    for (var i = 0; i < RECONSENT_FIELDS.length; i++) out[RECONSENT_FIELDS[i]] = false;

    /* A scheduled date that has passed cannot be resumed as-is. Clear it and drop the
       confirmation so the picker re-opens rather than submitting into the past. */
    if (out.schedDate) {
      var d = String(out.schedDate);
      var iso = today.getFullYear() + '-' +
                String(today.getMonth() + 1).padStart(2, '0') + '-' +
                String(today.getDate()).padStart(2, '0');
      if (d < iso) {
        out.schedDate = null;
        out.timeSlot = '';
        out.scheduleConfirmed = false;
        notes.push('scheduleExpired');
      }
    }

    /* Promo codes are validated server-side at submit; a stale "applied" must not
       imply a discount that no longer exists. Keep what they typed, drop the verdict. */
    if (out.promoApplied) { out.promoApplied = false; notes.push('promoRevalidate'); }

    /* Gates are re-derived, never inherited (see TRANSIENT_FIELDS). */
    out.ageKeywordAck = false;
    out.agePurchaseAck = false;
    out.waiverPrompted = false;
    out.dupWarnAck = false;
    out.lowAvailabilityAck = false;

    return { state: out, notes: notes };
  }

  /* ── 7. migrate ─────────────────────────────────────────────────────────────
     Every version bump gets a step. Unknown FUTURE versions are passed through rather
     than rejected: an older client should degrade to "I understand the fields I know",
     not refuse to resume. */
  function migrate(draft) {
    if (!draft) return { v: DRAFT_VERSION, data: {} };
    var out = clone(draft);
    if (typeof out.v !== 'number') out.v = DRAFT_VERSION;
    // if (out.v === 1) { ...transform...; out.v = 2; }
    return out;
  }

  /* ── 8. isMeaningful — is this worth saving / offering to resume? ────────────
     Guards against two bad behaviours: autosaving an untouched form (every app open
     would clobber a real draft on another device), and offering to "resume" a blank
     request. A category alone is not enough — the user must have typed or chosen
     something that would be annoying to lose. */
  function isMeaningful(draftOrState) {
    var d = (draftOrState && draftOrState.data) ? draftOrState.data : (draftOrState || {});
    if (d.description && String(d.description).trim().length >= 3) return true;
    if (!isEmptyish(d.payAmount)) return true;
    if (!isEmptyish(d.pickupStops)) return true;
    if (!isEmptyish(d.dropoffStops)) return true;
    if (d.picCount > 0) return true;
    if (!isEmptyish(d.specialInstructions)) return true;
    /* Category + genuine forward progress counts; category alone does not. */
    if (d.category && (d.maxStepReached || 1) > 2) return true;
    return false;
  }

  /* ── 9. summarize — the resume prompt needs a human sentence ────────────────*/
  function summarize(draft) {
    var d = (draft && draft.data) || {};
    var desc = String(d.description || '').trim().replace(/\s+/g, ' ');
    if (desc.length > 80) desc = desc.slice(0, 79) + '…';
    return {
      category: d.category || null,
      description: desc,
      step: d.step || 1,
      maxStepReached: d.maxStepReached || 1,
      picCount: d.picCount || 0,
      updatedAt: draft && draft.updatedAt ? draft.updatedAt : null,
      origin: draft && draft.origin ? draft.origin : null
    };
  }

  /* ── 10. reconcile — two devices, one request ───────────────────────────────
     Deliberately NOT last-write-wins-silently. Silent clobber is the failure mode
     users actually notice and never forgive ("it deleted what I typed"). Field-level
     auto-merge is worse: it can assemble a request neither device ever showed anyone,
     and this form has interdependent fields (category scoping, pay mode, schedule).

     So: whole-draft, and the human decides whenever both sides moved.
       - remote unchanged since our base  → 'local'  (normal autosave, just push)
       - we never edited                  → 'remote' (fresh device, just pull)
       - both moved                       → 'conflict' (ask; never guess)
     `rev` is the server's counter; `baseRev` is the rev our local copy started from. */
  function reconcile(local, remote, baseRev) {
    var lRev = local && typeof local.rev === 'number' ? local.rev : 0;
    var rRev = remote && typeof remote.rev === 'number' ? remote.rev : 0;
    var base = typeof baseRev === 'number' ? baseRev : lRev;

    if (!remote) return { resolution: 'local', reason: 'no-remote' };
    if (!local || !isMeaningful(local)) return { resolution: 'remote', reason: 'no-local-edits' };
    if (rRev <= base) return { resolution: 'local', reason: 'remote-unchanged' };
    if (lRev === rRev) return { resolution: 'local', reason: 'same-rev' };
    return {
      resolution: 'conflict',
      reason: 'both-moved',
      local: summarize(local),
      remote: summarize(remote)
    };
  }

  /* ── 11. validate — shape checks for the wire ───────────────────────────────
     Cheap structural validation. NOT business validation: whether the offer is high
     enough or the category matches the description is decided by the shared decision
     modules and re-run on resume, not frozen into a draft. */
  function validate(draft) {
    var errors = [], warnings = [];
    if (!draft || typeof draft !== 'object') return { ok: false, errors: ['draft is not an object'], warnings: warnings };
    if (typeof draft.v !== 'number') errors.push('missing version');
    if (!draft.data || typeof draft.data !== 'object') errors.push('missing data');

    if (draft.data) {
      for (var i = 0; i < SENSITIVE_FIELDS.length; i++) {
        if (Object.prototype.hasOwnProperty.call(draft.data, SENSITIVE_FIELDS[i])) {
          errors.push('sensitive field present in draft: ' + SENSITIVE_FIELDS[i]);
        }
      }
      for (var j = 0; j < TRANSIENT_FIELDS.length; j++) {
        if (Object.prototype.hasOwnProperty.call(draft.data, TRANSIENT_FIELDS[j])) {
          warnings.push('transient field present in draft: ' + TRANSIENT_FIELDS[j]);
        }
      }
      /* Catch a base64 payload sneaking in under any key — the size/PII rule matters
         more than the field name it arrives under. */
      var scan = JSON.stringify(draft.data) || '';
      if (scan.indexOf('data:image') !== -1) errors.push('embedded image data in draft');
      if (scan.length > 64 * 1024) warnings.push('draft over 64KB (' + scan.length + ' bytes)');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  return {
    DRAFT_VERSION: DRAFT_VERSION,
    CONTRACT_FIELDS: CONTRACT_FIELDS,
    TRANSIENT_FIELDS: TRANSIENT_FIELDS,
    SENSITIVE_FIELDS: SENSITIVE_FIELDS,
    RECONSENT_FIELDS: RECONSENT_FIELDS,
    contractFields: contractFields,
    transientFields: transientFields,
    sensitiveFields: sensitiveFields,
    reconsentFields: reconsentFields,
    toDraft: toDraft,
    applyDraft: applyDraft,
    sanitizeOnResume: sanitizeOnResume,
    migrate: migrate,
    isMeaningful: isMeaningful,
    summarize: summarize,
    reconcile: reconcile,
    validate: validate
  };
});
