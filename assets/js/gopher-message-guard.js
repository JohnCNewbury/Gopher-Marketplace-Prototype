/* ===================================================================
   gopher-message-guard.js  —  shared in-app messaging guard (PROTOTYPE)

   ONE module, included by all four messaging surfaces (Connect, Request,
   Request App Prototype, Gopher Go Prototype) so the logic is identical
   everywhere and is tuned in exactly one file.

   SCOPE (decisions locked by John 2026-07-02):
     Covers ALL in-app communication violations, in two families:
       • off-platform circumvention — payment terms (incl. a bare "$"/amount,
         the precursor to CashApp), phone numbers, EMAIL addresses,
         "cancel and pay outside". (A physical street/job-site address is
         NOT a violation — it's required to do the job.)
       • conduct — foul / abusive / threatening language.
     Escalation is PER USER across all threads. Admin@ email + account flag
     fire at level >= CONFIG.adminAlertAtLevel (level 1 is a silent nudge).

   WHAT THIS IS (prototype layer):
     A CLIENT-SIDE keyword/pattern check that mirrors the existing
     age-restricted pop-up in Request. On a match it shows an escalating
     modal (educate -> warn -> block) whose copy matches the tripped family.
     It is a UX deterrent, NOT enforcement. A determined user can bypass
     any client-side check.

   WHAT THE REAL VERSION DOES (production layer — for the paid dev):
     The same UI, but the verdict comes from POST /messages/precheck and
     the BLOCK is enforced by the send endpoint refusing to deliver.
     See docs/handoff/messaging-precheck.md. The check() return shape
     below intentionally matches that endpoint's response so swapping
     local -> server is a one-function change.
   =================================================================== */
(function (global) {
  'use strict';

  /* Where this file was loaded from. The module always sits at
     <siteroot>/assets/js/gopher-message-guard.js, so the site root is two
     levels up — true on GitHub Pages (a SUBDIRECTORY deploy, where a
     root-absolute path would 404), on TigerTech, on Netlify, in the repo
     (Final/assets/js -> Final/), and from the _prototypes tree, which loads
     this file by a relative path of its own. Same runtime-resolution trick
     messaging-precheck.md already documents for the srcdoc iframe.
     Empty when the module is INLINED rather than <script src>'d — the
     absolute fallback below covers that. */
  var SELF = (function () {
    try {
      if (document.currentScript && document.currentScript.src) {
        return document.currentScript.src;
      }
      var tags = document.getElementsByTagName('script');
      for (var i = tags.length - 1; i >= 0; i--) {
        if (/gopher-message-guard\.js/.test(tags[i].src || '')) return tags[i].src;
      }
    } catch (e) { /* fall through to the absolute default */ }
    return '';
  }());

  function fromSiteRoot(rel, fallback) {
    if (SELF) {
      try { return new URL('../../' + rel, SELF).href; } catch (e) { /* noop */ }
    }
    return fallback;
  }

  /* ---- CONFIG (edit freely) -------------------------------------- */
  var CONFIG = {
    policyUrl: 'gopher-terms.html',   // relative + case-exact (GitHub Pages/Linux)
    /* "In-App Messaging Terms" link on the transaction-protection alert.
       Deep-links to ToS section 20, "In-App Communication & Accessibility"
       (owner 2026-08-18) — someone tapping this wants the rule that just
       fired, not the top of a 30-section contract. The anchor is the
       <section id="communication"> that wraps that heading; if the ToS is
       restructured, keep that id.
       Resolved at runtime rather than hardcoded. The old absolute value
       (https://gophergo.io/gopher-terms-of-service.html) is DEAD: gophergo.io
       is the current WordPress marketing site and 301s that path to its
       homepage, so the link went nowhere and the anchor was discarded with
       the redirect. Do not point this at gophergo.io again until the ToS
       actually ships on that host.
       The fallback is the GitHub Pages URL (owner, 2026-08-18) — the host
       where the ToS really lives today. It only fires when SELF is empty,
       i.e. when this module is INLINED instead of <script src>'d, which is
       the case in the Request srcdoc-iframe prototype. */
    termsUrl: fromSiteRoot(
      'gopher-terms-of-service.html#communication',
      'https://johncnewbury.github.io/Gopher-Marketplace/gopher-terms-of-service.html#communication'
    ),
    learnMoreUrl: 'gopher-faqs.html#staying-in-app',
    // Escalation is PER USER (across all threads). 1st hit -> level 1,
    // 2nd -> level 2, 3rd and beyond -> level 3 (blocked). Tune to taste.
    blockAtLevel: 3,
    // Production only: at this level and above the server emails
    // admin@gophergo.io and flags the account. Level 1 stays a silent nudge
    // (no email/flag) so admin@ isn't flooded by first-time educationals.
    // The prototype can't send email — see maybeAdminAlert() for the seam.
    adminAlertAtLevel: 2
  };

  /* ---- KEYWORDS / PATTERNS (this is the part your dev will grow) --
     Grouped by policy so the modal + future server log can say WHY.
     Keep each entry a RegExp; word boundaries avoid false hits.       */
  var PATTERNS = {
    payment: [
      /\bcash\s?app\b/i, /\bvenmo\b/i, /\bzelle\b/i, /\bpay\s?pal\b/i,
      /\bapple\s?pay\b/i, /\bgoogle\s?pay\b/i, /\bg-?pay\b/i,
      /\bwire\s?transfer\b/i, /\b(bit\s?coin|btc|crypto)\b/i,
      // The alternation used to take exactly ONE token — (?:you|me|in) — so
      // "pay in cash" and "pay me cash" matched but "pay me in cash" and
      // "paying you in cash" did NOT, i.e. the two most natural phrasings of
      // the thing we're trying to catch walked straight through. Both parts are
      // now independently optional. Still deliberately does NOT fire on past-
      // tense narration ("the last customer paid me in cash") — that is "paid",
      // which never enters this branch. (Fixed 2026-07-28.)
      /\bpay(?:ing)?\s+(?:(?:you|me)\s+)?(?:in\s+)?cash\b/i, /\bcash\s+only\b/i,
      /\bpay\s+(?:me|you)?\s*direct(?:ly)?\b/i, /\bpay\s+(?:me|you)?\s*outside\b/i,
      // A bare dollar figure is the precursor to CashApp circumvention
      // (John, 2026-07-02). Price is shown transparently in-app, so there's
      // no legitimate reason to type an amount in chat — flag it.
      /\$\s?\d/, /\b\d{1,6}(?:[.,]\d{2})?\s?(?:dollars|bucks)\b/i
    ],
    contact: [
      // phone: optional +1, area code, 7-digit body, common separators
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
      // EMAIL address (the ticket's "Address" meant email — a physical/
      // job-site address is required and is NOT flagged).
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      /\b(?:call|text|reach|hit)\s+(?:me|you|u)\b/i,
      /\bmy\s+(?:number|cell|phone|email|digits)\b/i,
      // REQUESTING contact info is flagged the same as sharing it — there is
      // ZERO reason to ask for a customer's number before being connected
      // (owner, 2026-07-16: "What is your number?" pre-connection = TOP red
      // flag). Adjacency keeps "your order number" / "your unit number"
      // from false-positives ("your" must sit right next to the noun).
      /\b(?:your|ur)\s+(?:number|phone|cell|mobile|digits|email|whats\s?app)\b/i,
      /\bnumber\s+to\s+(?:call|text|reach)\b/i,
      // Social handles are contact-sharing too (owner 2026-07-19; mirrors the
      // Dashboard lexicon's social_contact category) — so they connect-gate
      // with the rest of this family. Conservative list; John curates.
      /\b(?:insta|instagram|snap\s?chat|tele\s?gram|whats\s?app|discord)\b/i,
      /\b(?:dm|direct\s+message)\s+(?:me|you|u)\b/i,
      /\bmy\s+(?:handle|socials?)\b/i
    ],
    off_platform: [
      // "outside" previously required the literal "gopher", so "pay me outside
      // the app" matched NEITHER this nor `off\s+(?:the\s+)?(?:app|platform)`
      // (that one needs "off") — it fell between the two lists. Now covers
      // gopher / the app / the platform alike. (Owner 2026-07-28.)
      /\boutside\s+(?:of\s+)?(?:the\s+)?(?:gopher|app|platform)\b/i,
      /\boff\s+(?:the\s+)?(?:app|platform)\b/i,
      /\bcancel\s+(?:the\s+)?(?:request|order|job)\b/i,
      /\bcancel\s+and\s+pay\b/i, /\bmeet\s+up\s+and\s+pay\b/i,
      /\bdeal\s+outside\b/i, /\bpay\s+in\s+person\b/i
    ],
    // Foul / abusive / threatening language (family = 'conduct', not
    // circumvention — gets the "keep it respectful" copy). STARTER LIST,
    // conservative on purpose to limit false positives; John to review/grow.
    // Repeated letters tolerated (fuuuck); heavier obfuscation is dev work.
    conduct: [
      /\bf+u+c+k+\w*/i, /\bmother\s?f\w+/i, /\bs+h+i+t+\b/i,
      /\bbull\s?shit\w*/i, /\bb+i+t+c+h+\w*/i, /\bass\s?hole\w*/i,
      /\bc+u+n+t+\b/i, /\bdick\s?head\w*/i, /\bbastard\w*/i, /\bretard\w*/i,
      /\bpiss(?:ing|ed)?\s?(?:off|on you)\b/i, /\bscrew\s+(?:you|u)\b/i,
      // low-effort threats
      /\b(?:i'?ll|i(?:'?m| am)?\s+(?:gonna|going to)|gonna|going to)\s+(?:kill|beat|hurt|f\w+)\s+(?:you|u|ya)\b/i
    ]
  };

  /* Which copy family a tripped policy uses. Conduct gets respectful-tone
     copy; everything else gets the stay-in-app circumvention copy. */
  function familyOf(policy) { return policy === 'conduct' ? 'conduct' : 'offplatform'; }

  /* ---- MODAL COPY ----------------------------------------------------
     OFF-PLATFORM family (owner revision 2026-07-16): ONE alert, in TWO
     variants keyed by CONNECTION STATE — is this thread attached to a
     request the two parties are already matched on? Both variants offer
     "Edit message" (green) and "Send as-is" (blue, red pulsing shadow —
     the message goes out FLAGGED for human review), with an
     "In-App Messaging Terms" link underneath. No hard block: a real
     human reviews flags instead ("we'll always have a real human remove
     any flags that had the best intentions").
     CONDUCT family (owner revision 2026-07-19): keeps its three
     escalation levels of copy, but warn levels 1–2 now use the SAME
     button pair as off-platform — "Edit message" (green, holds the
     message) and "Send as-is" (blue pulsing, sends FLAGGED). A flagged
     conduct message is delivered, and the RECIPIENT sees the standard
     terms-violation note under the bubble (same format as off-platform
     flags — nothing new invented). Level 3 stays a hard block.           */
  var COPY = {
    offplatform: {
      notConnected: {
        title: 'Keep Your Transaction Protected',
        body: 'It looks like this conversation may be encouraging communication ' +
              'and/or transactions outside of Gopher. Keeping everything in the ' +
              'app protects both parties with secure payments, dispute ' +
              'resolution, ratings, and fraud protection. You can edit your ' +
              'message to avoid it being sent as-is, which is currently flagged. ' +
              'Once a customer and a worker are connected, communication alerts ' +
              'are relaxed considering exchanging personal info may be part of ' +
              'the request.'
      },
      connected: {
        title: 'Keep Your Transaction Protected',
        body: 'It looks like this conversation may be encouraging communication ' +
              'and/or transactions outside of Gopher. Keeping everything in the ' +
              'app protects both parties with secure payments, dispute ' +
              'resolution, ratings, and fraud protection. You can edit your ' +
              'message to avoid it being sent as-is, which is currently flagged. ' +
              'Please keep in mind we might flag a message incorrectly, so ' +
              'apologies in advance — we’ll always have a real human remove ' +
              'any flags that had the best intentions.'
      },
      editLabel: 'Edit message',
      sendLabel: 'Send as-is',
      termsLabel: 'In-App Messaging Terms'
    },
    conduct: {
      // Warn levels 1–2 (owner 2026-07-19): same Edit / Send-as-is pair as the
      // off-platform alert. "Edit message" holds the text in the composer;
      // "Send as-is" delivers it FLAGGED — the recipient sees the standard
      // terms-violation note under the bubble. The old single-button
      // acknowledge ("Got It" -> send unflagged) is retired.
      1: {
        verdict: 'warn',
        title: 'Keep It Respectful',
        body: 'Please keep messages professional and respectful. Abusive, ' +
              'threatening, or harassing language goes against our Community ' +
              'Guidelines and helps no one get the job done. You can edit ' +
              'your message, or send it as-is — sent as-is, it will be ' +
              'delivered with a note that it may violate our terms.',
        secondary: 'View Guidelines',
        secondaryUrl: function () { return CONFIG.policyUrl; }
      },
      2: {
        verdict: 'warn',
        title: 'Conduct Warning',
        body: 'Abusive, threatening, or harassing language violates our Terms ' +
              'of Service. Continued violations may result in account ' +
              'restrictions. You can edit your message, or send it as-is — ' +
              'sent as-is, it will be delivered with a note that it may ' +
              'violate our terms.',
        secondary: 'View Policy',
        secondaryUrl: function () { return CONFIG.policyUrl; }
      },
      3: {
        verdict: 'block',
        title: 'Message Not Sent',
        body: 'This message contains language that violates our Community ' +
              "Guidelines, so it wasn't delivered. Please revise it to continue.",
        primary: 'Edit Message',
        secondary: null
      },
      editLabel: 'Edit message',
      sendLabel: 'Send as-is'
    }
  };
  // Verdict-by-level mapping (1,2 = warn; 3 = block) now lives on the conduct
  // family only — off-platform hits are ALWAYS 'warn' (the user can Send as-is;
  // the message just goes out flagged for human review).
  var LEVELS = COPY.conduct;

  /* ---- escalation state — PER USER across all threads (in-memory;
     resets on reload). Prototype has one simulated user, so a single key
     accumulates across every conversation. Production keys by real user id. */
  var counts = Object.create(null);
  var USER_KEY = '_user';

  /* ---- detection -------------------------------------------------- *
     Returns a verdict object whose shape matches /messages/precheck:
       { verdict:'allow'|'warn'|'block', policy, level, matched }      */
  /* ---- spelled-out digits (owner, 2026-08-18) --------------------
     "five five five one one one two seven eight five" was sailing through:
     every pattern here is a regex tested against the raw string, and a
     spelled-out number contains no digits to match. The owner flagged it as
     a COMMON practice, and messaging-precheck.md already listed it as a
     known limitation ("misses obfuscation like v3nmo or spelled-out
     digits").

     Rather than add a second, weaker phone pattern, normalise a COPY of the
     message and re-test the existing tuned patterns against it. Nothing is
     rewritten for the user; the original text is what sends.

     The safety valve is the run length: only runs of THREE OR MORE adjacent
     number-words collapse. An isolated word is left alone, so "I need one
     more box" never becomes "I need 1 more box" and can never drift into a
     phone match. A short run like "one two three" does collapse to "123",
     which is still far short of the 7-digit body the phone pattern needs.

     Mixed forms work for free, because collapsing happens in place:
     "eight oh five 624 1724" -> "805 624 1724", which the phone regex
     already knows how to read.

     NOT covered, and deliberately so: homophones ("won too tree"), letter
     substitution ("v3nmo"), and non-English number words. Those need the
     real classifier behind POST /messages/precheck, not more regex. */
  var NUM_WORD = {
    zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9'
  };
  var NUM_TOKEN = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|niner)';
  var NUM_RUN = new RegExp(
    '\\b' + NUM_TOKEN + '(?:[\\s.,\\-]+' + NUM_TOKEN + '){2,}\\b', 'gi'
  );

  function spellOutToDigits(text) {
    if (!text) return '';
    return String(text).replace(NUM_RUN, function (run) {
      var out = '';
      var parts = run.split(/[\s.,\-]+/);
      for (var i = 0; i < parts.length; i++) {
        out += NUM_WORD[parts[i].toLowerCase()] || '';
      }
      return out;
    });
  }

  function check(text, threadId, opts) {
    opts = opts || {};
    var hits = [];
    /* Tested in addition to the raw text, never instead of it. */
    var probe = spellOutToDigits(text);
    var useProbe = probe !== String(text || '');
    for (var policy in PATTERNS) {
      // Connected relaxation (owner 2026-07-16, re-confirmed with precise scope
      // 2026-07-19): once a worker has ACCEPTED the thread's job (assigned,
      // accepted offer/counter, in progress, or delivered), contact exchange is
      // legitimate post-acceptance coordination — ONLY the 'contact' family
      // (numbers, emails, asks, social handles) is skipped. Payment /
      // off-platform stay checked (fee circumvention doesn't stop being
      // circumvention on an accepted job), and conduct is UNCONDITIONAL
      // ("bad language isn't allowed, period"). This mirrors the Dashboard
      // Message Review rule `context_rules.contact_on_connected_order`
      // (moderation_rules.json / iaContactOnConnected in app_part4.js).
      if (opts.connected && policy === 'contact') continue;
      var list = PATTERNS[policy];
      for (var i = 0; i < list.length; i++) {
        if (list[i].test(text) || (useProbe && list[i].test(probe))) {
          hits.push(policy); break;
        }
      }
    }
    if (!hits.length) return { verdict: 'allow', policy: null, level: 0, matched: [] };

    // Escalate PER USER, not per thread — a repeat offender can't reset by
    // opening a new conversation (John, 2026-07-02). threadId is still passed
    // for the production log/telemetry; the prototype just counts per user.
    counts[USER_KEY] = (counts[USER_KEY] || 0) + 1;
    var level = Math.min(counts[USER_KEY], CONFIG.blockAtLevel);
    var family = familyOf(hits[0]);
    return {
      // Off-platform is never hard-blocked anymore — the alert offers Send
      // as-is and the message goes out FLAGGED. Conduct keeps its block level.
      verdict: family === 'offplatform' ? 'warn' : LEVELS[level].verdict,
      policy: hits[0],          // first category that tripped (log/telemetry)
      family: family,
      connected: !!opts.connected,
      flagged: true,            // production: message delivers with a `flagged` field for human review
      level: level,
      threadId: threadId || null,
      matched: hits
    };
  }

  /* ---- admin-alert seam ------------------------------------------- *
     PROTOTYPE: a console breadcrumb only. PRODUCTION: at level >=
     CONFIG.adminAlertAtLevel the server emails admin@gophergo.io, flags the
     account, and logs the event (ActiveAdmin). Level 1 stays silent.       */
  function maybeAdminAlert(result) {
    if (result.level < CONFIG.adminAlertAtLevel) return;
    if (global.console && console.info) {
      console.info('[message-guard] PROD would email admin@ + flag account:', {
        policy: result.policy, level: result.level, threadId: result.threadId
      });
    }
  }

  /* ---- the public entry point ------------------------------------ *
     guard(text, threadId, { connected, onAllow, onBlocked })
       connected  -> TRUE when this thread belongs to a request the two
                     parties are already matched on. Picks the alert
                     variant AND relaxes the 'contact' patterns.
       onAllow    -> called when the message may be sent: no hit (called
                     with no argument), OR the user chose "Send as-is" on
                     EITHER family (called with the verdict — flagged:true;
                     store the flag so the recipient gets the standard
                     terms-violation note). Wire your real send here.
       onBlocked  -> called when the message is held back ("Edit message"
                     on either alert, or a conduct level-3 block). */
  function guard(text, threadId, handlers) {
    handlers = handlers || {};
    var pass = handlers.onAllow || function () {};
    var stop = handlers.onBlocked || function () {};
    var result = check(text, threadId, { connected: !!handlers.connected });

    if (result.verdict === 'allow') { pass(); return result; }

    maybeAdminAlert(result);  // prod: email admin@ + flag at level >= 2

    showModal(result.level, {
      family: result.family,
      connected: result.connected,
      onPrimary: function () {
        // Primary = "Edit message" on every warn (both families, owner
        // 2026-07-19) and on the conduct level-3 block -> hold the message.
        stop(result);
      },
      onSendAsIs: function () { pass(result); }  // flagged send — human review removes good-faith flags
    });
    return result;
  }

  /* ---- modal rendering (themed to the site, accessible) ---------- */
  var STYLE_ID = 'gmg-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
    '.gmg-overlay{position:fixed;inset:0;background:rgba(17,24,28,.55);' +
      'display:flex;align-items:center;justify-content:center;z-index:9999;' +
      'padding:20px;animation:gmg-fade .15s ease-out}' +
    '.gmg-card{background:#fff;max-width:440px;width:100%;border-radius:16px;' +
      'box-shadow:0 20px 60px rgba(0,0,0,.25);padding:28px 26px 22px;' +
      'font-family:inherit;color:#1b2227}' +
    '.gmg-card h2{margin:0 0 10px;font-size:1.2rem;line-height:1.3;font-weight:700}' +
    '.gmg-card p{margin:0 0 22px;font-size:.95rem;line-height:1.55;color:#3a444b}' +
    '.gmg-actions{display:flex;flex-direction:column;gap:10px}' +
    '.gmg-btn{appearance:none;border:0;border-radius:10px;padding:12px 16px;' +
      'font:inherit;font-weight:600;cursor:pointer}' +
    '.gmg-btn-primary{background:var(--green,#33D975);color:#08130b}' +
    '.gmg-btn-primary:hover{filter:brightness(.95)}' +
    '.gmg-btn-secondary{background:transparent;color:#3a444b;text-decoration:underline}' +
    // "Send as-is" — blue, with a reddish PULSING shadow (a visual "are you
    // sure" without blocking the choice; the message goes out flagged).
    '.gmg-btn-sendas{background:#002461;color:#fff;animation:gmg-pulse 1.6s ease-out infinite}' +
    '.gmg-btn-sendas:hover{filter:brightness(1.12)}' +
    '.gmg-terms{display:block;text-align:center;margin-top:14px;font-size:.85rem;' +
      'color:#3a444b;text-decoration:underline;cursor:pointer}' +
    '.gmg-btn:focus-visible{outline:3px solid #1b73e8;outline-offset:2px}' +
    '@keyframes gmg-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes gmg-pulse{0%{box-shadow:0 0 0 0 rgba(224,74,61,.55)}' +
      '70%{box-shadow:0 0 0 11px rgba(224,74,61,0)}100%{box-shadow:0 0 0 0 rgba(224,74,61,0)}}' +
    '@media (prefers-reduced-motion:reduce){.gmg-overlay{animation:none}' +
      '.gmg-btn-sendas{animation:none;box-shadow:0 0 0 3px rgba(224,74,61,.4)}}';
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function showModal(level, handlers) {
    injectStyle();
    handlers = handlers || {};
    // Pick the copy family (defaults to off-platform so legacy 2-arg callers
    // that pass no family keep working unchanged).
    var fam = (handlers.family && COPY[handlers.family]) ? handlers.family : 'offplatform';
    // Off-platform: ONE alert in two connection-state variants (not leveled).
    var offp = (fam === 'offplatform');
    var L = offp
      ? COPY.offplatform[handlers.connected ? 'connected' : 'notConnected']
      : COPY[fam][level];
    // Every warn — off-platform AND conduct levels 1–2 — gets the same
    // "Edit message" / "Send as-is" pair (owner 2026-07-19). Only the
    // conduct level-3 block keeps a single Edit button.
    var pair = offp || (fam === 'conduct' && L.verdict === 'warn');
    var lastFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'gmg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gmg-title');

    var card = document.createElement('div');
    card.className = 'gmg-card';

    var h = document.createElement('h2');
    h.id = 'gmg-title'; h.textContent = L.title;

    var p = document.createElement('p');
    p.textContent = L.body;

    var actions = document.createElement('div');
    actions.className = 'gmg-actions';

    var primary = document.createElement('button');
    primary.className = 'gmg-btn gmg-btn-primary';
    primary.textContent = pair ? COPY[fam].editLabel : L.primary;

    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    primary.addEventListener('click', function () {
      close();
      if (handlers.onPrimary) handlers.onPrimary();
    });

    actions.appendChild(primary);

    if (pair) {
      // "Send as-is" — blue with the reddish pulsing shadow. Sends flagged;
      // the recipient sees the standard terms-violation note.
      var sendAs = document.createElement('button');
      sendAs.className = 'gmg-btn gmg-btn-sendas';
      sendAs.textContent = COPY[fam].sendLabel;
      sendAs.addEventListener('click', function () {
        close();
        if (handlers.onSendAsIs) handlers.onSendAsIs();
      });
      actions.appendChild(sendAs);
    } else if (L.secondary) {
      var secondary = document.createElement('button');
      secondary.className = 'gmg-btn gmg-btn-secondary';
      secondary.textContent = L.secondary;
      secondary.addEventListener('click', function () {
        var url = L.secondaryUrl && L.secondaryUrl();
        if (url) window.open(url, '_blank', 'noopener');
      });
      actions.appendChild(secondary);
    }

    card.appendChild(h); card.appendChild(p); card.appendChild(actions);

    if (offp) {
      // "In-App Messaging Terms" — sits below the buttons, points directly
      // at the Terms of Service.
      var terms = document.createElement('a');
      terms.className = 'gmg-terms';
      terms.textContent = COPY.offplatform.termsLabel;
      terms.href = CONFIG.termsUrl;
      terms.target = '_blank'; terms.rel = 'noopener';
      card.appendChild(terms);
    } else if (pair && L.secondary) {
      // Conduct warn — "View Guidelines"/"View Policy" sits below the pair,
      // same underline-link slot the off-platform terms link uses.
      var glink = document.createElement('a');
      glink.className = 'gmg-terms';
      glink.textContent = L.secondary;
      glink.href = (L.secondaryUrl && L.secondaryUrl()) || CONFIG.policyUrl;
      glink.target = '_blank'; glink.rel = 'noopener';
      card.appendChild(glink);
    }
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    primary.focus();

    // Esc = the safe choice: acknowledge warn / edit on block (same as primary)
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); primary.click(); }
      // crude focus trap: keep Tab inside the card
      if (e.key === 'Tab') {
        var f = card.querySelectorAll('button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
  }

  /* ---- expose ----------------------------------------------------- */
  global.GopherMessageGuard = {
    check: check,
    guard: guard,
    showModal: showModal,
    familyOf: familyOf,
    // Escalation is per-user now, so reset clears the whole counter (the
    // optional arg is accepted for back-compat but no longer thread-scoped).
    reset: function () { counts = Object.create(null); },
    config: CONFIG,
    patterns: PATTERNS,
    copy: COPY,
    levels: LEVELS   // back-compat alias (now the conduct family — offplatform is variant-keyed, not leveled)
  };
})(window);
