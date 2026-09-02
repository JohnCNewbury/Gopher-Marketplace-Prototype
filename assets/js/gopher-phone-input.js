/* ═══════════════════════════════════════════════════════════════════════
   Gopher standard phone input (owner directive 2026-07-23)
   Every <input type="tel"> on a page that loads this file:
     • digits only — letters and symbols never land in the field
     • capped at 10 digits, live-formatted (XXX) XXX-XXXX
     • numeric keypad on mobile (inputmode="numeric" is set if missing)
   Listeners are DELEGATED on document, so dynamically-created fields
   (modals, previews, injected forms) inherit the standard automatically.
   Idempotent alongside per-field formatters (e.g. the sign-in smsPhone
   handler): both derive the same digits and produce the same string.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  function fmt(el){
    var d = (el.value.match(/\d/g) || []).join('').slice(0, 10);
    var v = d;
    if(d.length > 6)      v = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
    else if(d.length > 3) v = '(' + d.slice(0,3) + ') ' + d.slice(3);
    else if(d.length > 0) v = '(' + d;
    if(el.value !== v) el.value = v;
  }
  function arm(el){
    if(!el.getAttribute('inputmode'))    el.setAttribute('inputmode', 'numeric');
    if(!el.getAttribute('autocomplete')) el.setAttribute('autocomplete', 'tel');
    if(el.maxLength < 0 || el.maxLength > 14) el.maxLength = 14; /* "(XXX) XXX-XXXX" */
  }
  function isTel(t){ return t && t.matches && t.matches('input[type="tel"]'); }
  document.addEventListener('focusin', function(e){ if(isTel(e.target)) arm(e.target); });
  document.addEventListener('input',   function(e){ if(isTel(e.target)){ arm(e.target); fmt(e.target); } });
  function init(){
    Array.prototype.forEach.call(document.querySelectorAll('input[type="tel"]'), arm);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
