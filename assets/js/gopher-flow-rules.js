/* gopher-flow-rules.js — the SHARED flow rule set for Gopher Request / Connect.
   ===========================================================================
   Which fields a category shows, which fields a category owns, and which
   categories are priced. Three surfaces implement this today — Request web,
   Connect web and the Request app prototype — each carrying its own private copy
   of the same tables. That duplication is the drift this module exists to end.

   MEASURED BEFORE IT WAS WRITTEN. Request and Connect agree on 16 of 17 fields;
   they differ on exactly one (`multiStop`). The prototype differs on exactly one
   (`aiPaySuggest`) and omits three fields it never asks for. So a shared module
   with a small surface-override layer models reality closely — this is not an
   abstraction imposed on top of it.

   HOW IT IS MEANT TO BE USED. This file is the source of truth. Surfaces should
   delegate to it, exactly as they already delegate age-keyword detection and
   suggested-offer pricing to gopher-request-logic.js. Until a surface is rewired,
   run_parity_harness.py asserts its inline copy AGREES with this one, so a
   divergence fails a run instead of shipping.

   UMD — usable from a <script> tag, a bundler, or Node. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.GopherFlowRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── The eight canonical categories ────────────────────────────────────────
     `key` is what client state carries. `slug` is the stable identifier the
     backend category_id work adopts (owner decision 2026-08-21) and matches the
     classifier vocabulary already in gopher-request-logic.js. `label` is display
     ONLY — display strings are exactly what the category_id decision exists to
     stop storing, so never use one as an identifier. */
  var CATEGORIES = [
    { key: 'delivery', slug: 'delivery',                   label: 'Delivery / Errand' },
    { key: 'ride',     slug: 'ride_sharing',               label: 'Ride Sharing' },
    { key: 'moving',   slug: 'moving',                     label: 'Moving' },
    { key: 'junk',     slug: 'junk_removal',               label: 'Junk Removal' },
    { key: 'labor',    slug: 'hourly_day_labor',           label: 'Hourly / Day Labor' },
    { key: 'yard',     slug: 'yard_work_outdoor_projects', label: 'Yard / Outdoor Projects' },
    { key: 'home',     slug: 'home_services',              label: 'Home / Office Services' },
    { key: 'other',    slug: 'other',                      label: 'Other' }
  ];
  var CATEGORY_KEYS = CATEGORIES.map(function (c) { return c.key; });

  /* ── Field visibility — the consumer baseline ──────────────────────────────
     Read as "this field is HIDDEN for these categories". Taken verbatim from
     Final/gopher-request.html, the most complete copy, which the Request app
     prototype should also match. */
  var BASE_HIDDEN_FOR = {
    addPic:               ['ride'],
    aiPaySuggest:         ['home', 'labor', 'other', 'yard'],
    bidsOption:           ['delivery', 'ride'],
    deliveryType:         ['home', 'junk', 'labor', 'moving', 'other', 'ride', 'yard'],
    describe:             ['ride'],
    destStairs:           ['delivery', 'home', 'ride', 'yard'],
    hazardous:            ['delivery', 'home', 'labor', 'moving', 'other', 'ride', 'yard'],
    itemInfo:             ['delivery', 'home', 'labor', 'other', 'ride', 'yard'],
    laborMgmt:            ['delivery', 'home', 'ride'],
    multiStop:            ['delivery', 'home', 'junk', 'labor', 'moving', 'other', 'ride', 'yard'],
    noSpecificPickup:     ['home', 'junk', 'labor', 'other', 'ride', 'yard'],
    pickupSection:        ['home', 'junk', 'labor', 'other', 'yard'],
    pickupStairs:         ['delivery', 'home', 'junk', 'labor', 'other', 'ride', 'yard'],
    riderInfo:            ['delivery', 'home', 'junk', 'labor', 'moving', 'other', 'yard'],
    serviceElevator:      ['delivery', 'home', 'junk', 'labor', 'other', 'ride', 'yard'],
    workerSelectChoice:   ['home', 'labor', 'moving', 'other', 'yard'],
    workerSetup:          ['delivery', 'home', 'ride']
  };

  /* ── Surface overrides ─────────────────────────────────────────────────────
     Connect is a different product and legitimately differs. Exactly one field
     does so today.

     `multiStop` is BUILT IN BOTH web surfaces — each has six isVisible call
     sites — but Request hides it for all eight categories, so in Request it is a
     finished feature switched off, not a missing one. Connect enables it for
     Delivery and Ride. Treat a change here as a product decision, not a tidy-up. */
  var SURFACE_OVERRIDES = {
    connect: {
      multiStop:            ['home', 'junk', 'labor', 'moving', 'other', 'yard']
    }
  };

  /* ── Priced categories ─────────────────────────────────────────────────────
     Categories the suggested-offer model covers. Moving joined 2026-08-08.

     INVARIANT: the categories showing `aiPaySuggest` are exactly the priced ones.
     Offering a pay suggestion where no model exists is a broken promise;
     withholding one where a model does exist silently drops a feature.

     ⚠️ This is not hypothetical. The app prototype still hides aiPaySuggest for
     `moving`, predating the 2026-08-08 pricing work, so the app would ship
     without Moving pay suggestions. The harness fails on exactly that. */
  var PRICED_CATEGORIES = ['delivery', 'ride', 'moving', 'junk'];

  /* ── Category-scoped state ─────────────────────────────────────────────────
     Fields OWNED by a category, which snap back to their initial values when the
     user switches. Leaving them set is how a Junk volume tier once survived onto
     a Delivery request. Deliberately NOT reset: user-typed, category-agnostic
     input (description, photos, addresses, specialInstructions). */
  var CATEGORY_SCOPED_KEYS = [
    'ageRestricted',
    'ageKeywordAck',
    'agePurchaseAck',
    'idRequiredAtCompletion',
    'idVerification',
    'itemsPurchased',
    'costOfItems',
    'numRiders',
    'numBags',
    'junkTier',
    'movingTier',
    'noSpecificPickup',
    'serviceElevatorPickup',
    'serviceElevatorDest',
    'pickupStairs',
    'destStairs',
    'payByHour',
    'numHours',
    'itemCount',
    'multipleItems',
    'hazardous',
    'payMode',
    'payAmount',
    'lowOfferAck',
    'lowAvailabilityAck',
    'suggestedOfferUsed'
  ];

  function tableFor(surface) {
    var t = {}, k;
    for (k in BASE_HIDDEN_FOR) t[k] = BASE_HIDDEN_FOR[k];
    var ov = SURFACE_OVERRIDES[surface];
    if (ov) for (k in ov) t[k] = ov[k];
    return t;
  }

  /* `surface` defaults to the consumer baseline, which is what Request and the
     Request app both use. Pass 'connect' for the business flow. */
  function isVisible(field, category, surface) {
    var hidden = tableFor(surface)[field];
    if (!hidden) return true;                 // unknown field: visible, never throw
    return hidden.indexOf(category) === -1;
  }

  function visibleCategories(field, surface) {
    var hidden = tableFor(surface)[field] || [];
    return CATEGORY_KEYS.filter(function (c) { return hidden.indexOf(c) === -1; });
  }

  function isPricedCategory(category) {
    return PRICED_CATEGORIES.indexOf(category) !== -1;
  }

  function categoryBy(prop, value) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i][prop] === value) return CATEGORIES[i];
    }
    return null;
  }

  /* The keys a category switch must reset. Callers supply their own initial
     values — this module holds the rule, not the defaults. */
  function categoryScopedKeys() { return CATEGORY_SCOPED_KEYS.slice(); }

  /* ── Self-check ────────────────────────────────────────────────────────────
     Run by the parity harness. Returns violations; empty means healthy. */
  function assertInvariants() {
    var problems = [];

    var payVisible = visibleCategories('aiPaySuggest').slice().sort().join(',');
    var priced = PRICED_CATEGORIES.slice().sort().join(',');
    if (payVisible !== priced) {
      problems.push('aiPaySuggest visible for [' + payVisible +
                    '] but PRICED_CATEGORIES is [' + priced + ']');
    }

    Object.keys(BASE_HIDDEN_FOR).forEach(function (f) {
      BASE_HIDDEN_FOR[f].forEach(function (c) {
        if (CATEGORY_KEYS.indexOf(c) === -1) {
          problems.push('BASE_HIDDEN_FOR.' + f + ' names unknown category "' + c + '"');
        }
      });
    });

    Object.keys(SURFACE_OVERRIDES).forEach(function (s) {
      Object.keys(SURFACE_OVERRIDES[s]).forEach(function (f) {
        if (!BASE_HIDDEN_FOR.hasOwnProperty(f)) {
          problems.push('override ' + s + '.' + f + ' has no baseline entry');
        }
      });
    });

    return problems;
  }

  /* Fields switched off everywhere on a surface. Not an error — `multiStop` is a
     built-but-dark feature in the consumer flow — but a surface that reports a
     dark field it never calls is carrying a vestigial row, which is worth
     knowing before someone "fixes" it. */
  function darkFields(surface) {
    var t = tableFor(surface);
    return Object.keys(t).filter(function (f) {
      return CATEGORY_KEYS.every(function (c) { return t[f].indexOf(c) !== -1; });
    });
  }

  return {
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    BASE_HIDDEN_FOR: BASE_HIDDEN_FOR,
    SURFACE_OVERRIDES: SURFACE_OVERRIDES,
    PRICED_CATEGORIES: PRICED_CATEGORIES,
    CATEGORY_SCOPED_KEYS: CATEGORY_SCOPED_KEYS,
    tableFor: tableFor,
    isVisible: isVisible,
    visibleCategories: visibleCategories,
    isPricedCategory: isPricedCategory,
    categoryBy: categoryBy,
    categoryScopedKeys: categoryScopedKeys,
    assertInvariants: assertInvariants,
    darkFields: darkFields
  };
});
