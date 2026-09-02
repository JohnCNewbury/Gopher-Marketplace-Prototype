# Gopher Marketplace — Prototype twin

**https://johncnewbury.github.io/Gopher-Marketplace-Prototype/**

This is **not the live site.** It is a second GitHub Pages site serving the same
pages as production, with one difference that is the whole point of it existing:
**PT mode is enabled here**, so the web↔Go testing harness works.

## The harness — "the TRUTH"

    _prototypes/web-split-screen.html

Three panes side by side, driving the real code:

- **left** — the customer web app (`gopher-request.html` / `gopher-connect.html`),
  switchable between the **Web** and **App** chassis
- **right** — the **Go** worker prototype

A request created on the left is bridged into the worker prototype on the right,
and what comes back is bridged home. It is the same seam the production apps use;
nothing here is mocked.

## Why a separate site

PT mode is fail-closed to development hosts. Production —
`johncnewbury.github.io/Gopher-Marketplace/` — shares this exact **hostname**, and
opening `?pt=1` there empties the visible dashboard. So the allowlist entry that
enables PT is **host + path prefix**, and the slash after `Marketplace` is the only
thing separating this site from the live one. See `devHost()` in
`assets/js/gopher-web-pt-bridge.js`, and the 23-case guard that holds it.

## Things worth knowing

- **Every page here is `noindex,nofollow`** and `sitemap.xml` is withheld. A public
  copy of a live indexed site on the same hostname would otherwise compete with the
  original in search for every page it duplicates.
- **This site is rebuilt from scratch on each deploy.** Do not edit it directly —
  edits belong in the source repo and arrive via `scripts/deploy.sh --site prototype`.
- **It can be behind production.** It is deployed separately and deliberately.
