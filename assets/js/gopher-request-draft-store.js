/* gopher-request-draft-store.js — storage + transport for the request draft kernel.
   ================================================================================
   The kernel (gopher-request-draft.js) decides WHAT a draft is. This decides WHERE it
   lives and WHEN it moves. Split deliberately: the kernel is pure and trivially
   testable; everything platform-shaped — localStorage, Capacitor Preferences, fetch,
   timers — is isolated here behind one small adapter interface.

   ADAPTER INTERFACE (all async, all may reject):
       load()        -> draft | null
       save(draft)   -> draft   (echoes back the STORED draft, incl. server rev/updatedAt)
       clear()       -> void

   Nothing here imports anything. Platform objects (localStorage, Capacitor's
   Preferences, fetch) are INJECTED by the caller. That keeps this file loadable in a
   plain <script>, in a React/Capacitor bundle, and in a Node test with no shims — and
   it means adding a platform never means editing this file.

   AUTOSAVE PACING IS A HARD CONSTRAINT, NOT A PREFERENCE.
   The API applies ONE global rate limiter — 30 requests/sec per IP, before routing
   (index.js) — shared with live order traffic. Behind a proxy it keys on the proxy IP,
   so every requester on the platform shares that bucket. A per-keystroke autosave from
   even a handful of users would contend with order creation. Hence: debounce on idle,
   a hard floor between remote writes, coalescing, and skipping saves when nothing
   changed. Do not lower these without understanding that limiter.

   UMD (CommonJS + AMD + global) for the same reason as the kernel. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gopher-request-draft.js'));
  else if (typeof define === 'function' && define.amd) define(['./gopher-request-draft.js'], factory);
  else root.GopherRequestDraftStore = factory(root.GopherRequestDraft);
})(typeof self !== 'undefined' ? self : this, function (Kernel) {
  'use strict';

  var DEFAULTS = {
    debounceMs: 2500,      // idle time before a write is even considered
    minIntervalMs: 8000,   // hard floor between two REMOTE writes (rate-limiter budget)
    maxRetries: 5,
    retryBaseMs: 2000      // exponential: 2s, 4s, 8s, 16s, 32s
  };

  function noop() {}
  function nowMs() { return Date.now(); }

  /* ── Adapters ─────────────────────────────────────────────────────────────── */

  function memoryAdapter() {
    var cell = null;
    return {
      name: 'memory',
      load: function () { return Promise.resolve(cell); },
      save: function (d) { cell = d; return Promise.resolve(cell); },
      clear: function () { cell = null; return Promise.resolve(); }
    };
  }

  /* Web: localStorage. Survives a reload and a browser restart, same-origin only.
     This is the resume path when the user is signed OUT, or the network is down. */
  function webLocalAdapter(opts) {
    opts = opts || {};
    var key = opts.key || 'gopher.request.draft';
    var ls = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    return {
      name: 'web-local',
      load: function () {
        try { return Promise.resolve(JSON.parse(ls.getItem(key) || 'null')); }
        catch (e) { return Promise.resolve(null); }
      },
      save: function (d) {
        try { ls.setItem(key, JSON.stringify(d)); } catch (e) {}   // quota — non-fatal
        return Promise.resolve(d);
      },
      clear: function () { try { ls.removeItem(key); } catch (e) {} return Promise.resolve(); }
    };
  }

  /* Native: Capacitor Preferences, INJECTED — this file never imports @capacitor/*, so
     the web build carries no native dependency and the native build needs no shim.
         import { Preferences } from '@capacitor/preferences';
         capacitorPreferencesAdapter({ Preferences: Preferences }) */
  function capacitorPreferencesAdapter(opts) {
    opts = opts || {};
    var P = opts.Preferences;
    var key = opts.key || 'gopher.request.draft';
    if (!P) throw new Error('capacitorPreferencesAdapter requires { Preferences }');
    return {
      name: 'capacitor-preferences',
      load: function () {
        return P.get({ key: key }).then(function (r) {
          try { return JSON.parse((r && r.value) || 'null'); } catch (e) { return null; }
        });
      },
      save: function (d) {
        return P.set({ key: key, value: JSON.stringify(d) }).then(function () { return d; });
      },
      clear: function () { return P.remove({ key: key }); }
    };
  }

  /* Server: the cross-device path. `getHeaders` is injected because auth differs per
     platform and this module must not know how a token is stored. The API reads its
     token from the `access-token` header (not Authorization) and returns
     { status:'success', data, success:true } — both are the backend's existing idiom,
     so the caller supplies exact headers and we unwrap `data` defensively. */
  function remoteAdapter(opts) {
    opts = opts || {};
    var f = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    var base = (opts.baseUrl || '').replace(/\/$/, '');
    var path = opts.path || '/api/v1/requests/draft';
    var getHeaders = opts.getHeaders || function () { return {}; };
    if (!f) throw new Error('remoteAdapter requires a fetch implementation');

    function headers() {
      var h = getHeaders() || {};
      var out = { 'Content-Type': 'application/json' }, k;
      for (k in h) if (Object.prototype.hasOwnProperty.call(h, k)) out[k] = h[k];
      return out;
    }
    function unwrap(json) {
      if (!json) return null;
      var d = Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
      return d && d.draft ? d.draft : d;
    }

    return {
      name: 'remote',
      load: function () {
        return f(base + path, { method: 'GET', headers: headers() }).then(function (r) {
          if (r.status === 404) return null;              // no draft yet — not an error
          if (!r.ok) throw new Error('draft load failed: ' + r.status);
          return r.json().then(unwrap);
        });
      },
      save: function (d) {
        return f(base + path, {
          method: 'PATCH', headers: headers(), body: JSON.stringify(d)
        }).then(function (r) {
          if (r.status === 409) {
            /* Server holds a newer rev — another device moved. Surface it as a typed
               error carrying the remote draft so the controller can ask the user
               rather than silently overwriting their other device's work. */
            return r.json().then(function (j) {
              var err = new Error('draft conflict');
              err.code = 'conflict';
              err.remote = unwrap(j);
              throw err;
            });
          }
          if (!r.ok) throw new Error('draft save failed: ' + r.status);
          return r.json().then(unwrap);
        });
      },
      clear: function () {
        return f(base + path, { method: 'DELETE', headers: headers() }).then(function (r) {
          if (!r.ok && r.status !== 404) throw new Error('draft clear failed: ' + r.status);
        });
      }
    };
  }

  /* Local-first, write-through. Local always succeeds immediately so the UI is never
     blocked and an offline user still resumes on the same device; remote is best-effort
     and retried. This is the adapter real surfaces should use. */
  function tieredAdapter(local, remote) {
    return {
      name: 'tiered(' + local.name + '+' + (remote ? remote.name : 'none') + ')',
      local: local,
      remote: remote,
      load: function () {
        if (!remote) return local.load();
        /* Remote wins on load when it is strictly newer — that IS cross-device resume.
           A remote failure must never block resuming locally. */
        return Promise.all([
          local.load(),
          remote.load().catch(function () { return null; })
        ]).then(function (both) {
          var l = both[0], r = both[1];
          if (!r) return l;
          if (!l) return r;
          return (r.rev || 0) > (l.rev || 0) ? r : l;
        });
      },
      save: function (d) {
        return local.save(d).then(function () {
          if (!remote) return d;
          return remote.save(d).then(function (stored) {
            if (stored) local.save(stored);   // adopt server rev/updatedAt locally
            return stored || d;
          });
        });
      },
      clear: function () {
        return local.clear().then(function () { return remote ? remote.clear() : null; });
      }
    };
  }

  /* ── The autosave controller ──────────────────────────────────────────────── */

  function createStore(opts) {
    opts = opts || {};
    var adapter = opts.adapter || memoryAdapter();
    var K = opts.kernel || Kernel;
    if (!K) throw new Error('createStore requires the draft kernel');

    var cfg = {
      debounceMs: opts.debounceMs != null ? opts.debounceMs : DEFAULTS.debounceMs,
      minIntervalMs: opts.minIntervalMs != null ? opts.minIntervalMs : DEFAULTS.minIntervalMs,
      maxRetries: opts.maxRetries != null ? opts.maxRetries : DEFAULTS.maxRetries,
      retryBaseMs: opts.retryBaseMs != null ? opts.retryBaseMs : DEFAULTS.retryBaseMs
    };
    /* clientId may be a VALUE or a FUNCTION, and is resolved only when a draft is
       actually written — never on load, never on a read, never on a touch that turns
       out not to be worth saving.

       Why the contract allows a function: the identifier is per-device and therefore
       has to be minted and stored somewhere. Minting it when the store is constructed
       means every visitor who merely opens the page is given a persistent id, whether
       or not they ever start a request. Deferring it to the first real write means the
       id exists only for people who actually have a draft to carry between devices.
       Today it never leaves the browser, but this module is the reference the rebuild
       will copy and the remote tier is one config line away — at which point the id
       would travel with every sync. Passing a value still works unchanged. */
    var clientIdOpt = Object.prototype.hasOwnProperty.call(opts, 'clientId') ? opts.clientId : null;
    var clientIdResolved;          // stays undefined until the first persisted write
    function resolveClientId() {
      if (clientIdResolved === undefined) {
        clientIdResolved = (typeof clientIdOpt === 'function' ? clientIdOpt() : clientIdOpt) || null;
      }
      return clientIdResolved;
    }
    var origin = opts.origin || null;
    var onStatus = opts.onStatus || noop;        // 'idle'|'pending'|'saving'|'saved'|'offline'|'conflict'
    var onConflict = opts.onConflict || null;    // (localDraft, remoteDraft) -> void
    var setTimer = opts.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
    var clearTimer = opts.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);
    var clock = opts.now || nowMs;

    /* -Infinity, not 0: "never saved" must mean the min-interval floor does not apply,
       so the FIRST edit of a session saves after the debounce rather than waiting out a
       throttle window it never used. (A real clock hides this — Date.now() makes the
       gap enormous — so only a fake clock catches it.) */
    var timer = null, lastSaveAt = -Infinity, inFlight = null;
    var lastSerialized = null;    // dedupe: identical payload is never re-sent
    var pendingState = null;
    var baseRev = 0, rev = 0, retries = 0, destroyed = false;

    function status(s, extra) { try { onStatus(s, extra || null); } catch (e) {} }

    /* Built WITHOUT a clientId: this draft may still be discarded as unmeaningful,
       unchanged or invalid below, and none of those are writes. The id is stamped on
       only once the save is certain. */
    function build(state) {
      return K.toDraft(state, { rev: rev, clientId: null, origin: origin });
    }

    function writeNow() {
      if (destroyed || !pendingState) return Promise.resolve(null);
      var draft = build(pendingState);

      if (!K.isMeaningful(draft)) { status('idle'); return Promise.resolve(null); }

      var ser = JSON.stringify(draft.data);
      if (ser === lastSerialized) { status('saved'); return Promise.resolve(null); }

      /* Never ship a draft that fails the kernel's own safety checks — a sensitive
         field or embedded image here means a wiring bug upstream, and shipping it is
         worse than losing the autosave. */
      var v = K.validate(draft);
      if (!v.ok) { status('idle', { blocked: v.errors }); return Promise.resolve(null); }

      /* Past every gate — this IS a write, so now the device may be identified.
         `data` is already serialized above, and clientId lives on the envelope rather
         than inside it, so stamping here cannot affect the dedupe comparison. */
      draft.clientId = resolveClientId();

      status('saving');
      lastSaveAt = clock();
      inFlight = adapter.save(draft).then(function (stored) {
        lastSerialized = ser;
        if (stored && typeof stored.rev === 'number') { rev = stored.rev; baseRev = stored.rev; }
        retries = 0;
        inFlight = null;
        status('saved', { at: stored && stored.updatedAt ? stored.updatedAt : null });
        return stored;
      }).catch(function (err) {
        inFlight = null;
        if (err && err.code === 'conflict') {
          status('conflict');
          if (onConflict) { try { onConflict(draft, err.remote); } catch (e) {} }
          return null;
        }
        /* Offline or server trouble: the local tier already holds it, so this is a
           soft failure. Back off and try again rather than dropping the user's work. */
        status('offline');
        if (retries < cfg.maxRetries && setTimer) {
          var wait = cfg.retryBaseMs * Math.pow(2, retries++);
          setTimer(function () { if (!destroyed) writeNow(); }, wait);
        }
        return null;
      });
      return inFlight;
    }

    return {
      adapterName: adapter.name,

      /* Call on every state change. Cheap, debounced, and coalescing. */
      touch: function (state) {
        if (destroyed) return;
        pendingState = state;
        status('pending');
        if (timer && clearTimer) clearTimer(timer);
        var sinceLast = clock() - lastSaveAt;
        var wait = Math.max(cfg.debounceMs, cfg.minIntervalMs - sinceLast);
        if (setTimer) timer = setTimer(function () { timer = null; writeNow(); }, wait);
      },

      /* Bypass the debounce — step transitions, page hide, app pause/background. */
      flush: function (state) {
        if (destroyed) return Promise.resolve(null);
        if (state) pendingState = state;
        if (timer && clearTimer) { clearTimer(timer); timer = null; }
        return writeNow();
      },

      /* Read whatever is resumable. Returns the draft plus the kernel's summary so a
         caller can render the resume prompt without re-deriving anything. */
      load: function () {
        return adapter.load().then(function (d) {
          if (!d) return null;
          d = K.migrate(d);
          if (!K.isMeaningful(d)) return null;
          rev = typeof d.rev === 'number' ? d.rev : 0;
          baseRev = rev;
          lastSerialized = JSON.stringify(d.data);
          return { draft: d, summary: K.summarize(d) };
        });
      },

      /* Resume into a working state: apply, then re-derive everything that must not be
         trusted across devices. Returns { state, notes } — notes drive the honest UI
         ("your photos didn't transfer", "that date has passed"). */
      resumeInto: function (draft, baseState, now) {
        var applied = K.applyDraft(draft, baseState);
        return K.sanitizeOnResume(applied, now);
      },

      /* Ask the kernel who wins; never resolve a conflict silently. */
      reconcile: function (localDraft, remoteDraft) {
        return K.reconcile(localDraft, remoteDraft, baseRev);
      },

      /* Submitted or abandoned — drop it everywhere so it can't be offered again. */
      discard: function () {
        if (timer && clearTimer) { clearTimer(timer); timer = null; }
        pendingState = null; lastSerialized = null; rev = 0; baseRev = 0;
        return adapter.clear().then(function () { status('idle'); });
      },

      destroy: function () {
        destroyed = true;
        if (timer && clearTimer) { clearTimer(timer); timer = null; }
      },

      _debug: function () {
        return { rev: rev, baseRev: baseRev, retries: retries, pending: !!timer, inFlight: !!inFlight };
      }
    };
  }

  return {
    createStore: createStore,
    memoryAdapter: memoryAdapter,
    webLocalAdapter: webLocalAdapter,
    capacitorPreferencesAdapter: capacitorPreferencesAdapter,
    remoteAdapter: remoteAdapter,
    tieredAdapter: tieredAdapter,
    DEFAULTS: DEFAULTS
  };
});
