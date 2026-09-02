/* Gopher sign-in recovery — "Lost access to this number?" (owner ruling 2026-08-18)
   Shared by all four portals, same pattern as gopher-phone-input.js.

   SMS stays the primary sign-in and the mobile number stays the canonical profile id.
   This flow exists so a lost phone is not a permanently lost account. Recovery runs on
   the VERIFIED EMAIL and nothing else — the owner explicitly ruled out support-mediated
   recovery and knowledge-only questions, because a recovery path weaker than the primary
   quietly becomes the account's real security.

   Three rules are load-bearing, not styling. Do not weaken them in any port:
   1. A code only ever goes to an address ALREADY ON THE ACCOUNT — never one typed into
      this screen. An unrecognised address is refused outright and is never offered
      verification. (Otherwise recovery is a one-step account takeover.)
   2. An unverified email is NOT a dead end — it's the same verification the user skipped
      at signup, offered right here. Safe precisely because the code still goes to the
      address on file.
   3. The new number is proven by its own SMS code BEFORE anything is written. Without
      that, recovery is a way to point someone's account at another phone.

   Backend seam (verified at origin/production 2026-08-18, by App Prototypes): production
   has NO phone-change path at all — this introduces the first write to users.telephone.
   The real implementation must reject a new number that already resolves to a live
   account, normalised on the LAST 10 DIGITS (36 known collisions are one number stored
   in two formats), and notify the email + old number on completion. This module is the
   demo: nothing persists, codes are demo codes like the rest of the portal sign-ins. */
(function () {
  'use strict';
  if (window.GopherRecovery) return;

  var CSS =
    '.gr-overlay{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,22,52,0.55);}' +
    '.gr-overlay[hidden]{display:none !important;}' + /* [hidden] is not safe unguarded on these pages */
    '.gr-card{background:#fff;border-radius:18px;max-width:420px;width:100%;max-height:calc(100vh - 48px);overflow-y:auto;padding:26px 24px;font-family:"Nunito",sans-serif;color:#002461;box-shadow:0 24px 60px rgba(0,20,60,0.35);}' +
    '.gr-title{font-size:19px;font-weight:900;margin:0 0 6px;}' +
    '.gr-sub{font-size:13.5px;line-height:1.5;color:#4b5a7a;margin:0 0 16px;}' +
    '.gr-field{margin:0 0 14px;}' +
    '.gr-field label{display:block;font-size:12.5px;font-weight:800;margin-bottom:6px;}' +
    '.gr-field input{width:100%;box-sizing:border-box;border:1.5px solid #d5dbe8;border-radius:10px;padding:11px 12px;font-size:15px;font-family:inherit;color:#002461;}' +
    '.gr-field input:focus{outline:none;border-color:#33D975;}' +
    '.gr-err{font-size:12.5px;font-weight:700;color:#c0392b;margin:8px 0 0;display:none;line-height:1.45;}' +
    '.gr-err.show{display:block;}' +
    '.gr-note{font-size:12px;color:#4b5a7a;line-height:1.5;margin:10px 0 0;}' +
    '.gr-btn{display:block;width:100%;border:none;border-radius:12px;padding:13px 0;font-family:inherit;font-size:15px;font-weight:900;cursor:pointer;background:#33D975;color:#002461;margin-top:16px;}' +
    '.gr-btn:disabled{opacity:0.45;cursor:default;}' +
    '.gr-btn.gr-ghost{background:#eef1f7;color:#002461;margin-top:9px;font-weight:800;}' +
    '.gr-done{font-size:14px;line-height:1.55;}' +
    '.gr-step{display:none;}.gr-step.on{display:block;}' +
    '.gr-lost-link{display:inline-block;background:none;border:none;cursor:pointer;font-family:"Nunito",sans-serif;font-size:12.5px;font-weight:800;color:#4b5a7a;text-decoration:underline;padding:0;margin-top:10px;}' +
    '.gr-lost-link:hover{color:#002461;}';

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function maskEmail(e) {
    var at = e.indexOf('@');
    if (at < 1) return e;
    return e[0] + '•••' + e.slice(at);
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function last10(s) { return digits(s).slice(-10); }

  var overlay = null;

  function open(cfg) {
    // cfg: { portal, email, emailVerified, dob (any format, digits compared), phone,
    //        onRecovered(newDigits) }  — demo account values, nothing persists.
    if (overlay) overlay.remove();
    if (!document.getElementById('grCss')) {
      var st = el('style'); st.id = 'grCss'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    overlay = el('div', 'gr-overlay');
    var card = el('div', 'gr-card');
    overlay.appendChild(card);

    var masked = maskEmail(cfg.email);
    var newDigits = '';

    card.innerHTML =
      '<h3 class="gr-title">Lost access to this number?</h3>' +

      '<div class="gr-step on" data-gr="email">' +
      '<p class="gr-sub">We’ll recover your account through the email on file, then move your sign-in to a new number.</p>' +
      '<div class="gr-field"><label>Email on your account</label><input type="email" autocomplete="email" placeholder="you@email.com"></div>' +
      /* Rule 1: the typed email is only ever COMPARED to the address on file. A code is
         never sent to a typed address, and an unrecognised one is refused, not verified. */
      '<p class="gr-err"></p>' +
      '<button class="gr-btn" type="button">Continue</button>' +
      '<p class="gr-note">Codes are only ever sent to the address already on this account.</p>' +
      '</div>' +

      '<div class="gr-step" data-gr="verify-offer">' +
      /* Rule 2: unverified email is not a dead end — offer the signup verification here. */
      '<p class="gr-sub">That’s the email on your account, but it was never verified. Verify it now — it’s the same step you skipped at sign-up, and the code goes to <b>' + masked + '</b>.</p>' +
      '<button class="gr-btn" type="button">Send the verification code</button>' +
      '</div>' +

      '<div class="gr-step" data-gr="email-code">' +
      '<p class="gr-sub">Enter the 6-digit code we emailed to <b>' + masked + '</b>.</p>' +
      '<div class="gr-field"><label>Email code</label><input type="text" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"></div>' +
      '<p class="gr-err"></p>' +
      '<button class="gr-btn" type="button" disabled>Verify</button>' +
      '</div>' +

      '<div class="gr-step" data-gr="dob">' +
      '<p class="gr-sub">Confirm the date of birth on your account.</p>' +
      '<div class="gr-field"><label>Date of birth</label><input type="text" inputmode="numeric" placeholder="MM / DD / YYYY"></div>' +
      '<p class="gr-err"></p>' +
      '<button class="gr-btn" type="button">Continue</button>' +
      '</div>' +

      '<div class="gr-step" data-gr="new-number">' +
      '<p class="gr-sub">Enter your new mobile number. We’ll text it a code to prove it’s yours before anything changes.</p>' +
      '<div class="gr-field"><label>New mobile number</label><input type="tel" inputmode="numeric" maxlength="14" placeholder="(555) 555-5555" autocomplete="tel"></div>' +
      /* Production: also reject a number that already resolves to a live account
         (normalised on the last 10 digits) — see the backend seam note above. */
      '<p class="gr-err"></p>' +
      '<button class="gr-btn" type="button" disabled>Text a code to this number</button>' +
      '</div>' +

      '<div class="gr-step" data-gr="sms-code">' +
      /* Rule 3: the new number proves itself by SMS before anything is written. */
      '<p class="gr-sub">Enter the 6-digit code we texted to your new number.</p>' +
      '<div class="gr-field"><label>SMS code</label><input type="text" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"></div>' +
      '<p class="gr-err"></p>' +
      '<button class="gr-btn" type="button" disabled>Confirm new number</button>' +
      '</div>' +

      '<div class="gr-step" data-gr="done">' +
      '<p class="gr-sub"><b>You’re back in.</b></p>' +
      '<p class="gr-done">Your sign-in number has been updated. We’ve sent a notice to <b>' + masked + '</b> and to your old number, so a change you didn’t make can’t go unnoticed.</p>' +
      '<button class="gr-btn" type="button">Sign in with my new number</button>' +
      '</div>' +

      '<button class="gr-btn gr-ghost" type="button" data-gr-cancel>Cancel</button>';

    function step(name) { return card.querySelector('[data-gr="' + name + '"]'); }
    function show(name) {
      card.querySelectorAll('.gr-step').forEach(function (s) { s.classList.remove('on'); });
      step(name).classList.add('on');
      var inp = step(name).querySelector('input');
      if (inp) setTimeout(function () { inp.focus(); }, 60);
    }
    function err(name, msg) {
      var e = step(name).querySelector('.gr-err');
      if (e) { e.textContent = msg || ''; e.classList.toggle('show', !!msg); }
    }
    function close() { overlay.remove(); overlay = null; }

    // step: email — compare only, never send to a typed address (rule 1)
    (function () {
      var s = step('email'), inp = s.querySelector('input'), btn = s.querySelector('.gr-btn');
      btn.addEventListener('click', function () {
        var typed = inp.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typed)) { err('email', 'Enter a valid email address.'); return; }
        if (typed !== String(cfg.email).toLowerCase()) {
          err('email', 'That email isn’t on this account, so we can’t send it a code. Recovery only works through the address already on file.');
          return;
        }
        err('email', '');
        show(cfg.emailVerified === false ? 'verify-offer' : 'email-code');
      });
    })();

    step('verify-offer').querySelector('.gr-btn').addEventListener('click', function () { show('email-code'); });

    // demo codes: any 6 digits, same convention as the portal sign-in OTPs
    function wireCode(name, next) {
      var s = step(name), inp = s.querySelector('input'), btn = s.querySelector('.gr-btn');
      inp.addEventListener('input', function () {
        inp.value = digits(inp.value).slice(0, 6);
        btn.disabled = inp.value.length !== 6;
      });
      btn.addEventListener('click', next);
    }
    wireCode('email-code', function () { show('dob'); });

    (function () {
      var s = step('dob'), inp = s.querySelector('input'), btn = s.querySelector('.gr-btn');
      btn.addEventListener('click', function () {
        if (digits(inp.value) !== digits(cfg.dob)) { err('dob', 'That date of birth doesn’t match our records.'); return; }
        err('dob', ''); show('new-number');
      });
    })();

    (function () {
      var s = step('new-number'), inp = s.querySelector('input'), btn = s.querySelector('.gr-btn');
      inp.addEventListener('input', function () { btn.disabled = digits(inp.value).length !== 10; });
      btn.addEventListener('click', function () {
        var nd = last10(inp.value);
        if (nd === last10(cfg.phone)) { err('new-number', 'That’s already the number on this account.'); return; }
        err('new-number', ''); newDigits = nd; show('sms-code');
      });
    })();

    wireCode('sms-code', function () {
      if (typeof cfg.onRecovered === 'function') cfg.onRecovered(newDigits);
      show('done');
    });

    step('done').querySelector('.gr-btn').addEventListener('click', close);
    card.querySelector('[data-gr-cancel]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
    show('email');
  }

  window.GopherRecovery = { open: open };
})();
