/* ═══════════════════════════════════════════════════════════════════════════
   gopher-web-pt-bridge.js — PT ("playground") bridge for the WEB surfaces.

   WHAT THIS IS
   ------------
   `_prototypes/split-screen.html` runs the Request PROTOTYPE against the Go
   prototype by talking to `window.GReq` — a tiny sessionStorage store the
   prototype publishes. The WEB apps (Final/gopher-request.html,
   Final/gopher-connect.html) have no such store: their requests live in
   `const DASH_DATA` inside the dashboard IIFE, which is script-scoped and
   therefore invisible to `frame.contentWindow`.

   This module is the missing half. Each web app installs it from inside its
   own dashboard IIFE, handing over a small host adapter; the module publishes
   `window.GWeb` — a GReq-SHAPED view of the dashboard store, so the harness
   can reuse split-screen.html's relay logic almost verbatim.

   IT CANNOT RUN IN PRODUCTION.
   PT requires BOTH `?pt=1` AND a development host (localhost / 127.0.0.1 /
   *.local / *.trycloudflare.com). On the three live hosts `install()` returns
   null, nothing is published, and not one line of app behaviour changes — the
   flag is not merely dormant there, it is unreachable. This matters because
   `Final/` is rsynced to those hosts WHOLESALE, so this file ships whether or
   not anyone intends to publish it.

   The flag is read from `location.search` ONLY — deliberately NOT sticky in
   sessionStorage. Sticky PT is how the prototype's GReq store once
   cross-contaminated a normal visit (see its comment); the web apps must never
   carry PT into an ordinary session, because PT empties the dashboard.

   HOST ADAPTER (all required unless marked optional)
   --------------------------------------------------
     surface   'request' | 'connect'          — which app is installing
     DASH_DATA the dashboard store object
     dashState the dashboard's UI state object
     startJob  fn(rec)  — flips pending → in-progress and builds rec.live
     render    fn()     — re-render the active-request cards
     cancel    fn(id)   — optional; window.__cancelDashboardRequest
     recount   fn()     — optional; KPI recount

   A MISSING HELPER THROWS. It never degrades to a silent no-op — the same
   rule gopher-step-gates.js follows, and for the same reason: a bridge that
   quietly half-works produces a confident wrong reading of the seam.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── Where PT is allowed to exist at all ────────────────────────────────
     `Final/` is rsynced to the live hosts WHOLESALE, so this file ships whether
     or not anyone means to publish it. The ?pt=1 flag alone would then leave a
     mode on a public site that anyone could enter by guessing a query
     parameter — and entering it empties the visible dashboard. That is not a
     mode a live site should have.

     So PT additionally requires a DEVELOPMENT host. This is an ALLOWLIST, not a
     denylist of the three known production hosts: fail-closed means a host
     nobody thought of is denied rather than silently permitted. trycloudflare
     is included because scripts/preview-tunnel.sh shares previews from there. */
  function devHost() {
    try {
      var h = location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h === ''
          || /\.local$/.test(h) || /(^|\.)trycloudflare\.com$/.test(h)) return true;

      /* The prototype twin — johncnewbury.github.io/Gopher-Marketplace-Prototype/.
         HOSTNAME ALONE IS NOT ENOUGH, and this is the whole reason the rule looks
         different from the others: PRODUCTION IS THE SAME HOSTNAME, served from
         /Gopher-Marketplace/. Allowing the host outright would put ?pt=1 on the
         live site, where entering it empties the visible dashboard. So this entry
         is host + PATH PREFIX.

         The two prefixes cannot collide in either direction — the slash after
         "Marketplace" is what separates /Gopher-Marketplace/ from
         /Gopher-Marketplace-Prototype/. Drop it and production opens up.

         Iframed Final/ pages inherit the prefix (…-Prototype/gopher-request.html),
         so no window.top check is needed and none should be added: top-frame
         sniffing breaks the moment a pane is opened in its own tab, which is a
         thing the harness deliberately supports. */
      return h === 'johncnewbury.github.io'
          && /^\/Gopher-Marketplace-Prototype\//.test(location.pathname);
    } catch (_) { return false; }
  }

  /* Query string only — see the header note on why this is not sticky. */
  function ptOn() {
    if (!devHost()) return false;
    try { return new URLSearchParams(location.search).get('pt') === '1'; }
    catch (_) { return false; }
  }

  /* ── Category ───────────────────────────────────────────────────────────
     The Go prototype routes an injected job into a category feed by slug, so
     the slug has to survive the broadcast. Both web apps now pass `category`
     explicitly; ICON_CAT is the backstop for the seeded demo records (and any
     future caller that forgets), so a bridged record is never category-less. */
  var ICON_CAT = {
    '🚚': 'delivery', '📦': 'delivery', '🛒': 'delivery',
    '🏠': 'home', '🔧': 'home', '🧹': 'home',
    '🗑️': 'junk', '🗑': 'junk',
    '📮': 'moving', '🚛': 'moving',
    '💪': 'labor', '🪴': 'yard', '🌳': 'yard',
    '🚗': 'ride', '🚙': 'ride'
  };
  /* The other direction, for a request ADOPTED from the requester's phone: the
     app carries a category slug and no icon, and the web dashboard renders the
     icon. One entry per slug — deliberately not derived by inverting ICON_CAT,
     which is many-to-one and would pick whichever alias happened to be last. */
  var CAT_ICON = {
    delivery: '🚚', home: '🏠', junk: '🗑️', moving: '📮',
    labor: '💪', yard: '🪴', ride: '🚗', other: '📋'
  };
  function catOf(rec) {
    if (rec.category) return String(rec.category).toLowerCase();
    var byIcon = ICON_CAT[rec.icon];
    if (byIcon) return byIcon;
    var t = String(rec.title || '').toLowerCase();
    if (/deliver|errand|grocer/.test(t)) return 'delivery';
    if (/junk|haul/.test(t))             return 'junk';
    if (/mov(e|ing)/.test(t))            return 'moving';
    if (/yard|lawn|landscap/.test(t))    return 'yard';
    if (/ride|drive|driver/.test(t))     return 'ride';
    if (/labor|hourly/.test(t))          return 'labor';
    if (/home|office|repair|install/.test(t)) return 'home';
    return 'other';
  }

  /* ── Stage ──────────────────────────────────────────────────────────────
     The web record's `status` and the prototype's `stage` are the same idea
     under different names. The harness reads `stage`, so map once, here —
     never re-derive it at a call site. */
  function stageOf(rec) {
    switch (String(rec.status || '')) {
      case 'pending':     return 'searching';
      case 'in-progress': return 'active';
      case 'scheduled':   return 'scheduled';
      case 'completed':   return 'completed';
      default:            return rec.userStarted ? 'active' : 'searching';
    }
  }

  /* Worker progress, read off the live tracker's step list. The Go app speaks
     in substages; the web app speaks in {k,done} steps. This is the join. */
  var STEP_SUBSTAGE = {
    'In-Progress': 'in-progress', 'Driver en route': 'in-progress',
    'Items Purchased': 'purchased', 'Items Picked-Up': 'picked-up',
    'Arrived': 'arrived', 'Completed': 'completed'
  };
  function substageOf(rec) {
    var steps = rec.live && rec.live.statusSteps;
    if (!Array.isArray(steps)) return null;
    var last = null;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] && steps[i].done && STEP_SUBSTAGE[steps[i].k]) last = STEP_SUBSTAGE[steps[i].k];
    }
    return last;
  }

  /* ── Timing copy ────────────────────────────────────────────────────────
     `rec.when` is REQUESTER-facing dashboard copy ("Just now · awaiting your
     selection"). Broadcasting it verbatim puts the customer's own status line
     on the worker's job card, where "awaiting your selection" is meaningless
     and slightly wrong — the worker is not selecting anything. Strip the
     requester half and hand the Go app the timing alone. */
  function workerWhen(rec) {
    var w = String(rec.when || '').replace(/\s*·\s*awaiting (your )?selection\s*$/i, '').trim();
    if (!w) return 'Now · ASAP';
    if (/^just now$/i.test(w)) return 'Now · ASAP';
    return w;
  }

  function hiredOf(rec) {
    var w = (rec.interestedWorkers || []).filter(function (x) { return x.status === 'hired'; })[0];
    return w ? w.name : null;
  }

  function install(host) {
    if (!ptOn()) return null;

    /* Fail LOUD on a bad adapter. A bridge that silently no-ops would let the
       harness report "no requests" and look like a working empty state. */
    ['surface', 'DASH_DATA', 'dashState', 'startJob', 'render'].forEach(function (k) {
      if (host == null || host[k] == null) {
        throw new Error('GopherWebPT.install: host adapter is missing "' + k + '"');
      }
    });

    var D = host.DASH_DATA;
    var SURFACE = host.surface;

    /* ── The playground starts EMPTY ─────────────────────────────────────
       Opening the dashboard seeds ~8 demo requests straight into
       DASH_DATA.activeRequests. They are indistinguishable from real ones by
       shape, so without this the harness broadcasts the demo seed to the Go
       phone as if a person had just submitted it — the Go feed shows jobs
       nobody requested, which is precisely the "one shared store, two phones
       disagreeing" failure the prototype's own ptEmpty() exists to prevent.

       Discrimination is by PROVENANCE, not by content: only a record that came
       through __createDashboardRequest (i.e. through the real flow) is tagged
       __ptOwn. The seed is pushed onto the array directly and so is never
       tagged. all() filters on the tag; purgeSeed() also drops the untagged
       ones from the dashboard itself, so both panes start empty. */
    (function tagRealSubmissions(){
      var orig = root.__createDashboardRequest;
      if (typeof orig !== 'function') return;
      root.__createDashboardRequest = function (data) {
        var id = orig.apply(this, arguments);
        try {
          var list = D.activeRequests || [];
          var rec = list.filter(function (r) { return r.id === id; })[0];
          if (rec) {
            rec.__ptOwn = true;
            /* The app's id counter restarts at zero on every page load, but a
               restored world (below) already holds ids from the previous visit —
               so a second submit after navigating away and back would reuse an
               id the Go phone has already seen, and the two panes would silently
               be talking about different jobs under one name. Re-key the NEW
               record; it has not been broadcast yet, so nothing else refers to
               it. */
            var clash = list.filter(function (r) { return r.id === id; }).length > 1;
            if (clash) {
              var n = 2;
              var base = id;
              while (list.filter(function (r) { return r.id === base + '-' + n; }).length) n++;
              rec.id = base + '-' + n;
              id = rec.id;
            }
          }
          persist();
        } catch (_) {}
        return id;
      };
    })();

    /* ── Per-surface world, so navigating the SITE does not wipe the playground ──
       The web apps hold DASH_DATA in memory only, so following the site's own
       Connect↔Request link would drop every request the requester had made. That
       breaks the one thing this playground is for: continuity across surfaces.
       The PT world is therefore snapshotted per surface and restored on install.

       Per SURFACE, deliberately — a Connect business request and a consumer
       Request are different products under different accounts, and pooling them
       would invent a relationship the real system does not have. sessionStorage,
       not localStorage: the world should die with the tab, exactly as the
       prototype's own PT store does. */
    var WORLD_KEY = 'gopher_pt_world_' + SURFACE;

    /* Nothing may be written back until the world has actually been established
       (seed purged, saved records restored). Opening the dashboard REPLACES
       D.activeRequests with the demo seed some time after install(), so there is
       a window in which the real requests are simply not in the array yet — a
       persist() landing there would overwrite the saved world with an empty one
       and silently destroy the requester's work. */
    var worldReady = false;

    function persist() {
      if (!worldReady) return;
      try {
        var own = (D.activeRequests || []).filter(function (r) { return r.__ptOwn; });
        sessionStorage.setItem(WORLD_KEY, JSON.stringify(own));
      } catch (_) {}
    }

    function restore() {
      try {
        var raw = sessionStorage.getItem(WORLD_KEY);
        if (!raw) return 0;
        var saved = JSON.parse(raw);
        if (!Array.isArray(saved) || !saved.length) return 0;
        D.activeRequests = D.activeRequests || [];
        var have = {};
        D.activeRequests.forEach(function (r) { have[r.id] = true; });
        var n = 0;
        saved.forEach(function (r) { if (r && r.id && !have[r.id]) { D.activeRequests.push(r); n++; } });
        return n;
      } catch (_) { return 0; }
    }

    /* Collections that represent WORK THAT HAPPENED or WORKERS YOU KNOW. In the
       playground every one of these must be built by a real interaction across
       the two panes, so all of them start empty. Account furniture
       (profile, paymentMethods, users, business, saved addresses) is NOT in
       this list — a real requester legitimately has those, and blanking them
       would break the flow rather than make it honest. */
    var FAKE_ACTIVITY = ['previousRequests', 'cancelledRequests', 'expiredRequests',
                         'myGophers', 'goTos', 'referrals'];

    function purgeSeed() {
      var changed = false;

      // Requests: keep only what came through the real flow (see __ptOwn above).
      var list = D.activeRequests || [];
      var kept = list.filter(function (r) { return r.__ptOwn; });
      if (kept.length !== list.length) {
        list.length = 0;
        kept.forEach(function (r) { list.push(r); });
        changed = true;
      }

      // Everything else fake: history, saved workers, referrals.
      FAKE_ACTIVITY.forEach(function (k) {
        if (Array.isArray(D[k]) && D[k].length) { D[k].length = 0; changed = true; }
      });

      // Bring the saved world back AFTER the seed is gone — restoring before the
      // dashboard has seeded means the seeding wipes what was restored.
      if (restore()) changed = true;

      worldReady = true;
      if (!changed) { persist(); return false; }
      if (host.recount) { try { host.recount(); } catch (_) {} }
      host.render();
      persist();
      return true;
    }

    /* What the playground still holds. Used by the harness's self-check to prove
       the world is empty rather than assuming it. */
    function world() {
      var out = { activeRequests: (D.activeRequests || []).length };
      FAKE_ACTIVITY.forEach(function (k) { if (D[k]) out[k] = D[k].length; });
      return out;
    }

    /* ── READ: dashboard record → GReq-shaped record ──────────────────────
       Field names deliberately match the prototype's GReq contract so
       split-screen.html's `orderFromReq()` works against either surface
       unchanged. Anything the web app genuinely does not carry is emitted as
       an explicit falsy default rather than left undefined — an undeclared
       field read as `undefined` instead of `false` is exactly the defect
       class the parity work exists to prevent. */
    function norm(rec) {
      if (!rec) return null;
      var pickups  = Array.isArray(rec.pickups)  ? rec.pickups  : [];
      var dropoffs = Array.isArray(rec.dropoffs) ? rec.dropoffs : [];
      return {
        /* identity + routing */
        order: rec.id,
        surface: SURFACE,
        cat: catOf(rec),
        title: rec.title || 'New request',
        scope: rec.descriptionFull || rec.title || '',

        /* lifecycle */
        stage: stageOf(rec),
        substage: substageOf(rec),
        hired: hiredOf(rec),
        accepted: (rec.interestedWorkers || []).filter(function (w) { return w.status === 'hired'; }).length,
        cancelled: !!rec.__ptCancelled,
        gCancelled: !!rec.__ptGopherCancelled,
        cancelReason: rec.__ptCancelReason || null,
        confirmed: !!rec.confirmed,
        rating: rec.__ptRating || null,
        /* The web owns this state machine: 'entry' (reason box open) →
           'disputed' (submitted). `disputeReason` is the requester's own words,
           read straight from #disputeReason — do not paraphrase it onward. */
        disputeState: rec.disputeState || null,
        disputeReason: rec.disputeReason || '',

        /* money + crew */
        bids: !!rec.bidsMode,
        pay: +rec.perWorkerCost || 0,
        cost: +rec.costOfItems || 0,
        workers: +rec.workersNeeded || 1,
        offerBand: rec.offerBand || null,
        workerSelection: (function (v) {
          v = String(v || 'first');
          return v === 'prioritize' ? 'my' : v;   // legacy alias — see INV-ACCEPT
        })(rec.workerSelection),

        /* job facts the worker decides on */
        ageRestricted: !!rec.ageRestricted,
        trustShield: !!(rec.idVerification && rec.idVerification.method === 'trustshield'),
        pickup: pickups[0] || '',
        dropoff: dropoffs[0] || '',
        pickupStairs: +rec.pickupStairs || 0,
        destStairs: +rec.destStairs || 0,
        serviceElevatorPickup: !!rec.serviceElevatorPickup,
        serviceElevatorDest: !!rec.serviceElevatorDest,
        dist: rec.distanceMi != null ? String(rec.distanceMi) : '2.4',

        /* timing */
        scheduledForLater: !!rec.scheduledForLater,
        timingLabel: workerWhen(rec),
        when: workerWhen(rec),

        /* turn-by-turn navigation — set only by the Go app, cleared on a status
           advance. Nothing on the live site writes it, so the web's nav line
           renders only when a real worker app is connected. */
        navTo: rec.navTo || null,
        navAddr: rec.navAddr || '',

        /* No-show (G40-192 / G40-419). Mirrors the live requester app's payload:
           `requestor_reminded` + `requestor_reminded_at`, the SERVER's stamp of
           when POST orders/:id/gopher_reached succeeded. The web block derives
           the deadline from that stamp, exactly as helpers/noShow.js does —
           never from this device's clock, which is the defect G40-192 records
           against the shipped client. `noShow` is the terminal outcome. */
        noShow: !!rec.noShow,
        noShowReminded: !!rec.noShowReminded,
        noShowRemindedAt: rec.noShowRemindedAt || null,

        /* deals provenance */
        deal: !!rec.fromDeal || !!rec.dealKind,
        dealMerchant: rec.dealMerchant || '',
        directBooking: rec.dealKind === 'service',
        provider: rec.providerName || '',
        directTo: rec.dealKind === 'service' ? (rec.providerName || '') : '',

        /* relay bookkeeping — owned by the harness, carried on the record so a
           reload cannot replay an event that already fired */
        resubmitSeq: +rec.__ptResubmitSeq || 0,
        counterSeq: +rec.__ptCounterSeq || 0,
        adjustSeq: +rec.__ptAdjustSeq || 0,
        reqCancelSeq: +rec.__ptReqCancelSeq || 0,
        requestor: (D.profile && D.profile.name) || 'A requester'
      };
    }

    /* ── reviewSnapshot ─────────────────────────────────────────────────────
       ⚠️ FINDING, not just a bridge workaround. In Request, `reviewSnapshot`
       exists ONLY on the five seeded demo records — `__createDashboardRequest`
       never builds one. Two money features read through it and fail closed
       without it: `buildAdjustmentCard()` returns '' (the cost-adjustment card
       cannot render at all) and `acceptCounterOffer()` guards `if (C && snap)`
       (an accepted counter does NOT update the price). So on the live Request
       app both work for demo data and silently do nothing for a request a real
       user created. Connect builds one in its capture payload; Request does not.

       The playground cannot exercise either path without a snapshot, so it
       synthesizes the minimum shape. That is a scaffold for the harness — the
       underlying gap belongs to Request and is recorded in the handoff doc. */
    function ensureSnapshot(rec) {
      if (!rec || rec.reviewSnapshot) return rec && rec.reviewSnapshot;
      var offer = +rec.perWorkerCost || 0, cost = +rec.costOfItems || 0;
      var cog = offer + cost;
      var itf = Math.round(0.08 * (cog + 0.99) * 100) / 100;
      var reqFee = Math.round((0.99 + itf) * 100) / 100;
      var total = Math.round((cog + reqFee) * 100) / 100;
      rec.reviewSnapshot = {
        costOfItems: cost, workerPay: offer, workersNeeded: +rec.workersNeeded || 1,
        bidsMode: !!rec.bidsMode, total: total,
        fee: { gopherFee: 0.99, ageFee: 0, instantTransfer: itf, requestFee: reqFee,
               fullGopherFee: 0.99, fullAgeFee: 0, fullInstantTransfer: itf, fullRequestFee: reqFee,
               promo: null, promoDiscount: 0, trustShieldDiscount: 0,
               cogOffer: cog, gmvTotal: total },
        __ptSynthesized: true
      };
      return rec.reviewSnapshot;
    }

    /* ── ADOPT: a request the REQUESTER'S PHONE created ───────────────────
       The requester exists on a phone and in a browser, and in production one
       server serves both. The Request app prototype writes its own submissions
       straight into GReq (gopher-request-flow.html -> buildPending -> GReq.add),
       and until this existed the web pane simply could not see them: the toggle
       mirrored web -> app and nothing came back.

       ⚠️ IT GOES THROUGH THE REAL CREATE PATH, NOT A HAND-BUILT RECORD.
       `__createDashboardRequest` is what the web flow itself calls, so an adopted
       request gets the same shape, the same defaults and the same downstream
       behaviour as one typed into the browser. Assembling a DASH_DATA object here
       would have been quicker and would have drifted the first time the web
       flow's payload changed — which is the entire class of bug the parity work
       exists to catch.

       ⚠️ THE ID IS FORCED TO THE APP'S OWN ORDER NUMBER. The two stores must
       agree on identity or the panes end up discussing different jobs under one
       name. The app numbers from GR-00128 up and the web from GR-0002, so they
       cannot collide; re-keying is safe here because nothing has broadcast the
       record yet (same reasoning, and the same move, as the clash re-key above).

       ⚠️ `__ptAdopted` is stamped on the GReq side by the harness, not here —
       provenance has to survive a page reload, and anything this module holds in
       memory does not. */
    function adopt(g) {
      if (!g || !g.order) return null;
      if (typeof root.__createDashboardRequest !== 'function') return null;
      if (raw(g.order)) return raw(g.order);              // already adopted
      var cat = String(g.cat || '').toLowerCase() || 'other';
      var pay = +g.pay || 0, cost = +g.cost || 0, workers = +g.workers || 1;
      var pickups  = g.pickup  ? [g.pickup]  : [];
      var dropoffs = g.dropoff ? [g.dropoff] : [];
      var id;
      try {
        id = root.__createDashboardRequest({
          icon: CAT_ICON[cat] || '📋',
          title: g.title || 'New request',
          category: cat,
          costOfItems: cost,
          descriptionFull: (g.description || g.scope || '').trim(),
          perWorkerCost: pay,
          workersNeeded: workers,
          amountLabel: pay ? ('$' + (pay * workers).toFixed(2) + ' total') : '',
          when: g.when || g.timingLabel || '',
          scheduledForLater: !!g.scheduledForLater,
          ageRestricted: !!g.ageRestricted,
          idRequiredAtCompletion: !!g.ageRestricted,
          bidsMode: !!g.bids,
          firstAvailable: (g.workerSelection || 'first') === 'first',
          workerSelection: g.workerSelection || 'first',
          hasPickup: !!g.pickup,
          pickups: pickups,
          dropoffs: dropoffs,
          pickupStairs: +g.pickupStairs || 0,
          destStairs: +g.destStairs || 0,
          serviceElevatorPickup: !!g.serviceElevatorPickup,
          serviceElevatorDest: !!g.serviceElevatorDest,
          interestedWorkers: [],
          dealKind: g.deal ? 'deal' : null,
          providerName: null
        });
      } catch (_) { return null; }
      var list = D.activeRequests || [];
      var rec = list.filter(function (r) { return r.id === id; })[0];
      if (!rec) return null;
      rec.id = g.order;
      rec.__ptOwn = true;
      rec.__ptFromApp = true;      /* so the harness can narrate WHERE it came from */
      /* TrustShield rides with ageRestricted and must never be separated from it
         — the app's own record carries that warning for the same reason. */
      rec.trustShield = !!g.trustShield;
      ensureSnapshot(rec);
      persist();
      return rec;
    }

    function rawList() {
      return (D.activeRequests || []).filter(function (r) { return r.__ptOwn; });
    }
    function raw(id)   { return rawList().filter(function (r) { return r.id === id; })[0] || null; }

    /* ── WRITE ────────────────────────────────────────────────────────────
       Every mutation goes through here and ends in a render, so the harness
       never has to know how either app paints its cards. */
    function patch(id, p) {
      var rec = raw(id);
      if (!rec) return null;
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) rec[k] = p[k];
      host.render();
      return rec;
    }

    /* A Gopher on the Go phone accepted. What that MEANS is INV-ACCEPT's
       call, not the harness's:
         'first'  → the acceptance IS the hire (auto-hire, then startJob)
         'select' → a candidacy the requester must Hire in the dashboard
         'my'     → auto-hire only if they are already a MY Gopher
       This is the single most important thing the playground exercises, so it
       is decided in one place and read from the record's own mode. */
    function offer(id, worker) {
      var rec = raw(id);
      if (!rec) return null;
      var name = worker && worker.name;
      if (!name) return null;

      rec.interestedWorkers = rec.interestedWorkers || [];
      var existing = rec.interestedWorkers.filter(function (w) { return w.name === name; })[0];
      var entry = existing || {
        name: name,
        badge: worker.tier || 'elite+',
        tier: worker.tier || 'elite+',
        photo: worker.photo || '',
        tagline: worker.tagline || 'Accepted your request on Gopher Go.',
        stats: worker.stats || ['⭐ 4.96 (412 jobs)', (worker.dist || '2.4') + ' mi away', 'Available now'],
        distanceMi: worker.distanceMi != null ? worker.distanceMi : null,
        status: 'interested',
        justAccepted: true,
        /* Carried, not dropped. The `my` branch below and the web's own
           renderer both read `w.isMyGopher`; the entry never copied it, so the
           field only ever worked through __myGopherNames(). A caller that
           passed it got silence. */
        isMyGopher: !!worker.isMyGopher,
        fromGoApp: true
      };
      if (!existing) rec.interestedWorkers.unshift(entry);

      var mode = String(rec.workerSelection || 'first');
      if (mode === 'prioritize') mode = 'my';
      /* ── The >15 mi pause is a STANDARD-TIER rule (owner, 2026-09-01: "keep
         exact same as live app, this carries"). Live gates it on
         `gopher_type_id === 0`, and 0 is STANDARD —
         `GOPHER_TYPE = { STANDARD:0, PRO:1, PRO_PLUS:2 }`; the backend's own
         claim-limits helper spells it out: "STANDARD GOPHERS ONLY ... Elite /
         Elite+ / Pro are unaffected." A tiered worker is hired immediately
         however far out they are.
         ⚠️ Supersedes the flat 2026-08-22 rule that paused everyone. Same tier
         test D-026 uses for the counter cap — one discriminator, two rules. */
      var tierStr = String(entry.tier || entry.badge || '').toLowerCase();
      var isStandard = !/^(elite|pro)/.test(tierStr);
      var far = isStandard && entry.distanceMi != null && Number(entry.distanceMi) > 15;
      var autoHire = false;
      if (mode === 'first' && !far) autoHire = true;
      if (mode === 'my') {
        var mine = (typeof root.__myGopherNames === 'function') ? root.__myGopherNames() : [];
        /* Live requires `!distance_exceeded` before a hand-picked favourite is
           auto-hired — the fav branch sits inside the same guard in assign_order.
           This ignored distance entirely, so a far Standard favourite was hired
           where live would have asked the requester first. */
        autoHire = (entry.isMyGopher || mine.indexOf(name) > -1) && !far;
      }

      if (autoHire) {
        entry.status = 'hired';
        entry.autoHired = true;
        /* ⛔ AUTO-START IS THE CANON, not a shortcut. Owner ruling 2026-08-31:
           the First Available behaviour "already exists — use it". The live
           requester app states it outright (gopher-mobile-request
           src/component/modalContent.js, the `firstAvailable` modal):

             "When selecting First Available, the first Gopher to accept your
              request is off to the races to get what you need done!"
             "This option requires little to no engagement on your part."

           A Start-job gate contradicts that in plain words — it is engagement,
           and it is required. The live requester app has NO start-job step at
           all (zero hits for start job / startJob / start_job across its src),
           so the button is a web-only artifact rather than a product step.

           An earlier version of this bridge DID auto-start here; I removed it to
           avoid "hiding a divergence". That was wrong: it was not a divergence
           to preserve, it was web drift from a stated rule. `startJob` is also
           what builds `rec.live` (tracker + crew cards), so calling it is how
           the requester gets a live view at all — not merely a status flip.

           NOTE this covers 'first' and the auto-hired half of 'my'. The
           'select' path — where the requester deliberately picks a worker — is
           NOT changed here: they are engaged by definition, and the owner scoped
           today's ruling to First Available. Recorded in the scope doc. */
        host.startJob(rec);
        if (host.recount) host.recount();
      } else {
        rec.needsAttention = true;
        rec.worker = rec.interestedWorkers.length + ' worker'
                   + (rec.interestedWorkers.length !== 1 ? 's' : '') + ' interested';
      }
      host.render();
      return { hired: autoHire, mode: mode };
    }

    /* The requester pressed Hire on a candidacy — the job goes Active on both
       phones. Separate from offer() because under 'select'/'my' these are two
       distinct moments, and collapsing them is what made every acceptance
       look like an auto-hire in the prototype harness. */
    function hire(id, name) {
      var rec = raw(id);
      if (!rec) return false;
      var w = (rec.interestedWorkers || []).filter(function (x) { return x.name === name; })[0];
      if (!w) return false;
      w.status = 'hired';
      w.justAccepted = false;
      host.startJob(rec);
      if (host.recount) host.recount();
      host.render();
      return true;
    }

    /* Worker progress → the live tracker's step list. Marks the named step and
       everything before it done, which is what the tracker renders from. */
    function substage(id, stepKey, opts) {
      var rec = raw(id);
      if (!rec || !rec.live || !Array.isArray(rec.live.statusSteps)) return false;
      var steps = rec.live.statusSteps;
      var idx = -1;
      for (var i = 0; i < steps.length; i++) if (steps[i].k === stepKey) idx = i;
      if (idx < 0) return false;
      for (var j = 0; j <= idx; j++) steps[j].done = true;
      if (stepKey === 'Completed') {
        rec.status = 'completed';
        rec.statusLabel = 'Completed';
        rec.needsAttention = true;          // requester must confirm before payout
        /* buildCompletionBlock() renders NOTHING unless the record carries
           `awaitingConfirmation` (or `confirmed`). Without this the Gopher could
           mark a job complete and the requester had no way to confirm, dispute,
           rate, or favourite them — the request just sat "completed" while the
           detail screen still offered "Start job". It also silently blocked the
           only honest route to MY Gophers, which is earned by favouriting a
           Gopher from a COMPLETED job — so "Prioritize MY Gophers" (locked until
           you have one) could never be unlocked at all. */
        rec.awaitingConfirmation = true;
        /* Drop-off photos the worker took. Both sides speak the same dialect —
           a plain array of image src strings (Go: `j.completionPhotos =
           photos.slice()`; web: `photos.map(p => <img src="${p}">)`) — so this
           is a straight copy, NOT a re-shaping. The completion-details modal
           omits the section entirely when the array is empty, so an unphotographed
           job stays clean rather than rendering an empty gallery. */
        if (opts && Array.isArray(opts.photos) && opts.photos.length) {
          rec.completionPhotos = opts.photos.slice();
        }
      }
      host.render();
      return true;
    }

    /* A counter-offer from the Go phone, in the shape the dashboard's counter
       card + breakdown modal already read (r.counterOffers). */
    function counter(id, co) {
      var rec = raw(id);
      if (!rec) return false;
      ensureSnapshot(rec);
      rec.counterOffers = rec.counterOffers || [];
      rec.counterOffers.push({
        changed: co.changed || 'offer',
        comment: co.comment || null,
        fromGoApp: true,
        worker: {
          name: co.worker || 'Your Gopher',
          badge: co.tier || 'elite+',
          photo: '',
          tagline: 'Countered from the Gopher Go app.',
          stats: ['⭐ 4.96 (412 jobs)', (co.dist || '2.4') + ' mi away', 'Available now']
        },
        counter: co.counter || {}
      });
      rec.needsAttention = true;
      rec.__ptCounterSeq = (+rec.__ptCounterSeq || 0) + 1;
      host.render();
      return true;
    }

    /* Messaging both ways. r.threads is keyed by worker name — the same store
       the dashboard Inbox renders from, so a relayed message is a real
       message, not a harness overlay. */
    function message(id, workerName, text, opts) {
      var rec = raw(id);
      if (!rec) return false;
      rec.threads = rec.threads || {};
      if (!rec.threads[workerName]) rec.threads[workerName] = [];
      rec.threads[workerName].push({
        from: (opts && opts.from) || 'worker',
        text: String(text || ''),
        flagged: !!(opts && opts.flagged),
        at: (opts && opts.at) || null
      });
      rec.needsAttention = true;
      host.render();
      return true;
    }

    /* The app's own thread convention is `from:'me'` for the requester and
       anything else for the worker (the Inbox renders `m.from === 'me' ? mine
       : theirs`). This filtered on 'requester', a value the app never writes —
       so requester replies were collected, rendered, and never relayed: the
       Gopher's phone stayed silent while the requester watched their message
       sit in the thread. Read the app's vocabulary, not an invented one. */
    function messagesFrom(id, workerName) {
      var rec = raw(id);
      if (!rec || !rec.threads || !rec.threads[workerName]) return [];
      return rec.threads[workerName].filter(function (m) { return m.from === 'me'; });
    }

    function gopherCancelled(id, reason) {
      return patch(id, {
        __ptGopherCancelled: true,
        __ptCancelReason: reason || 'The Gopher cancelled',
        status: 'pending',
        statusLabel: 'Pending',
        needsAttention: true,
        live: null,
        userStarted: false,
        interestedWorkers: []
      });
    }

    function reqCancel(id) {
      var rec = raw(id);
      if (!rec) return false;
      rec.__ptCancelled = true;
      rec.__ptReqCancelSeq = (+rec.__ptReqCancelSeq || 0) + 1;
      if (host.cancel) { try { host.cancel(id); } catch (_) {} }
      host.render();
      return true;
    }

    function reset() {
      if (D.activeRequests) D.activeRequests.length = 0; else D.activeRequests = [];
      FAKE_ACTIVITY.forEach(function (k) { if (Array.isArray(D[k])) D[k].length = 0; });
      try { sessionStorage.removeItem('gopher_pt_world_request');
            sessionStorage.removeItem('gopher_pt_world_connect'); } catch (_) {}
      if (host.recount) host.recount();
      host.render();
    }

    var GWeb = {
      pt: true,
      surface: SURFACE,
      all: function () { return rawList().map(norm); },
      get: function (id) { return norm(raw(id)); },
      raw: raw,
      update: patch,
      offer: offer,
      hire: hire,
      substage: substage,
      counter: counter,
      message: message,
      messagesFrom: messagesFrom,
      gopherCancelled: gopherCancelled,
      reqCancel: reqCancel,
      reset: reset,
      ensureSnapshot: function (id) { return ensureSnapshot(raw(id)); },
      adopt: adopt,
      purgeSeed: purgeSeed,
      world: world,
      persist: persist,
      /* Exposed so the harness can assert it is talking to a live bridge
         rather than an empty dashboard that merely looks quiet. */
      ready: function () { return true; }
    };

    /* Report what the saved world holds without touching the page yet — the
       actual restore happens inside purgeSeed(), once the dashboard has finished
       seeding. Restoring here would be undone moments later. */
    GWeb.pending = (function(){
      try { var a = JSON.parse(sessionStorage.getItem(WORLD_KEY) || '[]');
            return Array.isArray(a) ? a.length : 0; } catch (_) { return 0; }
    })();

    root.GWeb = GWeb;
    return GWeb;
  }

  root.GopherWebPT = { on: ptOn, install: install, catOf: catOf, stageOf: stageOf };

})(typeof window !== 'undefined' ? window : this);
