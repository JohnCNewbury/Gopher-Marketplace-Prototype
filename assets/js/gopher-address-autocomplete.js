/* Gopher shared address autocomplete — one robust path for every address field.
 *
 * Why this exists: the pages used a mix of the DEPRECATED google.maps.places.Autocomplete
 * widget (which mis-renders inside modals — the "Oops! Something went wrong" overlay) and,
 * on many fields, no autocomplete at all. This module gives every field the same behavior:
 *   - Places API (New) AutocompleteSuggestion first, legacy AutocompleteService as fallback.
 *   - A custom dropdown (no widget), so it works in modals and never throws the overlay.
 *   - Graceful, VISIBLE failure: if the Maps key blocks the domain (RefererNotAllowedMapError)
 *     the field stays typeable and shows why, instead of silently doing nothing.
 *   - On pick, the chosen address is geocoded once so each field gets structured parts
 *     (street/city/state/zip + lat/lng) for auto-fill, audience mapping, distance, etc.
 *
 * Usage:
 *   GopherAddressAC.attach(inputEl, {
 *     onPick: function(detail){ ... },   // detail = {description, formatted, street, city, state, zip, lat, lng}
 *     onNote: function(msg){ ... },       // optional; where to show an "unavailable" reason (default: inline note under the field)
 *     country: 'us'                       // optional region restriction (default 'us')
 *   });
 *   GopherAddressAC.geocode(text, function(detail|null, status){ ... });   // for Save-style verification
 *
 * Maps is loaded async on the host page; this module lazily checks readiness at focus/type time,
 * so attach() is safe to call before Maps has finished loading.
 */
(function(){
  'use strict';
  if (window.GopherAddressAC) return;

  function ready(){ return !!(window.google && window.google.maps && google.maps.places); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  // ── one shared dropdown + session token across all fields on the page ──
  var _predEl = null, _activeInput = null, _seq = 0, _tok = null, _acSvc = null;

  function _newTok(){ try { return new google.maps.places.AutocompleteSessionToken(); } catch(_){ return null; } }
  function hidePred(){ if (_predEl){ _predEl.remove(); _predEl = null; } _activeInput = null; }

  // cb(list) with description strings; cb(null, reason) when Google refuses the call.
  // NOTE: when a key blocks the domain, the NEW api rejects but the LEGACY one never calls
  // back at all — so the legacy leg is time-boxed, else the dropdown just never appears.
  function fetchPreds(q, country, cb){
    var P = google.maps.places;
    if (P.AutocompleteSuggestion && P.AutocompleteSuggestion.fetchAutocompleteSuggestions){
      var req = { input:q, includedRegionCodes:[country] }; if (_tok) req.sessionToken = _tok;
      P.AutocompleteSuggestion.fetchAutocompleteSuggestions(req).then(function(r){
        cb(((r && r.suggestions) || []).map(function(s){
          var p = s.placePrediction; return (p && p.text && p.text.text) || '';
        }).filter(Boolean));
      }).catch(function(e){
        // Whatever the New Places API failure (blocked by the key's API allowlist,
        // not enabled, referer, quota), ALWAYS try the legacy AutocompleteService —
        // it's a separate API that is commonly still allowed on the key. Only show
        // a hint if the legacy leg fails too.
        var m = String((e && e.message) || e);
        legacyPreds(q, country, function(preds, err){
          if (preds){ cb(preds); return; }
          cb(null, /referer|referrer|blocked|not authorized|ApiNotActivated|API key|PERMISSION_DENIED/i.test(m) ? keyHint(m) : (err || keyHint(m)));
        });
      });
      return;
    }
    legacyPreds(q, country, cb);
  }
  function keyHint(msg){
    return /referer|referrer|blocked/i.test(msg)
      ? 'this domain is not authorized on the Google Maps API key'
      : msg;
  }
  function legacyPreds(q, country, cb){
    var P = google.maps.places;
    if (!P.AutocompleteService){ cb(null, 'Places library unavailable'); return; }
    if (!_acSvc) _acSvc = new P.AutocompleteService();
    var done = false;
    var t = setTimeout(function(){ if(!done){ done = true; cb(null, 'Google did not respond — check the API key restrictions'); } }, 5000);
    _acSvc.getPlacePredictions({ input:q, sessionToken:_tok, componentRestrictions:{ country:country } }, function(preds, status){
      if (done) return; done = true; clearTimeout(t);
      if (status === 'OK' && preds && preds.length) cb(preds.map(function(p){ return p.description; }));
      else if (status === 'ZERO_RESULTS') cb([]);
      else cb(null, status || 'ERROR');
    });
  }

  // ── geocode a chosen/typed address into structured parts ──
  var _geo = null;
  function parse(res){
    var c = { description:'', formatted: res.formatted_address || '', street:'', city:'', state:'', zip:'', lat:null, lng:null };
    var num = '', route = '';
    (res.address_components || []).forEach(function(comp){
      var t = comp.types || [];
      if (t.indexOf('street_number') > -1) num = comp.long_name;
      if (t.indexOf('route') > -1) route = comp.long_name;
      if (t.indexOf('locality') > -1 || t.indexOf('sublocality') > -1 || t.indexOf('postal_town') > -1) c.city = c.city || comp.long_name;
      if (t.indexOf('administrative_area_level_1') > -1) c.state = comp.short_name;
      if (t.indexOf('postal_code') > -1) c.zip = comp.long_name;
    });
    c.street = (num + ' ' + route).trim();
    try { var loc = res.geometry && res.geometry.location; if (loc){ c.lat = loc.lat(); c.lng = loc.lng(); } } catch(_){}
    return c;
  }
  function geocode(text, cb){
    if (!ready()){ cb(null, 'MAPS_NOT_READY'); return; }
    if (!_geo) _geo = new google.maps.Geocoder();
    var done = false;
    var t = setTimeout(function(){ if(!done){ done = true; cb(null, 'TIMEOUT'); } }, 6000);
    _geo.geocode({ address:text }, function(res, status){
      if (done) return; done = true; clearTimeout(t);
      if (status === 'OK' && res && res[0]){ var d = parse(res[0]); d.description = text; cb(d, 'OK'); }
      else cb(null, status || 'ERROR');
    });
  }

  // ── the dropdown UI, shared by every attached field ──
  function ensureStyle(){
    if (document.getElementById('gac-style')) return;
    var s = document.createElement('style'); s.id = 'gac-style';
    s.textContent =
      '.gac-pred{position:absolute;z-index:2147483000;background:#fff;border:1px solid #e3e8ef;border-radius:12px;'+
      'box-shadow:0 12px 30px rgba(13,26,62,.2);padding:5px;max-height:260px;overflow:auto;}'+
      '.gac-pred-row{display:block;width:100%;text-align:left;border:none;background:none;padding:9px 11px;'+
      'border-radius:8px;font-family:inherit;font-size:13px;color:#2b2f36;cursor:pointer;white-space:nowrap;'+
      'overflow:hidden;text-overflow:ellipsis;}'+
      '.gac-pred-row:hover,.gac-pred-row.gac-active{background:#eef7f1;}'+
      '.gac-note{font-family:inherit;font-size:12px;line-height:1.35;color:#b23b3b;margin-top:6px;}';
    document.head.appendChild(s);
  }
  function defaultNoteEl(input){
    var n = input._gacNote;
    if (!n){ n = document.createElement('div'); n.className = 'gac-note'; n.hidden = true;
      if (input.parentNode) input.parentNode.insertBefore(n, input.nextSibling); input._gacNote = n; }
    return n;
  }
  function showNote(input, opts, msg){
    if (opts.onNote){ opts.onNote(msg); return; }
    var n = defaultNoteEl(input);
    if (msg){ n.textContent = 'Address suggestions are unavailable (' + msg + ') — type the full address; we still verify it on save.'; n.hidden = false; }
    else { n.textContent = ''; n.hidden = true; }
  }
  function place(input){
    if (!_predEl) return;
    /* ABSOLUTE in PAGE coordinates, not fixed in viewport coordinates
       (2026-08-14, owner's iPhone repro). position:fixed pins to the LAYOUT
       viewport, but when the mobile keyboard opens, iOS Safari pans the VISUAL
       viewport — so a fixed box placed at getBoundingClientRect() renders far
       from the input the user is actually looking at (it appeared ~300px above
       the Destination field, over a different section). Absolute + scroll
       offsets keeps the box glued to the input in page flow no matter how the
       visual viewport pans. The capture-phase scroll listener below still
       repositions when an INNER container scrolls. */
    var r = input.getBoundingClientRect();
    var sx = window.scrollX || window.pageXOffset || 0;
    var sy = window.scrollY || window.pageYOffset || 0;
    _predEl.style.left = Math.round(r.left + sx) + 'px';
    _predEl.style.top = Math.round(r.bottom + 4 + sy) + 'px';
    _predEl.style.width = Math.round(r.width) + 'px';
  }

  function pick(input, opts, desc){
    input.value = desc;   // the field shows the chosen address immediately
    hidePred();
    _tok = null;          // a pick closes the Places session
    if (opts.onNote) opts.onNote('');   // clear any prior "unavailable" note
    else if (input._gacNote){ input._gacNote.textContent = ''; input._gacNote.hidden = true; }
    // Fire 'change' (not 'input') so host dirty/gate listeners react to the programmatic fill
    // without retriggering our own input-driven requery.
    try { input.dispatchEvent(new Event('change', { bubbles:true })); } catch(_){}
    // Geocode once to hand structured parts (street/city/state/zip + lat/lng) to onPick.
    // onPick fires exactly once — with full parts when geocoding succeeds, else description-only.
    geocode(desc, function(detail){
      var d = detail || { description:desc, formatted:desc, street:'', city:'', state:'', zip:'', lat:null, lng:null };
      if (opts.onPick) opts.onPick(d);
    });
  }

  function requery(input, opts){
    if (!ready()) return;
    var q = (input.value || '').trim();
    if (q.length < 3){ hidePred(); return; }
    if (!_tok) _tok = _newTok();
    var mySeq = ++_seq;
    fetchPreds(q, opts.country || 'us', function(list, reason){
      if (mySeq !== _seq || _activeInput !== input) return;   // superseded by a newer keystroke/field
      hidePredKeepActive();
      if (!list){
        console.warn('[gopher] Places autocomplete unavailable:', reason);
        showNote(input, opts, reason);
        return;
      }
      showNote(input, opts, '');
      if (!list.length) return;
      ensureStyle();
      var box = document.createElement('div'); box.className = 'gac-pred';
      box.innerHTML = list.slice(0, 5).map(function(d){
        return '<button type="button" class="gac-pred-row" data-desc="' + esc(d) + '">' + esc(d) + '</button>';
      }).join('');
      document.body.appendChild(box);
      _predEl = box; _activeInput = input; place(input);
      box.addEventListener('mousedown', function(e){ e.preventDefault(); });
      box.addEventListener('click', function(e){
        var b = e.target.closest('[data-desc]'); if (!b) return;
        pick(input, opts, b.getAttribute('data-desc'));
      });
    });
  }
  // hide the dropdown element but keep _activeInput so an in-flight callback can still render
  function hidePredKeepActive(){ if (_predEl){ _predEl.remove(); _predEl = null; } }

  // reposition on scroll/resize while a dropdown is open
  window.addEventListener('scroll', function(){ if (_predEl && _activeInput) place(_activeInput); }, true);
  window.addEventListener('resize', function(){ if (_predEl && _activeInput) place(_activeInput); });
  /* The keyboard opening/closing fires visualViewport resize, not window resize. */
  if (window.visualViewport){
    window.visualViewport.addEventListener('resize', function(){ if (_predEl && _activeInput) place(_activeInput); });
    window.visualViewport.addEventListener('scroll', function(){ if (_predEl && _activeInput) place(_activeInput); });
  }
  // dismiss on outside click
  document.addEventListener('mousedown', function(e){
    if (_predEl && !_predEl.contains(e.target) && e.target !== _activeInput) hidePred();
  }, true);

  function attach(input, opts){
    if (typeof input === 'string') input = document.getElementById(input);
    if (!input || input._gacBound) return;
    input._gacBound = true;
    opts = opts || {};
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', function(){ _activeInput = input; requery(input, opts); });
    input.addEventListener('focus', function(){ _activeInput = input; if ((input.value||'').trim().length >= 3) requery(input, opts); });
    // keyboard: arrow/enter/escape over the open dropdown
    input.addEventListener('keydown', function(e){
      if (!_predEl || _activeInput !== input) return;
      var rows = Array.prototype.slice.call(_predEl.querySelectorAll('.gac-pred-row'));
      if (!rows.length) return;
      var i = rows.findIndex(function(r){ return r.classList.contains('gac-active'); });
      if (e.key === 'ArrowDown'){ e.preventDefault(); i = (i + 1) % rows.length; }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); i = (i - 1 + rows.length) % rows.length; }
      else if (e.key === 'Enter'){ if (i > -1){ e.preventDefault(); pick(input, opts, rows[i].getAttribute('data-desc')); } return; }
      else if (e.key === 'Escape'){ hidePred(); return; }
      else return;
      rows.forEach(function(r){ r.classList.remove('gac-active'); });
      if (rows[i]){ rows[i].classList.add('gac-active'); rows[i].scrollIntoView({ block:'nearest' }); }
    });
    return input;
  }

  // Attach lazily by id the first time a matching field is focused — handy for fields that
  // are injected into the DOM after load (dynamic stop rows, modals opened on demand).
  function attachOnFocus(idOrMatcher, opts){
    document.addEventListener('focusin', function(e){
      var t = e.target; if (!t || t._gacBound) return;
      var hit = typeof idOrMatcher === 'function' ? idOrMatcher(t) : (t.id === idOrMatcher);
      if (hit) attach(t, typeof opts === 'function' ? opts(t) : opts);
    });
  }

  window.GopherAddressAC = { attach:attach, attachOnFocus:attachOnFocus, geocode:geocode, ready:ready, hide:hidePred };
})();
