/* gopher-step-gates.js — the SHARED step-gate rule set for Gopher Request / Connect.
   ===========================================================================
   What blocks "Continue" (and "Submit") at each step of the request flow. Three
   surfaces implement this today — Request web, Connect web and the Request app
   prototype — each with its own private `stepGate()`. That duplication is the
   drift this module exists to end: on 2026-08-22 Connect was found missing four
   gates Request enforced, including an identity check the backend was already
   refusing orders over, and nothing caught it until a harness compared the two.

   MEASURED BEFORE IT WAS WRITTEN — and the measurements shaped the design:

     • 12 distinct gates exist. Request enables 11, Connect 11, the prototype 8.
     • The prototype has NO addresses-differ and NO schedule-time gate, and it is
       the only surface whose stepGate carries the age-keyword check (the web pair
       run that from their Continue handler instead).
     • Gates are step-guarded, so ordering only matters WITHIN a step. The single
       real divergence is at step 6: Request evaluates Addresses BEFORE the waiver,
       Connect evaluates it after. Same broken state, different message.

   SO THE MODEL IS: one gate catalogue + a per-surface enable list. That is not an
   abstraction imposed on the surfaces; it is what they already are. A surface that
   omits a gate says so in one line, visibly, instead of by silent absence — which
   is exactly how Connect's missing identity gate went unnoticed for months.

   ⚠️ THIS MODULE DOES NOT KNOW YOUR HELPERS, ON PURPOSE. `isVisible`,
   `bidsAllowed`, the identity check and number coercion differ per surface
   (Connect calls it `bidsAvailable`, the prototype derives identity through
   `idVerifiedNow()`). They are passed in as a HOST adapter. A missing helper is
   reported as a real failure rather than silently treated as "gate passes" — a
   gate that no-ops because a function was undefined is the worst outcome of all,
   and it is what `resolveClassifier()` did on gopher-request.html until 2026-07-25.

   UMD — usable from a <script> tag, a bundler, or Node. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.GopherStepGates = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── The gate catalogue ─────────────────────────────────────────────────────
     Each gate is: an id (stable, never rendered), the step it guards, the field
     LABEL the surface shows, a DOM selector to flash, the message, and a `when`
     predicate that returns true when the gate BLOCKS.

     `when(state, host)` must be pure with respect to the DOM — everything it
     needs arrives through `state` or `host`. That is what makes this testable in
     Node and reusable under React/Capacitor, which is the whole point of pulling
     it out of three HTML files. */

  var GATES = [
    {
      id: 'category', step: 1,
      label: 'Service category', selector: '.cat-grid',
      message: 'Please pick a service category to continue.',
      when: function (s) { return !s.category; }
    },
    {
      id: 'description', step: 2,
      label: 'Description', selector: '#descriptionInput',
      message: 'Please add a description before continuing.',
      needs: ['isVisible'],
      when: function (s, h) {
        return h.isVisible('describe') && !String(s.description || '').trim();
      }
    },
    {
      id: 'costOfItems', step: 2,
      label: 'Cost of items', selector: '#costOfItemsInput',
      message: 'Please enter the cost of items needed before continuing.',
      when: function (s) {
        if (!s.itemsPurchased) return false;
        return !(parseFloat(String(s.costOfItems).replace(/[^\d.]/g, '')) > 0);
      }
    },
    {
      /* Prototype-only IN stepGate. Request and Connect run the same compliance
         scan from their Continue handler, not from here — so enabling this for
         them would fire the check twice, not add a missing one. Verified, not
         assumed: both carry an age-keyword backstop in the click path. */
      id: 'ageKeyword', step: 2,
      label: 'Age-restricted check', selector: '.age-kw-banner',
      message: 'This looks age-restricted — confirm before continuing.',
      tone: 'alert', flags: { age: true },
      needs: ['findAgeRestrictedKeyword'],
      when: function (s, h) {
        if (s.ageRestricted || s.ageKeywordAck) return false;
        return !!h.findAgeRestrictedKeyword(s.description);
      }
    },
    {
      /* Owner ruling 2026-08-22 (Phase 2 Finding 3): all three surfaces gate
         identity at step 2. NOT new policy — the backend already refuses these
         orders 403 via trust_shield_required(), which reads the requester's own
         age/verification and does not branch on which client submitted. Before
         this, Connect had no ID-capture path at all, so the refusal named a
         remedy that surface could not offer: a dead end, not a bypass. */
      id: 'identity', step: 2,
      label: 'Identity verification', selector: '.ar-banner',
      message: 'Please verify your identity for this age-restricted order — tap '
             + '“Submit identification” (or add TrustShield) to continue.',
      tone: 'alert',
      needs: ['identityVerified'],
      when: function (s, h) {
        if (s.category !== 'delivery' || !s.ageRestricted) return false;
        return !h.identityVerified(s);
      },
      /* ⛔ NO messageFor ANY MORE (owner, 2026-08-25: "there is no distinction with
         ANY age"). It used to swap in a TrustShield-only sentence for under-30,
         because under-30 once had no one-off ID path. They have had the same path
         since 2026-08-24, and age no longer changes the requirement OR the wording.
         `customerAge` is left in the host contract but nothing here reads it. */
    },
    {
      id: 'pickupAddress', step: 4,
      label: 'Pick-up address', selector: null,
      message: 'Add a pick-up address so your Gopher knows where to start.',
      needs: ['isVisible'],
      when: function (s, h) {
        if (s.noSpecificPickup || !h.isVisible('pickupSection')) return false;
        return firstEmpty(s.pickupStops) > -1;
      },
      selectorFor: function (s) {
        return 'input[data-locedit="pickup"][data-idx="' + firstEmpty(s.pickupStops) + '"]';
      }
    },
    {
      id: 'dropoffAddress', step: 4,
      label: 'Drop-off address', selector: null,
      message: 'Add a drop-off address so your Gopher knows where to go.',
      needs: ['isVisible'],
      when: function (s, h) {
        if (s.noSpecificPickup || !h.isVisible('pickupSection')) return false;
        if (firstEmpty(s.pickupStops) > -1) return false;   // pick-up reports first
        return firstEmpty(s.dropoffStops) > -1;
      },
      selectorFor: function (s) {
        return 'input[data-locedit="dropoff"][data-idx="' + firstEmpty(s.dropoffStops) + '"]';
      }
    },
    {
      /* Runs at step 4 AND step 6 — step 6 is the submit-time backstop, because a
         step gate only sees the current step and an identical pair edited earlier
         would otherwise submit. Only for categories that genuinely have both ends;
         isVisible('pickupSection') is what keeps it off single-location work. */
      id: 'addressesDiffer', step: [4, 6],
      label: 'Addresses', selector: '.field-input',
      message: 'Your pick-up and drop-off need to be different addresses — please '
             + 'update one so your Gopher knows where to go.',
      needs: ['isVisible'],
      when: function (s, h) {
        if (s.noSpecificPickup || !h.isVisible('pickupSection')) return false;
        if (!Array.isArray(s.pickupStops) || !Array.isArray(s.dropoffStops)) return false;
        var pk = s.pickupStops.map(normAddr).filter(Boolean);
        var dp = s.dropoffStops.map(normAddr).filter(Boolean);
        return pk.some(function (p) { return dp.indexOf(p) !== -1; });
      }
    },
    {
      /* A worker must ALWAYS be offered > $0 (owner, 2026-07-17). The only path
         with no set offer is a REAL bids job — payMode 'bids' AND the category
         allows bids. A stale 'bids' choice carried onto a no-bids category still
         needs a positive amount. */
      id: 'workerPay', step: 5,
      label: 'Worker pay', selector: '#payAmountInput',
      message: 'Please enter how much you’d like to pay your worker before continuing.',
      needs: ['bidsAllowed'],
      when: function (s, h) {
        if (s.payMode === 'bids' && h.bidsAllowed()) return false;
        return !(parseFloat(String(s.payAmount).replace(/[^\d.]/g, '')) > 0);
      }
    },
    {
      id: 'workerPaySubmit', step: 6,
      label: 'Worker pay', selector: null,
      message: 'Your worker’s pay can’t be $0 — go back to Worker pay and set an offer.',
      tone: 'alert',
      needs: ['bidsAllowed'],
      when: function (s, h) {
        if (s.payMode === 'bids' && h.bidsAllowed()) return false;
        /* The prototype checks perWorkerPay() here rather than the raw amount.
           When the host supplies it, it wins — it is the stricter, more correct
           reading (a crew of 3 on a $30 offer is $10 each, not $30). */
        if (typeof h.perWorkerPay === 'function') return !(h.perWorkerPay() > 0);
        return !(parseFloat(String(s.payAmount).replace(/[^\d.]/g, '')) > 0);
      }
    },
    {
      id: 'scheduleTime', step: 6,
      label: 'Schedule time', selector: '.cal-time-row',
      message: 'Please pick a time for your scheduled request.',
      when: function (s) {
        return s.scheduleType === 'scheduled' && !s.timeSlot;
      }
    },
    {
      id: 'waiver', step: 6,
      label: 'Liability waiver', selector: '.waiver-box',
      message: 'Please check the liability waiver before submitting.',
      when: function (s) { return !s.waiverChecked; }
    }
  ];

  /* ── Per-surface enable lists ───────────────────────────────────────────────
     Order here IS evaluation order. Gates are step-guarded, so only order WITHIN
     a step is observable — and there is exactly one place it differs.

     ⚠️ STEP-6 ORDER IS A DECISION, not an accident. Request evaluates Addresses
     before the waiver; Connect evaluated it after. With both broken, Request said
     "Addresses" and Connect said "Liability waiver". Request's order is canonical
     here: the addresses are a step-4 problem and the waiver is a step-6 action, so
     naming the upstream fault sends the user to the thing that actually needs
     fixing. Adopting this changes ONE observable behaviour on Connect — which
     message appears when both fail at once — and nothing else. */
  var SURFACE_GATES = {
    /* ⛔⛔ 'identity' IS BACK ON THE WEB SURFACES — owner ruling 2026-08-25.
       This SUPERSEDES the 2026-08-23 G40-410 removal quoted below. That removal
       existed for exactly one reason: iDenfy was being retired, so enrolment would
       stop and under-30 (who then had no one-off path) would be left unable to
       order at all. TrustShield now runs INTERNALLY — enrolment never stops — so
       the reason is gone and the gate returns.
       Owner, 2026-08-25: identity is required to submit an AGE-RESTRICTED order,
       for everyone, with no age branch. The gate's own `when` already scopes it to
       delivery + ageRestricted, so restoring it here is exactly that and nothing
       wider — a non-A/R order is never gated.
       ⚠️ 'prototype' is NOT restored here yet: App Prototypes owns that surface and
       lands it in `_prototypes/`. Adding it before their UI can satisfy it would
       recreate the dead end this file's own identity-gate comment warns about.
       Add it — and to the assertion below — when they land.
       Superseded text follows.
       ⛔ 'identity' REMOVED from both web surfaces — owner ruling 2026-08-23
       (trustshield-gate-removal-interim.md §8.1, G40-410). This SUPERSEDES the
       2026-08-22 D-038 Part 1 ruling that put it here; that gate was correct under
       the policy then in force. iDenfy is being retired (~218 credits, ~6.6/day,
       cliff ~Sept 22-25) and cannot be topped up at a price the owner will pay, so
       when enrollment stops the badge would permanently block ~28 new requesters a
       week (76.7% of new enrollments are 21-29, who must verify to participate).
       TrustShield becomes voluntary: a trust badge and the $1 perk. The compliance
       control is unchanged and was always the real one — the Gopher checks a
       physical ID at the door.
       The gate DEFINITION stays in the catalogue below, unreferenced, because the
       barcode work (docs/handoff/id-barcode-age-read.md) re-enables it later.
       ⚠️ This does NOT touch under-21 protection: on web the age-restricted path is
       reached through the category + the ageRestricted slider, a different mechanism
       from the app's can_request_restricted_items. Zero A/R orders from under-21
       requesters in 2025 or 2026 — do not "tidy" that away with this. */
    request: ['category', 'description', 'costOfItems', 'identity',
              'pickupAddress', 'dropoffAddress', 'addressesDiffer',
              'workerPay', 'workerPaySubmit', 'scheduleTime', 'waiver'],
    connect: ['category', 'description', 'costOfItems', 'identity',
              'pickupAddress', 'dropoffAddress', 'addressesDiffer',
              'workerPay', 'workerPaySubmit', 'scheduleTime', 'waiver'],
    /* ⛔ THE PROTOTYPE NO LONGER DIVERGES. It used to lack addresses-differ and
       schedule-time, and the note here said adding them "would CHANGE its behaviour,
       which is a product decision and not part of an extraction". The owner made that
       decision on 2026-08-25 — "Connect and Request are both currently live and
       correct. You're to model that flow and logic" — so both gates were added to that
       surface and are listed here.
       It still differs from the web pair in ONE respect, which is not a gap: it is the
       only surface running the age-keyword scan from stepGate, so it carries
       'ageKeyword' and they do not. Listed rather than inherited — an omission anyone
       can see beats an absence nobody notices. Step-6 order matches Request's. */
    prototype: ['category', 'description', 'costOfItems', 'ageKeyword', 'identity',
                'pickupAddress', 'dropoffAddress', 'addressesDiffer',
                'workerPay', 'workerPaySubmit', 'scheduleTime', 'waiver']
  };

  /* ── helpers ──────────────────────────────────────────────────────────────── */

  function normAddr(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function firstEmpty(arr) {
    if (!Array.isArray(arr)) return -1;
    for (var i = 0; i < arr.length; i++) {
      if (!String(arr[i] == null ? '' : arr[i]).trim()) return i;
    }
    return -1;
  }

  function gateById(id) {
    for (var i = 0; i < GATES.length; i++) if (GATES[i].id === id) return GATES[i];
    return null;
  }

  function guardsStep(gate, step) {
    return Array.isArray(gate.step) ? gate.step.indexOf(step) !== -1 : gate.step === step;
  }

  function gatesFor(surface) {
    var ids = SURFACE_GATES[surface] || SURFACE_GATES.request;
    return ids.map(gateById).filter(Boolean);
  }

  /* ── evaluate ───────────────────────────────────────────────────────────────
     Returns { ok: true } or { ok:false, id, step, label, selector, message, tone,
     flags }. Surfaces map that to whatever their UI already expects — the web pair
     use {label, selector}, the prototype uses {sel} — so adopting this does not
     force a UI rewrite. */
  function evaluate(state, host, surface) {
    host = host || {};
    var list = gatesFor(surface || 'request');
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (!guardsStep(g, state.step)) continue;

      /* A helper the gate needs but the host did not supply is a HARD error.
         Returning "passes" here would silently disable a compliance gate, which
         is the failure mode this whole module exists to prevent. */
      if (g.needs) {
        for (var n = 0; n < g.needs.length; n++) {
          if (typeof host[g.needs[n]] !== 'function') {
            throw new Error('gopher-step-gates: gate "' + g.id + '" needs host.'
              + g.needs[n] + '(), which was not supplied');
          }
        }
      }

      if (g.when(state, host)) {
        return {
          ok: false,
          id: g.id,
          step: state.step,
          label: g.label,
          selector: g.selectorFor ? g.selectorFor(state, host) : g.selector,
          message: g.messageFor ? g.messageFor(state, host) : g.message,
          tone: g.tone || null,
          flags: g.flags || null
        };
      }
    }
    return { ok: true };
  }

  /* Adapters so a surface can drop this in without touching its call sites. */
  function toWebShape(r) {
    if (r.ok) return { ok: true };
    /* id: lets a surface give a specific gate a richer treatment than the
       generic field flash (e.g. addressesDiffer opens its purpose-built modal). */
    return { ok: false, id: r.id, label: r.label, selector: r.selector, msg: r.message };
  }
  function toPrototypeShape(r) {
    if (r.ok) return { ok: true };
    var out = { ok: false, sel: r.selector, msg: r.message };
    if (r.tone) out.tone = r.tone;
    if (r.flags) for (var k in r.flags) if (r.flags.hasOwnProperty(k)) out[k] = r.flags[k];
    return out;
  }

  /* ── self-check ─────────────────────────────────────────────────────────────
     Same contract as gopher-flow-rules.assertInvariants(): returns a list of
     problems, empty when healthy. */
  function assertInvariants() {
    var problems = [];
    var ids = GATES.map(function (g) { return g.id; });
    if (new Set(ids).size !== ids.length) problems.push('duplicate gate ids');

    Object.keys(SURFACE_GATES).forEach(function (surface) {
      SURFACE_GATES[surface].forEach(function (id) {
        if (!gateById(id)) problems.push(surface + ' enables unknown gate "' + id + '"');
      });
      var seen = SURFACE_GATES[surface];
      if (new Set(seen).size !== seen.length) problems.push(surface + ' lists a gate twice');
    });

    /* This assertion is INVERTED, not deleted (owner ruling 2026-08-23, superseding
       2026-08-22). It used to fail when a surface LACKED the identity gate; it now
       fails when a web surface CARRIES it. Same purpose either way — a ruling that
       is only a habit gets undone by the next edit — so the guard follows the ruling
       instead of being silenced with it.
       'prototype' JOINED this list on 2026-08-25: surface 2 of the staged rollout
       (web -> app prototypes -> live apps) landed, so all three checked surfaces are
       now asserted to be free of the gate. Surface 3 is the live apps, which are not
       modelled here — they ship via a store release (G40-410, Matt). */
    /* ⛔ INVERTED AGAIN, 2026-08-25 — third state for this guard, so read the date
       not the shape. It once required the gate, then required its ABSENCE (G40-410,
       iDenfy retirement), and now requires its PRESENCE on the web surfaces again
       because TrustShield runs internally and identity is mandatory for A/R orders.
       The guard follows the ruling instead of being deleted with it, which is why it
       keeps flipping rather than quietly disappearing.
       'prototype' JOINED this list on 2026-08-25, the day App Prototypes landed the
       gate on that surface (its stepGate() now blocks A/R delivery until identity is
       satisfied, and its UI can satisfy it — both paths, one-off and TrustShield).
       All three modelled surfaces are asserted to CARRY the gate. Surface 3, the live
       apps, is not modelled here; it ships via a store release. */
    ['request', 'connect', 'prototype'].forEach(function (surface) {
      if (SURFACE_GATES[surface].indexOf('identity') === -1) {
        problems.push(surface + ' is MISSING the identity gate, which the owner made '
          + 'mandatory for age-restricted orders on 2026-08-25 (TrustShield is internal now)');
      }
    });

    /* Step-6 order decision, pinned so it cannot drift back silently. */
    ['request', 'connect'].forEach(function (surface) {
      var l = SURFACE_GATES[surface];
      if (l.indexOf('addressesDiffer') > l.indexOf('waiver')) {
        problems.push(surface + ' evaluates addressesDiffer AFTER the waiver — the '
          + 'canonical step-6 order names the upstream fault first');
      }
    });

    return problems;
  }

  return {
    GATES: GATES,
    SURFACE_GATES: SURFACE_GATES,
    gatesFor: gatesFor,
    gateById: gateById,
    evaluate: evaluate,
    toWebShape: toWebShape,
    toPrototypeShape: toPrototypeShape,
    normAddr: normAddr,
    firstEmpty: firstEmpty,
    assertInvariants: assertInvariants
  };
});
