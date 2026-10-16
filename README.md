# RouteMind link pages (static site)

What a person WITHOUT the app sees when they tap a RouteMind link — the place / route card (`/p/<id>`, `/r/<id>`),
the stateless link (`/go?lat=…&lng=…&name=…`), a wrapped third-party link (`/open?u=…`) and the live-trip viewer
(`/l/<id>`) — plus the two files Android and iOS fetch to let the app open those links directly
(`/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`).

It replaces the HTML half of the retired Cloud Run backend (`api/links.py` + Jinja templates). The JSON half — mint,
resolve, live trips, the map thumbnail — is the Supabase Edge Function `api` (`supabase/functions/api/links/`).
Supabase serves `text/html` from `*.supabase.co` as `text/plain`, which is why the pages live here.

| File | What |
|---|---|
| `config.js` | **the one setting**: `apiBase` (= the app's backend base, `<SUPABASE_URL>/functions/v1`), store ids |
| `404.html`, `index.html`, `go.html`, `open.html` | the same shell; GitHub Pages serves `404.html` for `/p/…`, `/r/…`, `/l/…` |
| `assets/app.js` | reads the path, fetches the API, draws the page (text only through `textContent`) |
| `assets/grammar.js` | the pure part (the `/go` reader, every URL, the English / Egyptian Arabic words) — checked against the Python reference by `supabase/functions/api/tests/links_web.test.ts` |
| `assets/app.css` | the templates' look; every colour a custom property; dark / light by the system |
| `.well-known/assetlinks.json` | App Links: `com.routemind.app` + SHA-256 of the signing keys |
| `.well-known/apple-app-site-association`, `apple-app-site-association` | Universal Links: `R3D75N7XCX.com.routemind.app` |
| `.nojekyll` | without it GitHub's Jekyll drops the `.well-known` folder |

## Where it must be published

App Links and Universal Links read `/.well-known/…` at the **root of the host**, and the app's paths start at the
root (`/p/…`). So the site must be the root of its host:

* a **user site**: a public repository named exactly `<user>.github.io` → `https://<user>.github.io/`, or
* any public repository with a **custom domain** (e.g. `go.example.com`) → `https://go.example.com/`.

A project site (`https://<user>.github.io/<repo>/`) does **not** work.

## Steps

1. **Pick the host** — e.g. `ibrahim212-wq.github.io` (the account that already publishes `routemind-places`).
2. **Create the repository** `ibrahim212-wq.github.io` (public, empty) on GitHub, then publish this folder at its root:

   ```bash
   git clone https://github.com/ibrahim212-wq/ibrahim212-wq.github.io G:/grad_all/.p5work/pages
   cp -r G:/grad_all/maps-mobile-application/cairoWay/web/links/. G:/grad_all/.p5work/pages/
   git -C G:/grad_all/.p5work/pages add -A
   git -C G:/grad_all/.p5work/pages commit -m "RouteMind link pages"
   git -C G:/grad_all/.p5work/pages push
   ```

3. **Turn Pages on**: repository → Settings → Pages → Source *Deploy from a branch* → `main` / `(root)`.
   (Custom domain instead: enter it there, add the DNS record GitHub shows, tick *Enforce HTTPS*. Do not rely on a
   `www.` → apex redirect for App Links: Android's verifier does not follow redirects.)
4. **Signing keys** in `.well-known/assetlinks.json` — it carries the release (upload) key of
   `android/routemind-release.keystore` and this desk's debug key. **Add** the Play App Signing key
   (Play Console → Test and release → App integrity → *App signing key certificate* → SHA-256) and, for builds
   installed through Internal App Sharing, the *Internal app sharing certificate* from the same page; **remove** the
   debug key before a public release. Upper-case, colon-separated.
5. **Tell the Edge Function the host** (the URL it puts in minted links):
   `supabase secrets set LINK_BASE_URL=https://ibrahim212-wq.github.io`
   (and `MAPBOX_TOKEN=<public pk. token with Static Images>` for map thumbnails; without it a plain image is served).
6. **Tell the app the host** — `DEEP_LINK_HOST=ibrahim212-wq.github.io` in `cairoWay/.env` and in Codemagic's
   `routemind_secrets` (Dart host + the Android `${deepLinkHost}` placeholder + the iOS entitlements step), and in the
   native files: drop `www.${deepLinkHost}` from the autoVerify filter (no such host on github.io — on Android 7–11 one
   failing host sinks the whole filter) and the dead Cloud Run filter / `deepLinkApiHost` placeholder
   (`AndroidManifest.xml`, `android/app/build.gradle`); in both `ios/Runner/*.entitlements` keep
   `applinks:<host>` only (the `www.` and Cloud Run entries go, and the Codemagic step stops writing `www.`).
7. **Prove it**:

   ```bash
   curl -sI https://ibrahim212-wq.github.io/.well-known/assetlinks.json
   curl -s  https://ibrahim212-wq.github.io/.well-known/apple-app-site-association
   curl -s  "https://mldsninoxerbmecojztr.supabase.co/functions/v1/api/links/AbCd1234"
   ```

   The first must be `200` with `content-type: application/json` and no redirect. Then open
   `https://ibrahim212-wq.github.io/go?lat=30.0444&lng=31.2357&name=Tahrir` in a phone browser. Google's tester:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ibrahim212-wq.github.io&relation=delegate_permission/common.handle_all_urls`.
   Apple's CDN copy: `curl -si https://app-site-association.cdn-apple.com/a/v1/ibrahim212-wq.github.io`.

If the backend base ever moves, change `apiBase` in `config.js` (the app follows `public.app_config`; the pages
follow this file).

## What a static host cannot do (known differences from the Cloud Run pages)

* `/p/…`, `/r/…`, `/l/…` are served through `404.html`, so their HTTP status is **404** (the page itself works).
* The pages are drawn by JavaScript: link-preview crawlers (WhatsApp, Telegram, iMessage) see only the generic
  "RouteMind" card, not the place name and map. The share text the app sends still carries the name and the
  coordinates.
* No response headers: the Content-Security-Policy is a `<meta>` tag, `X-Frame-Options` is replaced by refusing to
  draw inside a frame. GitHub serves the extension-less `apple-app-site-association` as
  `application/octet-stream`; Apple's CDN accepts it — check the CDN URL above after publishing.
