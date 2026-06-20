# Running this fork standalone

This is a standalone fork of FrankerFaceZ, decoupled from the official
FrankerFaceZ servers (the upstream project is largely abandoned). It is built
to run entirely on your own infrastructure.

- **Client** (this repo): the userscript/extension bundle. Hosted on `cdn.*`.
- **Website + data API** (separate, **private** repo): everything the client
  fetches data from. Hosted on `api.*`.
- **Hosting**: DigitalOcean App Platform.
- **Topology**: split subdomains — `cdn.example.com` (this repo) and
  `api.example.com` (the private repo).

> The official FFZ API is closed-source, so the API must be reimplemented in
> the private repo. The client already documents the exact JSON shapes it
> expects (see "The API serving contract" below).

---

## 1. Build-time host configuration

Every FFZ-operated host is configurable at build time. These are read by
`webpack.config.js` and baked into the bundle — changing them requires a
**rebuild**, they are not runtime settings. They default to the upstream FFZ
hosts when unset, so the client keeps working during development.

| Env var            | Default                          | What it configures |
|--------------------|----------------------------------|--------------------|
| `FFZ_CDN`          | `https://cdn2.frankerfacez.com`  | Static/code CDN: the loader, webpack chunks, fonts, CSS, and fetched JSON (`experiments.json`, locale, emoji). Drives webpack `publicPath`, the `SERVER` constant, and the loader (`src/entry.js`). |
| `FFZ_API`          | `https://api.frankerfacez.com`   | Data API: emote sets, badges, rooms, auth. Drives `API_SERVER`. |
| `FFZ_STAGING_API`  | = `FFZ_API`                      | Staging API (Debugging > Data Sources >> Staging). |
| `FFZ_STAGING_CDN`  | = `FFZ_CDN`                      | Staging CDN. |
| `FFZ_DEV_PROXY`    | = `FFZ_CDN`                      | `bun start` dev-server fallback proxy target. |

See `.env.example`. How each is wired:

- **`publicPath`** ← `${FFZ_CDN}/static/` (`webpack.config.js`).
- **`SERVER` / `API_SERVER` / `STAGING_*`** ← injected as esbuild defines
  (`__ffz_server__`, `__ffz_api__`, `__ffz_staging_api__`,
  `__ffz_staging_cdn__`) and read in `src/utilities/constants.ts`.
- **The loader** (`src/entry.js`) is copied verbatim (it runs before the
  bundle), so `FFZ_CDN` is injected into it via a CopyPlugin `transform` that
  replaces the `__FFZ_CDN__` placeholder.

```bash
# Local production build pointed at your own infra:
FFZ_CDN=https://cdn.example.com FFZ_API=https://api.example.com bun run build
```

---

## 2. The CDN serving contract (`cdn.*`, this repo)

`bun run build` emits `dist/` **already laid out for a plain static host** —
the loader + entry bundles + `experiments.json` under `dist/script/`, and the
hashed chunks/CSS/fonts under `dist/static/`. **Serve `dist/` at the root of
your `cdn.*` domain** and every request below resolves directly — no rewrites,
no manifest layer:

| Request                              | Served from                          |
|--------------------------------------|--------------------------------------|
| `GET /script/script.min.js`          | `dist/script/script.min.js` (the loader; the userscript install points here) |
| `GET /script/{flavor}.js`            | `dist/script/{flavor}.js` (`avalon` / `player` / `clips` / `bridge`) |
| `GET /script/experiments.json`       | `dist/script/experiments.json` (feature flags; 404 degrades gracefully) |
| `GET /static/{name}.{hash}.js`       | `dist/static/…` — code-split chunks (publicPath = CDN root) |
| `GET /static/{name}.{hash}.css`      | `dist/static/…` — extracted CSS |
| `GET /static/*.woff2` / `.woff` / `.ttf` | `dist/static/…` — fonts |

Entry bundles use **stable** names (the loader cache-busts them with
`?_=<timestamp>`); chunks/assets keep content hashes for long-term caching. So a
**DigitalOcean App Platform static site** with `output_dir: dist` serves the
whole client as-is. (This `/script` + `/static` layout is applied only to the
production userscript build — the dev server and the extension build are
unchanged. See `CDN_LAYOUT` in `webpack.config.js`.)

### Static assets the client may fetch from the CDN (Phase 2)

If you keep these features, also serve (otherwise they 404 / degrade): emoji
(`/static/emoji/...` + `v3.2.json`), locales (`/static/locale/...`),
fix-bad-emotes replacements (`/static/replacements/...`), and the default
Twitch badge mirror (`/static/badges/twitch/...`).

---

## 3. The API serving contract (`api.*`, private repo)

Reimplement these in the private repo to match the JSON the client parses.
The four critical (anonymous) endpoints:

| Endpoint | Drives | Parser to match |
|----------|--------|-----------------|
| `GET /v1/set/global/ids` | global emotes | `src/modules/chat/emotes.js` (`processEmote` / `loadSetData`) |
| `GET /v1/set/{id}` and `/v1/set/{id}/ids` | a specific emote set | same |
| `GET /v1/badges/ids` | global badges | `src/modules/chat/badges.jsx` (`loadGlobalBadges` / `loadBadgeData`) |
| `GET /v1/room/id/{twitchId}` and `/v1/room/{login}` | per-channel emotes/badges/css | `src/modules/chat/room.js` (`load_data`) |

Emote/badge/avatar image URLs are emitted *by these API responses*, so point
them at your own object storage. Authenticated features (`/v2/...`, `/auth/...`)
are a later phase — see "Remaining work" below.

---

## 4. CORS (required on BOTH subdomains)

The client always runs on **twitch.tv** (and `m.`, `clips.`, `dashboard.`,
`www.`), so every request to your `cdn.*` and `api.*` is cross-origin:

- The bundle loads scripts with `crossorigin="anonymous"` and chunks via
  webpack `crossOriginLoading: 'anonymous'` → **scripts will not execute
  without** an `Access-Control-Allow-Origin` response header.
- Fonts (`@font-face`) and `fetch()`/`EventSource` (JSON, set data, auth SSE)
  are likewise blocked without CORS.

So serve **all** assets on both subdomains with
`Access-Control-Allow-Origin` allowing the Twitch origins (these are public,
credential-less assets, so `*` is acceptable). See the `ingress.cors` block in
`.do/app.yaml`.

> Alternative: removing `crossorigin="anonymous"` (entry.js + webpack
> `crossOriginLoading`) drops the CORS requirement for *scripts* but loses SRI
> and detailed cross-origin error reporting. Sending CORS headers (matching
> upstream FFZ) is the recommended path.

---

## 5. Deployment (DigitalOcean App Platform)

- This repo deploys as a **static site** component — see `.do/app.yaml`.
  Set `FFZ_CDN` / `FFZ_API` as `BUILD_TIME` env vars and attach your `cdn.*`
  domain. `deploy_on_push` rebuilds on every push to the branch.
- The private website/API repo is a **separate app** (service component) on
  `api.*`, with its own spec and CORS config.
- CI (`.github/workflows/build.yml`) no longer SSH-deploys to the FFZ host; it
  only validates the build and uploads an artifact. App Platform builds &
  deploys from the repo directly.

---

## 6. Remaining work to repoint (later phases)

A handful of URLs bypass the env vars and are addressed in later phases
(emote/badge/avatar images, emoji sprites, locales, auth). The precise,
file-and-line list lives in the project's standalone dependency analysis. In
short: **Phase 2** = the data API + content images + emoji/locales; **Phase 3**
= authentication (`/auth/ext_verify` SSE + token usage) and `/v2` account
features. Each will be repointed to your own infra as it's built.
