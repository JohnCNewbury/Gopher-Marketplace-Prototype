/* ============================================================================
   A PROVIDER'S JOB HISTORY, on the consumer card.

   The provider card has always shown three totals — jobs, rating, tier — above
   the words "Individual job records aren't shown here yet". Honest, and thin:
   the pitch of a Service Provider deal is "this person has done 52 jobs at
   5.0", and a customer could not see one of them.

   ⛔ ONE MODULE, BOTH PAGES. Request and Connect render the same provider card
   and have drifted apart before — the feed module was extracted for exactly
   this reason. A second copy of this logic would disagree with the first
   within a week.

   ⛔ KEYED ON THE DEAL CODE. The API is /deals/:code/provider-history, not
   /providers/:id. The feed never publishes owner_user_id, so a worker's
   primary key stays off a public page and no one can enumerate histories by
   counting.

   ⛔ WHAT A ROW SHOWS: category, month/year, rating. Never the past customer,
   what they paid, what they wrote, or the exact day — they never agreed to
   appear on someone else's sales card. The endpoint does not return those
   fields; this file could not render them if it tried.
   ========================================================================= */
(function () {
  'use strict';

  var MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ⛔ THE SAME BASE THE FEED USES, read from the feed module rather than
     restated. These pages have no MSG_CONFIG — an earlier version of this file
     looked for one, found nothing, and silently declined to mount on every
     card. It would have shipped dead and looked like "the API is down".

     GopherDealsFeed.API is the deals COLLECTION url
     (https://api.gophergo.io/api/v1/deals); the provider history hangs off a
     single deal beneath it, so the collection url IS the prefix.

     window.GOPHER_DEALS_API overrides it for local testing, which is also how
     a copy of this page served from a scratchpad can point at a stub. */
  function apiBase() {
    if (window.GOPHER_DEALS_API) return String(window.GOPHER_DEALS_API);
    var f = window.GopherDealsFeed;
    return (f && f.API) || '';
  }

  /* ── ONE ROW ────────────────────────────────────────────────────────────
     Two lines with a real hierarchy, because this list is a conversion
     surface, not a log. The CATEGORY leads — it is what a customer is
     matching against their own need — with the taxonomy detail and the date
     stepped down beneath it, and the rating anchored right where the eye
     lands last.

     ⛔ An unrated job says "Not rated", never 0 or an empty star. A zero is a
     claim about the work and no customer made it. */
  function rowHtml(j) {
    var when = j.month && j.year ? MONTHS[j.month] + ' ' + j.year : '';
    var sub = [j.detail, when].filter(Boolean).join(' · ');
    var rating = j.rating == null
      ? '<span class="pjh-unrated">Not rated</span>'
      : '<span class="pjh-star">★ ' + esc(Number(j.rating).toFixed(1)) + '</span>';
    return '<li class="pjh-row">' +
      '<span class="pjh-main">' +
        '<span class="pjh-cat">' + esc(j.category) + '</span>' +
        (sub ? '<span class="pjh-sub">' + esc(sub) + '</span>' : '') +
      '</span>' +
      rating +
    '</li>';
  }

  /* ── RENDER ONE PAGE ────────────────────────────────────────────────────
     The server owns the slice now, so this draws whatever page it was handed
     and asks for the next one on click. No ceiling: a provider with 341 jobs
     is browsable to the 341st, and nobody downloads 341 rows to read ten. */
  function render(host, d, state) {
    var list = host.querySelector('.pjh-list');
    var jobs = d.jobs || [];
    var total = (d.showing && d.showing[d.scope]) != null
      ? d.showing[d.scope]
      : jobs.length;

    if (!jobs.length) {
      list.innerHTML = '<div class="pjh-empty">' +
        (d.scope === 'service'
          ? 'No completed service jobs yet.'
          : 'No completed jobs yet.') + '</div>';
    } else {
      var from = (d.page - 1) * d.per_page + 1;
      var to = from + jobs.length - 1;
      list.innerHTML =
        '<ul class="pjh-rows">' + jobs.map(rowHtml).join('') + '</ul>' +
        (d.pages > 1
          ? '<div class="pjh-pager">' +
              '<button type="button" class="pjh-page" data-pjh-page="' + (d.page - 1) + '"' +
                (d.page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">‹</button>' +
              '<span class="pjh-range">' + from + '–' + to + ' of ' + esc(total) + '</span>' +
              '<button type="button" class="pjh-page" data-pjh-page="' + (d.page + 1) + '"' +
                (d.page >= d.pages ? ' disabled' : '') + ' aria-label="Next page">›</button>' +
            '</div>'
          : '');
      list.querySelectorAll('[data-pjh-page]').forEach(function (b) {
        b.addEventListener('click', function () {
          load(host, state, d.scope, parseInt(b.getAttribute('data-pjh-page'), 10));
        });
      });
    }

    if (d.counts) {
      host.querySelector('[data-pjh-scope="service"]').textContent =
        'Previous service jobs (' + (d.counts.service || 0) + ')';
      host.querySelector('[data-pjh-scope="all"]').textContent =
        'All previous jobs (' + (d.counts.all || 0) + ')';
    }
    host.querySelectorAll('[data-pjh-scope]').forEach(function (b) {
      var on = b.getAttribute('data-pjh-scope') === d.scope;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* One page, fetched and drawn. Pages already seen are served from memory, so
     paging back is instant and a customer flicking between the two views does
     not re-hit the network for something they just looked at. */
  function load(host, state, scope, page) {
    var key = scope + ':' + page;
    if (state.cache[key]) { render(host, state.cache[key], state); return; }
    var list = host.querySelector('.pjh-list');
    if (list) list.setAttribute('aria-busy', 'true');
    fetch(state.base + '/' + encodeURIComponent(state.code) +
          '/provider-history?scope=' + encodeURIComponent(scope) +
          '&page=' + encodeURIComponent(page))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success) throw new Error('no history');
        state.cache[key] = d;
        if (list) list.removeAttribute('aria-busy');
        render(host, d, state);
      })
      .catch(function () { fallback(host); });
  }

  /* ⛔ Silent, and back to the honest message. A red error on a sales card
     tells a customer nothing they can act on and makes a working provider look
     broken. */
  function fallback(host) {
    host.innerHTML =
      '<div class="pjh-empty">Individual job records aren’t shown here yet ' +
      '— the totals above are this provider’s Gopher history.</div>';
  }

  /**
   * Mount the history into a container.
   * @param {HTMLElement} host  the element to fill
   * @param {string} dealCode   the live deal's code
   */
  function mount(host, dealCode) {
    if (!host || !dealCode) return;
    var base = apiBase();
    if (!base) return;               // not wired to a backend: leave as-is

    host.innerHTML =
      '<div class="pjh-tabs">' +
        '<button type="button" class="pjh-tab on" data-pjh-scope="service" aria-pressed="true">Previous service jobs</button>' +
        '<button type="button" class="pjh-tab" data-pjh-scope="all" aria-pressed="false">All previous jobs</button>' +
      '</div>' +
      '<div class="pjh-list"><div class="pjh-empty">Loading…</div></div>';

    var state = { base: base.replace(/\/$/, ''), code: dealCode, cache: {} };
    host.querySelectorAll('[data-pjh-scope]').forEach(function (b) {
      /* Switching view always returns to page 1 — landing on page 4 of a list
         you have not seen is disorienting. */
      b.addEventListener('click', function () {
        load(host, state, b.getAttribute('data-pjh-scope'), 1);
      });
    });
    load(host, state, 'service', 1);
  }

  function injectStyle() {
    if (document.getElementById('pjh-style')) return;
    var st = document.createElement('style');
    st.id = 'pjh-style';
    st.textContent =
      /* ⛔ THE CARD'S OWN BUTTON, copied from .profile-message-btn — the Text
         button sitting directly above these. Same radius, padding, family,
         weight, letter-spacing and shadow, so the three controls on this card
         read as one set. Earlier passes used HQ pills and then text links;
         both were borrowed vocabulary.

         var(--navy) rather than a literal, deliberately: it inherits whatever
         navy the host page uses, so these can never be a different navy from
         the button 20px above them. (Request's --navy is #2a3654, which is
         off-brand versus #002461 — a known, pre-existing page-level issue and
         not this control's to fix, but matching it is still right.)

         Selected is GOPHER GREEN WITH NAVY INK — never white on green, per the
         brand rule. Centered as a pair. */
      '.pjh-tabs{display:flex;justify-content:center;gap:10px;' +
        'margin:4px 0 14px;flex-wrap:wrap}' +
      '.pjh-tab{flex:0 1 auto;white-space:nowrap;' +
        'font-family:\'Nunito\',sans-serif;font-weight:800;font-size:13px;' +
        'letter-spacing:.3px;border:none;border-radius:10px;padding:11px 18px;' +
        'cursor:pointer;transition:all .15s;' +
        'background:var(--navy,#002461);color:#fff;' +
        'box-shadow:0 4px 12px rgba(26,42,94,.25)}' +
      '.pjh-tab.on{background:var(--green,#33d975);color:var(--navy,#002461);' +
        'box-shadow:0 4px 12px rgba(51,217,117,.35)}' +
      '.pjh-tab:hover{transform:translateY(-1px)}' +
      '.pjh-tab:focus-visible{outline:2px solid var(--navy,#002461);outline-offset:2px}' +
      '@media (prefers-reduced-motion: reduce){.pjh-tab{transition:none}' +
        '.pjh-tab:hover{transform:none}}' +
      /* ── THE LIST ────────────────────────────────────────────────────
         Rows sit on their own white surface inside the card's blue panel, so
         the history reads as a distinct block rather than text dropped under
         the buttons. Generous row height, hairline separators, and the rating
         column aligned so a customer can scan straight down it. */
      '.pjh-list{max-width:460px;margin:0 auto}' +
      /* ⛔ text-align:left EXPLICITLY. The host element is a centred empty-state
         container, and the rows inherited that — centred category and date in
         a list is unreadable: the eye has no left edge to run down. This is
         the difference between a list and a paragraph of rows. */
      '.pjh-rows{list-style:none;margin:0;padding:2px 0;background:#fff;' +
        'text-align:left;border-radius:12px;' +
        'box-shadow:0 1px 3px rgba(26,42,94,.08)}' +
      '.pjh-row{display:flex;align-items:center;gap:12px;padding:11px 14px;' +
        'border-bottom:1px solid rgba(26,42,94,.07)}' +
      '.pjh-row:last-child{border-bottom:none}' +
      '.pjh-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
      '.pjh-cat{font-family:\'Nunito\',sans-serif;font-weight:800;font-size:13.5px;' +
        'color:var(--navy,#002461);white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis}' +
      '.pjh-sub{font-size:11.5px;color:#64748B;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis}' +
      /* Tabular figures so the ratings line up down the column. */
      '.pjh-star{flex:none;font-weight:800;font-size:13px;color:var(--navy,#002461);' +
        'font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '.pjh-unrated{flex:none;font-size:11.5px;color:#94A3B8;white-space:nowrap}' +
      '.pjh-empty{color:#64748B;font-size:12.5px;padding:14px 0;text-align:center}' +

      /* ── THE PAGER ───────────────────────────────────────────────────
         Quiet by design: it is a way through the list, not a call to action.
         The arrows are circular targets big enough for a thumb; the range
         between them says exactly where you are and how much there is. */
      '.pjh-pager{display:flex;align-items:center;justify-content:center;' +
        'gap:14px;padding:10px 0 2px}' +
      '.pjh-page{width:30px;height:30px;border-radius:50%;border:1px solid ' +
        'rgba(26,42,94,.18);background:#fff;color:var(--navy,#002461);' +
        'font-size:15px;line-height:1;cursor:pointer;transition:all .15s}' +
      '.pjh-page:hover:not(:disabled){background:var(--navy,#002461);color:#fff}' +
      '.pjh-page:disabled{opacity:.35;cursor:default}' +
      '.pjh-page:focus-visible{outline:2px solid var(--navy,#002461);outline-offset:2px}' +
      '.pjh-range{font-size:12px;font-weight:700;color:#64748B;' +
        'font-variant-numeric:tabular-nums}' +
      '@media (prefers-reduced-motion: reduce){.pjh-page{transition:none}}';
    document.head.appendChild(st);
  }

  /* ── SELF-WIRING ────────────────────────────────────────────────────────
     Both pages build the provider card from a template string, at different
     points in different flows, and the card is re-rendered whenever the modal
     re-opens. Hooking two render paths means two places to forget; marking the
     spot in the markup and watching for it means one.

     Cheap by construction: the observer only ever looks at ADDED nodes, acts
     only on [data-pjh] carrying a code, and stamps each one so a re-render
     mounts again but a re-observation does not. */
  var MOUNTED = 'pjhDone';

  function wire(root) {
    if (!root || !root.querySelectorAll) return;
    var hosts = [];
    if (root.matches && root.matches('[data-pjh]')) hosts.push(root);
    Array.prototype.push.apply(hosts, root.querySelectorAll('[data-pjh]'));
    hosts.forEach(function (h) {
      if (h.dataset[MOUNTED]) return;
      var code = h.getAttribute('data-pjh');
      if (!code) return;             // demo card, or a deal with no code
      h.dataset[MOUNTED] = '1';
      mount(h, code);
    });
  }

  injectStyle();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes || [], function (n) {
          if (n.nodeType === 1) wire(n);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState !== 'loading') wire(document.body);
  else document.addEventListener('DOMContentLoaded', function () { wire(document.body); });

  /* Exposed so a page can mount explicitly if it ever needs to. */
  window.GopherProviderHistory = { mount: mount, wire: wire };
}());
