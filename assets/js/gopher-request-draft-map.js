/* gopher-request-draft-map.js — canonical draft ⇄ live Request app (Formik) fields.
   =================================================================================
   The web surfaces already hold a request as ONE object whose keys are the canonical
   contract. The live mobile app does not: its in-progress state is per-screen Formik
   values, merged forward through react-router history, with different names, different
   units and UI flags mixed in. This module is the translation layer that lets both
   platforms read and write the SAME draft.

   Verified against gopher-mobile-requester @ origin/production e0a56bb3b:
     src/helpers/formInitValue.js   — the live field list
     src/helpers/orderObject.js     — the submit payload (a THIRD naming layer)
     src/actions/action.js          — the expression evaluator + UI-flag generation
     src/pages/renderForm.js        — screen JSON → Formik wiring

   Three hazards this module exists to absorb, all real and all confirmed in code:

   1. UI FLAGS ARE MIXED INTO THE DATA. The engine generates `<field>visible`,
      `<field>disable` and `<field>_radio` siblings at runtime (action.js:98,
      setRequestDetails.js:13-15), so `cost_of_goodsvisible` sits next to
      `cost_of_goods` in the same bag. They are stripped here, by pattern, because
      they cannot be enumerated from the screen JSON.

   2. MONEY UNITS ARE NOT UNIFORM. Formik holds dollars; the summary call multiplies
      by 100; onload_actions divide by 100 on rehydrate. The canonical contract stores
      what the user typed, as a display string, and conversion stays at the submit
      boundary where it already lives. This module never re-scales.

   3. PHOTOS ARE `File` OBJECTS. `attachment` is a mixed array of remote URL strings
      and live File objects (imageuploadfororder.js:67-68). Files cannot cross a JSON
      boundary, and the draft contract excludes image data anyway — so only a COUNT
      travels, and the resuming device asks the user to re-attach.

   CATEGORY IS THE ONE FIELD THAT CANNOT BE MAPPED CLEANLY, and that is a platform
   fact rather than an oversight: the live app carries `category_type` /
   `sub_category_type` as free-text display strings ("Other", "Mulch Project"), which
   is the same missing `category_id` already documented against order analytics. The
   table below maps the values that can be confirmed; anything else is preserved
   verbatim under `categoryRaw` so a resume is never silently mis-categorised, and
   `unmapped` reports it. Production should introduce a real category id and collapse
   this table to a lookup.

   UMD, like the rest of the shared modules. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.GopherRequestDraftMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Canonical UI key ⇄ live category_type display string. Extend as values are
     confirmed against production data — do NOT guess a mapping in here, an unmapped
     value is handled safely and a wrong one silently changes what is being requested. */
  var CATEGORY_TO_LIVE = {
    delivery: 'Delivery',
    ride: 'Need a Ride',
    home: 'Services'
  };
  var LIVE_TO_CATEGORY = (function () {
    var o = {}, k;
    for (k in CATEGORY_TO_LIVE) if (Object.prototype.hasOwnProperty.call(CATEGORY_TO_LIVE, k)) {
      o[CATEGORY_TO_LIVE[k].toLowerCase()] = k;
    }
    return o;
  })();

  /* Straight renames: canonical ← live. Only fields whose MEANING is identical. */
  var FIELD_MAP = [
    // canonical              live (Formik)
    ['description',           'description'],
    ['costOfItems',           'cost_of_goods'],
    ['payAmount',             'gopher_offering'],
    ['ageRestricted',         'has_age_restriction'],
    ['specialInstructions',   'special_instructions'],
    ['itemCount',             'number_of_items'],
    ['multipleItems',         'multiple_item'],
    ['numWorkers',            'gophers_needed'],
    ['pickupStairs',          'stair'],
    ['itemsPurchased',        'need_purchase'],
    ['noSpecificPickup',      'purchase_anywhere'],
    ['waiverChecked',         'liability_waiver'],
    ['numHours',              'hourly_wage_offered'],
    ['flexibleWindow',        'request_flexible_type']
  ];

  /* The UI-flag suffixes the engine generates at runtime. Pattern-based by necessity. */
  var UI_SUFFIX = /(visible|disable|_radio)$/;

  function isFileLike(v) {
    return v && typeof v === 'object' &&
           (typeof File !== 'undefined' && v instanceof File ||
            (typeof v.name === 'string' && typeof v.size === 'number' && typeof v.type === 'string'));
  }

  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  /* Address: the live app uses a flat text field for entry (`pickup_`) alongside an
     object (`pickup_address`) whose subkeys are street_line1/2 — while `address` and
     `address_attributes` in the SAME payload use line1/2. Read whichever is populated;
     the canonical form is a single display string per stop. */
  function readAddress(values, textKey, objKey) {
    var t = str(values[textKey]).trim();
    if (t) return t;
    var o = values[objKey];
    if (o && typeof o === 'object') {
      var line = str(o.street_line1 || o.line1).trim();
      var city = str(o.city).trim();
      var st = str(o.state).trim();
      var parts = [line, city, st].filter(Boolean);
      return parts.join(', ');
    }
    return '';
  }

  /* ── live Formik values → canonical draft data ─────────────────────────────── */
  function fromLive(values) {
    values = values || {};
    var out = {}, i, pair, unmapped = [];

    for (i = 0; i < FIELD_MAP.length; i++) {
      pair = FIELD_MAP[i];
      if (Object.prototype.hasOwnProperty.call(values, pair[1])) out[pair[0]] = values[pair[1]];
    }

    /* Category — mapped where confirmable, preserved verbatim otherwise. */
    var liveCat = str(values.category_type).trim();
    if (liveCat) {
      var mapped = LIVE_TO_CATEGORY[liveCat.toLowerCase()];
      if (mapped) out.category = mapped;
      else unmapped.push('category_type=' + liveCat);
      out.categoryRaw = liveCat;
      if (values.sub_category_type) out.subCategoryRaw = str(values.sub_category_type);
    }

    /* Addresses → canonical single-element arrays. */
    var pick = readAddress(values, 'pickup_', 'pickup_address');
    var drop = readAddress(values, 'dropoff_', 'dropoff_address');
    if (!pick && !drop) {
      /* Single-address categories use the `address_` / `address_attributes` pair. */
      var single = readAddress(values, 'address_', 'address_attributes');
      if (single) drop = single;
    }
    out.pickupStops = [pick];
    out.dropoffStops = [drop];

    /* Schedule — three booleans on the live side, one enum canonically. */
    if (bool(values.need)) out.scheduleType = 'now';
    else if (bool(values.flexible)) out.scheduleType = 'flexible';
    else if (values.request_schedule || values.request_schedule_time) out.scheduleType = 'scheduled';
    if (values.request_schedule_time) out.timeSlot = str(values.request_schedule_time);

    /* Worker selection — two independent live flags collapse to one canonical enum. */
    if (bool(values.select_gopher)) out.workerSelection = 'select';
    else if (bool(values.notify_fav_gopher) || bool(values.notify_select_fav_gopher)) out.workerSelection = 'my';
    else out.workerSelection = 'first';

    /* Hourly pay is implied by a wage being present. */
    if (values.hourly_wage_offered || values.wage_per_gopher) out.payByHour = true;

    /* Photos: count only — Files cannot be serialized and image data never travels. */
    var att = values.attachment;
    out.picCount = Array.isArray(att) ? att.length : 0;
    out.hasPic = out.picCount > 0;

    return { data: out, unmapped: unmapped };
  }

  /* ── canonical draft data → a live Formik patch ────────────────────────────── */
  function toLive(data) {
    data = data || {};
    var out = {}, i, pair;

    for (i = 0; i < FIELD_MAP.length; i++) {
      pair = FIELD_MAP[i];
      if (Object.prototype.hasOwnProperty.call(data, pair[0])) out[pair[1]] = data[pair[0]];
    }

    /* Prefer the verbatim original — it round-trips a value this table cannot map. */
    if (data.categoryRaw) out.category_type = data.categoryRaw;
    else if (data.category && CATEGORY_TO_LIVE[data.category]) out.category_type = CATEGORY_TO_LIVE[data.category];
    if (data.subCategoryRaw) out.sub_category_type = data.subCategoryRaw;

    if (Array.isArray(data.pickupStops) && data.pickupStops[0]) out.pickup_ = data.pickupStops[0];
    if (Array.isArray(data.dropoffStops) && data.dropoffStops[0]) out.dropoff_ = data.dropoffStops[0];

    out.need = data.scheduleType === 'now';
    out.flexible = data.scheduleType === 'flexible';
    if (data.timeSlot) out.request_schedule_time = data.timeSlot;

    out.select_gopher = data.workerSelection === 'select';
    out.notify_fav_gopher = data.workerSelection === 'my';

    /* Photos never transfer — leave `attachment` empty so the UI prompts rather than
       pretending the images came along. */
    out.attachment = [];

    return out;
  }

  /* ── strip engine-generated UI flags and non-serializable values ───────────── */
  function stripEngineNoise(values) {
    var out = {}, k, v;
    for (k in values) {
      if (!Object.prototype.hasOwnProperty.call(values, k)) continue;
      if (UI_SUFFIX.test(k)) continue;                   // <field>visible / disable / _radio
      v = values[k];
      if (isFileLike(v)) continue;                       // live File objects
      if (Array.isArray(v) && v.some(isFileLike)) continue;
      if (typeof v === 'function') continue;
      out[k] = v;
    }
    return out;
  }

  return {
    CATEGORY_TO_LIVE: CATEGORY_TO_LIVE,
    LIVE_TO_CATEGORY: LIVE_TO_CATEGORY,
    FIELD_MAP: FIELD_MAP,
    fromLive: fromLive,
    toLive: toLive,
    stripEngineNoise: stripEngineNoise
  };
});
