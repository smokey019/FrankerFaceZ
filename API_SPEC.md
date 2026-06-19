# FrankerFaceZ Data API — Implementation Specification

## 1. Introduction

This document specifies the HTTP API that serves emote, badge, and room data to the FrankerFaceZ (FFZ) client. It is a clean-room reimplementation of the closed-source `api.frankerfacez.com`, intended to be built in a separate private repository against the fork's own object storage / image CDN.

### How the client reaches this API

- The client's base host is the **`FFZ_API`** build-time environment variable (webpack injects it as `__ffz_api__`; see `src/utilities/constants.ts:26`). Default upstream value is `https://api.frankerfacez.com`.
- Content **images** (emote/badge image files) are served from a separate **`FFZ_IMAGE_CDN`** host (injected as `__ffz_image_cdn__` → `IMAGE_CDN`; default `https://cdn.frankerfacez.com`). The data API emits image URLs, and the client constructs some itself (see §7); both should resolve to your image CDN / object storage.
- At runtime the chat modules call `this.staging.api` (`src/staging.tsx`), which resolves to `FFZ_API` normally, or to `STAGING_API` when the user enables the `data.use-staging` setting. **Build your API to answer at whatever host `FFZ_API` points to.**
- Only ONE endpoint remains **hardcoded** to `api.frankerfacez.com` regardless of `FFZ_API`: the SSE auth endpoint (`/auth/ext_verify/{id}`) — Phase 3 (`src/socket.js:205`). The per-user lookup (`/v1/_user/id/{id}`) and the client-constructed badge image URLs are now driven by `FFZ_API` / `FFZ_IMAGE_CDN` respectively in this fork.

### Conventions

- **All endpoints are anonymous (no auth)** unless explicitly marked. Phase 3 (`/v2/*`, `/payment/*`, auth) uses `Authorization: Bearer {token}`.
- **CORS is required.** The client runs on Twitch origins (`https://www.twitch.tv`, `https://m.twitch.tv`, dashboard/clips subdomains, plus the local dev origin `https://localhost:8000`). Responses must include appropriate `Access-Control-Allow-Origin` for these origins and allow simple `GET` requests; Phase 3 endpoints additionally need `Authorization` allowed and the relevant methods (`POST`, `PUT`, `DELETE`).
- **Response format:** All v1 endpoints return JSON. The client requires HTTP `2xx` (`response.ok`) and a body that parses as JSON; otherwise the load aborts.
- **Retry behavior:** The client retries **only on network/fetch errors** (not on non-2xx), up to **10 times** with `500ms * attempt` backoff. A non-2xx status aborts cleanly without retry. Avoid transient 5xx where possible.
- **Ignore `api2.frankerfacez.com`:** Under the `api_load` experiment the client fires duplicate "warm-up" requests to `NEW_API` (`https://api2.frankerfacez.com`) for global sets, global badges, and rooms. **Their responses are discarded and never parsed** — you do not need to implement them.
- **Request shape:** All v1 GETs carry no query params, no custom headers, no `Authorization`, and no cache-buster.

### Endpoint overview

| Phase | Method | Path | Auth | Host |
|---|---|---|---|---|
| 1 | GET | `/v1/set/global/ids` | none | `FFZ_API` |
| 1 | GET | `/v1/set/{id}` | none | `FFZ_API` |
| 1 | GET | `/v1/set/{id}/ids` | none | `FFZ_API` (staging only) |
| 1 | GET | `/v1/badges/ids` | none | `FFZ_API` |
| 1 | GET | `/v1/room/id/{twitchId}` | none | `FFZ_API` |
| 1 | GET | `/v1/room/{login}` | none | `FFZ_API` |
| 2 | GET | `/v1/_user/id/{id}` | none | `FFZ_API` |
| 3 | GET (SSE) | `/auth/ext_verify/{userId}` | n/a | **hardcoded** `api.frankerfacez.com` |
| 3 | GET | `/payment/plans` | none | `FFZ_API` |
| 3 | GET | `/v2/subscription/status` | Bearer | `FFZ_API` |
| 3 | POST | `/v2/emote/{id}/report` | Bearer | `FFZ_API` |
| 3 | GET | `/v2/emote/{id}/collections/editable` | Bearer | `FFZ_API` |
| 3 | PUT/DELETE | `/v2/collection/{cid}/emote/{eid}` | Bearer | `FFZ_API` |

---

## 2. Shared type: the Emote Set object

The same **SetObject** shape is consumed by the global-set endpoint, the single-set endpoint, and the room endpoint (under `sets`). It is processed by `loadSetData()` (`src/modules/chat/emotes.js:2432`). Defined once here and referenced below.

A SetObject is:

```json
{
  "id": 51975,
  "title": "Channel: dansgaming",
  "source": null,
  "source_line": null,
  "icon": null,
  "css": null,
  "emoticons": [ /* array of EmoteObject — see below */ ]
}
```

### SetObject fields

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `id` | number \| string | no | Set's own id. **Ignored** — `loadSetData` overwrites it with the map key. Use the map key as the authoritative id. | `emotes.js:2453` |
| `emoticons` *(or* `emotes`*)* | EmoteObject[] | **yes** | The set's emotes. Client reads `data.emotes \|\| data.emoticons` (prefers `emotes`; official API uses `emoticons`). Must be an array (may be empty) or the `for…of` throws. After load the client renames it to a keyed map. | `emotes.js:2448, 2458` |
| `title` | string | no (recommended) | Human-readable name. Used in log lines, update notices, tooltips, and emote-menu headers. UI falls back to `Global`/`Set #{id}`. **Caveat:** `emote_menu.jsx:2500` calls `title.toLowerCase()` when no `sort`/`sort_key` is present — a `null` title can throw there, so always supply a `title`. | `emotes.js:2491`; `tokenizers.jsx:1580`; `emote_menu.jsx:2496,2500` |
| `source` | string | no | Provider/source label. For first-party FFZ sets leave **absent/null** — that enables FFZ favorites (`ffz` key) and `frankerfacez.com` links. If truthy, those links are disabled and it becomes the attribution. | `emotes.js:1523,1556`; `emote_menu.jsx:2479,2490`; `emote_card/index.jsx:408,416` |
| `source_line` | string | no | Pre-formatted source line; overrides the `${source} ${title}` construction in cards/tooltips. | `tokenizers.jsx:1580`; `emote_card/index.jsx:416` |
| `icon` | string (URL) \| null | no | Section image in the emote menu. Full URL string used as-is; UI falls back to a font icon. | `emote_menu.jsx:2517,2529` |
| `css` | string \| null | no | Raw CSS appended after all per-emote CSS for the set. | `emotes.js:2485-2488` |

> Optional menu/addon extension fields (`merge_id`, `merge_source`, `title_is_channel`, `force_global`, `sort`, `sort_key`) are addon/client concerns. First-party responses should omit them; the UI has fallbacks.

### EmoteObject fields

Each emote runs through `processEmote()` (`emotes.js:2187`). It **requires `id`, `name`, and `urls`**; if any is falsy the emote is silently dropped and logged as "Bad Emote Data" (no crash).

```json
{
  "id": 28136,
  "name": "ZreknarF",
  "height": 30,
  "width": 40,
  "public": true,
  "hidden": false,
  "modifier": false,
  "modifier_flags": 0,
  "modifier_prefix": null,
  "original_name": null,
  "margins": null,
  "css": null,
  "owner": { "_id": 1, "name": "sirstendec", "display_name": "SirStendec" },
  "artist": null,
  "click_url": null,
  "urls": {
    "1": "https://cdn.frankerfacez.com/emote/28136/1",
    "2": "https://cdn.frankerfacez.com/emote/28136/2",
    "4": "https://cdn.frankerfacez.com/emote/28136/4"
  },
  "animated": {
    "1": "https://cdn.frankerfacez.com/emote/28136/animated/1",
    "2": "https://cdn.frankerfacez.com/emote/28136/animated/2",
    "4": "https://cdn.frankerfacez.com/emote/28136/animated/4"
  }
}
```

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `id` | number \| string | **yes** | Emote id. Drop if falsy. Used as the emote map key, in `data-id`, favorites, CSS selectors, default click URL, modifier lookup. | `emotes.js:2188,2191` |
| `name` | string | **yes** | Emote code/word. Drop if falsy. Drives tokenizing, tooltip text, menu name. | `emotes.js:2188,2252-2253`; `tokenizers.jsx:1517` |
| `urls` | object `{ "1": string, "2"?: string, "4"?: string }` | **yes** | Static image URLs by scale. `urls[1]` is mandatory (becomes `src`/srcset base); `urls[2]`/`urls[4]` optional (enable 2x/4x and `can_big`). **Full URL strings used verbatim** — the client does not build these. | `emotes.js:2188,2192-2205` |
| `animated` | object `{ "1": string, "2"?: string, "4"?: string }` | no | Animated (GIF/WebP) URLs by scale. If `animated[1]` present, emote is treated as animated (hover src/srcset; tooltip prefers `animated[4]`/`[2]`). | `emotes.js:2207-2219`; `emote_menu.jsx:2569-2570` |
| `width` | number | no | Display width (px). UI falls back to 28. | `emotes.js:2255` |
| `height` | number | no | Display height (px). | `emotes.js:2254` |
| `hidden` | boolean | no | If true, display text becomes `???` and emote is excluded from the menu. | `emotes.js:2252`; `emote_menu.jsx:2561` |
| `public` | boolean | no | If true, emote card shows a "manage-ffz" body (for FFZ/non-source sets). | `emote_card/index.jsx:432` |
| `modifier` | boolean | no | Marks a modifier/effect emote. Drives `token.mod`, effect CSS, menu effect flags. | `emotes.js:2249,2261` |
| `modifier_flags` | number (bitfield) | no | Effect flags (Hidden=1, FlipX=2, FlipY=4, …). Bit 1 sets `mod_hidden`. Defaults to 0 (`?? 0`). | `emotes.js:2251,2256` |
| `modifier_prefix` | string \| boolean | no | Prefix when applied by name (`token.mod_prefix`; menu `effect_prefix`). | `emotes.js:2250` |
| `mask` | object `{ "1": string, … }` | no | Mask image URLs by scale; `mask[1]` used as `-webkit-mask-image`. Sets `token.masked`. | `emotes.js:2248,2556-2560` |
| `margins` | string (CSS shorthand) \| null | no | Custom margins (or modifier-offset fallback) in generated CSS. | `emotes.js:2533,2538,2564` |
| `css` | string \| null | no | Per-emote raw CSS injected into its selector. | `emotes.js:2533,2565` |
| `modifier_offset` | string (CSS shorthand) | no | Padding offset for modifier emotes. | `emotes.js:2537-2538` |
| `extra_width` | number | no | Extra width for `shrink_to_fit` modifier sizing. | `emotes.js:2537,2551` |
| `shrink_to_fit` | boolean | no | Constrains modifier max-width in generated CSS. | `emotes.js:2537,2551` |
| `owner` | object `{ name, display_name, _id? }` \| null | no | Uploader. Tooltip shows `display_name`; card uses `display_name\|\|name` and links to `frankerfacez.com/{name}` (only when `set.source` is empty). Provide `name` (lowercase login) and `display_name`. | `tokenizers.jsx:1596-1599`; `emote_card/index.jsx:417-422` |
| `artist` | object `{ name, display_name }` \| null | no | Artist. Same display/link behavior as `owner`. | `tokenizers.jsx:1587-1588`; `emote_card/index.jsx:423-428` |
| `original_name` | string \| null | no | Un-aliased name; if present and ≠ `name`, shown as "Name: {original_name}". | `tokenizers.jsx:1590-1594`; `emote_card/index.jsx:415` |
| `click_url` | string (URL) \| null | no | Overrides the default `frankerfacez.com/emoticons/{id}` shift-click target. | `emotes.js:1520-1521`; `emote_card/index.jsx:449` |

---

## 3. GET `/v1/set/global/ids` — Global emote sets

Returns the global FFZ emote sets, full emote data, which sets are default (auto-applied to everyone) vs. sub-sets, and per-set extra user associations. Called on enable and on `chat:reload-data`.

`loadGlobalSets()` (`emotes.js:2048`) **always** requests `/v1/set/global/ids` — the `/ids` suffix is hardcoded for global, so this response must include **`user_ids`** (numeric IDs).

- **Method / path:** `GET /v1/set/global/ids`
- **Params:** none

### Response example

```json
{
  "default_sets": [3, 1532818],
  "sets": {
    "3": {
      "id": 3,
      "title": "Global Emotes",
      "css": null,
      "emoticons": [
        {
          "id": 28136,
          "name": "ZreknarF",
          "height": 30,
          "width": 40,
          "public": true,
          "owner": { "name": "sirstendec", "display_name": "SirStendec" },
          "urls": {
            "1": "https://cdn.frankerfacez.com/emote/28136/1",
            "2": "https://cdn.frankerfacez.com/emote/28136/2",
            "4": "https://cdn.frankerfacez.com/emote/28136/4"
          }
        }
      ]
    },
    "1532818": { "id": 1532818, "title": "Bot Emotes", "emoticons": [] }
  },
  "user_ids": {
    "1532818": [12345678, 98765432]
  }
}
```

### Fields

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `default_sets` | number[] | **yes** | Set IDs applied to all users (provider `ffz-global`). Iterated with **no null guard** (`for (const set_id of data.default_sets)`) — must be present and iterable; use `[]` if none, or `loadGlobalSets` throws. Also used in `default_sets.includes(id)` to decide whether a set in `sets` becomes a sub-set. | `emotes.js:2088,2095` |
| `sets` | object `{ [setId: string]: SetObject }` | yes | Map of set id → SetObject. Defaulted to `{}` if absent. Each value loaded via `loadSetData`. The **map key is the authoritative set id**. Sets whose `.id` is present and not in `default_sets` are registered as `ffz-global` sub-sets. | `emotes.js:2083,2091-2097` |
| `sets.{id}` | SetObject | — | See §2 (Shared Emote Set object). | `emotes.js:2432` |
| `sets.{id}.id` | number | no | Checked at `sets[set_id]?.id` for sub-set registration; otherwise overwritten by the map key. | `emotes.js:2093` |
| `user_ids` | object `{ [setId: string]: number[] }` | no | Maps set id → Twitch user IDs who should get that set (bulk `ffz-global`). Checked first; entries coerced to `String`. | `emotes.js:2099-2100,2158-2168` |
| `users` | object `{ [setId: string]: string[] }` | no | Alternative to `user_ids`: set id → Twitch **login** strings. Checked only if `user_ids` is absent. (Global endpoint normally returns `user_ids`.) | `emotes.js:2101-2102,2171-2184` |

> **Critical minimal contract:** `{ "default_sets": [...], "sets": {...} }`. `default_sets` MUST exist and be iterable. `sets` defaults to `{}`. Each SetObject's emote array must exist (`emotes`/`emoticons`) and be iterable. `user_ids`/`users` optional.

---

## 4. GET `/v1/set/{id}` — Single emote set

Returns one emote set plus its user associations. `loadSet(set_id)` (`emotes.js:2109`) requests `/v1/set/{id}` in production and `/v1/set/{id}/ids` only when staging is active.

- **Method / path:** `GET /v1/set/{id}`
- **Path params:** `id` — the numeric emote-set id.
- **Query params:** none

Because production omits `/ids`, this endpoint should return **`users`** (logins). The `/ids` variant (`GET /v1/set/{id}/ids`, staging only) is identical except it returns **`user_ids`** (numeric IDs) instead. The client's `user_ids`-then-`users` fallback accepts either.

### Response example

```json
{
  "set": {
    "id": 51975,
    "title": "Channel: dansgaming",
    "emoticons": [
      {
        "id": 425196,
        "name": "dansHi",
        "urls": { "1": "https://cdn.frankerfacez.com/emote/425196/1" }
      }
    ]
  },
  "users": {
    "51975": ["dansgaming"]
  }
}
```

### Fields

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `set` | SetObject | **yes** | The full set object, loaded via `loadSetData(set.id, set)`. If absent, the set is silently not loaded (no crash). See §2. | `emotes.js:2144-2146` |
| `set.id` | number | **yes** | Used as the `loadSetData` key for this endpoint. If missing, the set is keyed under `undefined`. | `emotes.js:2146` |
| `user_ids` | object `{ [setId: string]: number[] }` | no | Returned by the `/ids` variant (staging). Checked first. | `emotes.js:2148-2149` |
| `users` | object `{ [setId: string]: string[] }` | no | Returned by the production (non-`/ids`) variant. Set id → login strings; each user gets the set under `ffz-global`. | `emotes.js:2150-2151` |

> Note: unlike the global endpoint, this endpoint's `set.id` **is** used as the load key (the global endpoint uses its map key). Always include `set.id`.

---

## 5. GET `/v1/badges/ids` — Global badges

Returns all global FFZ badge definitions and the mapping of which user IDs have each badge. Parsed by `loadGlobalBadges()` (`badges.jsx:1220-1294`). Both top-level keys are optional but normally present.

- **Method / path:** `GET /v1/badges/ids`
- **Params:** none

### Response example

```json
{
  "badges": [
    {
      "id": 2,
      "name": "bot",
      "title": "Bot",
      "slot": 1,
      "color": "#595959",
      "image": "https://cdn.frankerfacez.com/badge/2/4",
      "urls": {
        "1": "https://cdn.frankerfacez.com/badge/2/1",
        "2": "https://cdn.frankerfacez.com/badge/2/2",
        "4": "https://cdn.frankerfacez.com/badge/2/4"
      },
      "replaces": "moderator",
      "css": null
    },
    {
      "id": 1,
      "name": "supporter",
      "title": "FFZ Supporter",
      "slot": 22,
      "color": "#755000",
      "urls": {
        "1": "https://cdn.frankerfacez.com/badge/1/1",
        "2": "https://cdn.frankerfacez.com/badge/1/2",
        "4": "https://cdn.frankerfacez.com/badge/1/4"
      }
    }
  ],
  "users": {
    "2": ["12345", "67890"],
    "1": ["11111", "22222", "33333"]
  }
}
```

### Fields

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `badges` | badge object[] | no | Global badge definitions. Iterated only if truthy; absent/empty registers nothing (not fatal). | `badges.jsx:1257-1262` |
| `badges[].id` | string \| number (truthy) | **yes** | Unique badge id. Badges without a truthy `id` are skipped. Used as the key in `this.badges`, as the `users`-map key, and to build the rounded CDN URL `//cdn.frankerfacez.com/badge/{id}/{size}/rounded`. | `badges.jsx:1259-1260,1267,1012` |
| `badges[].name` | string | no | Internal short name; **behaviorally load-bearing.** `supporter`/`subwoofer`/`bot` → users assigned **in bulk** (SourcedSet) instead of per-user. `developer`/`subwoofer`/`supporter` → client sets `click_url` to the FFZ subscribe page. `subwoofer` → enables the months tooltip + `base_id`. `bot` → special-cased vs. the Twitch-style bot badge. | `badges.jsx:1268,1271,1325,1328` |
| `badges[].title` | string | no | Label in tooltip and settings UI. Falls back gracefully if absent. | `badges.jsx:1007,646,436` |
| `badges[].slot` | number | no (effectively yes for display) | Ordering slot in the chat badge row (lower = earlier). **A badge with null/absent `slot` is skipped during caching and never renders standalone** (unless it `replaces` another). | `badges.jsx:992,1034` |
| `badges[].color` | string (CSS color) | no | Badge background/mask color. Defaults to `transparent`. **For non-addon FFZ badges this is forced to null at render** (rounded CDN image used instead); mainly affects addon badges + settings preview. | `badges.jsx:995,1006,1014` |
| `badges[].image` | string (URL) | no | Single fallback image URL, used when `urls` is absent (`{1: image}`) and in the settings UI. **Overridden by the rounded CDN URL for non-addon FFZ badges in chat.** | `badges.jsx:999,420,1005` |
| `badges[].urls` | object `{ "1": string, "2"?: string, "4"?: string }` | no | DPI-keyed image URLs. Used for addon badges in chat + tooltip preview, and for the settings UI for all badges. **Ignored in chat for non-addon FFZ badges** (rounded CDN used). | `badges.jsx:999,1005,1065-1074,420-426` |
| `badges[].replaces` | string \| boolean | no | If a string, the Twitch badge set id this replaces; client normalizes a string into `replaces=true` + `replaces_type=<string>`. | `badges.jsx:1320-1323,1024` |
| `badges[].replaces_type` | string | no | Explicit Twitch set id replaced (e.g. `moderator`). Auto-derived from `replaces` if absent. | `badges.jsx:1025,1321` |
| `badges[].css` | string \| null | no | Extra raw CSS appended to the generated badge rule. | `badges.jsx:200` |
| `badges[].addon` | boolean \| string | no | Marks an addon badge. **Omit/false for global API badges** — client defaults via `/^addon/.test(id)`. When false, chat uses the rounded CDN URL and forces color null. | `badges.jsx:1317-1318,1011` |
| `badges[].click_url` | string (URL) | no | Makes the badge a link in legacy clickable mode. Auto-set by the client for developer/subwoofer/supporter; usually unneeded. | `badges.jsx:833,1326` |
| `badges[].base_id` | string \| number | no | Groups badge versions in the settings visibility UI. Auto-set for subwoofer. | `badges.jsx:444,986,1329` |
| `badges[].content` | string | no | Optional inner content rendered inside the badge span. Rarely used; safe to omit. | `badges.jsx:1028,1051,1104` |
| `users` | object `{ [badgeId: string]: (string\|number)[] }` | no | Per badge id, the user IDs that have it. Iterated only if truthy. Keys must match `badges[].id`. For `supporter`/`subwoofer`/`bot` badges, stored in bulk as `String(x)`; otherwise each entry → `getUser(id).addBadge('ffz-global', badge_id)`. Provide user IDs as strings to be safe. | `badges.jsx:1264-1289` |

> `click_handler` is not JSON-serializable — never returned by the API. Both `badges` and `users` may be omitted entirely.

---

## 6. GET `/v1/room/id/{twitchId}` and `/v1/room/{login}` — Room data

Returns per-channel FFZ data: the channel emote set, channel custom badges, per-room CSS, and custom mod/VIP badge images. Parsed by `load_data()` (`room.js:307-399`). The client prefers the numeric form `/v1/room/id/{twitchId}` when it knows the Twitch ID, else `/v1/room/{login}`. Both return the same body.

- **Method / paths:** `GET /v1/room/id/{twitchId}` *(preferred)*, `GET /v1/room/{login}`
- **Path params:** `twitchId` — channel's numeric Twitch user id (string); or `login` — channel login name.
- **Query params:** none

The response has exactly two top-level keys the client reads: `room` (**required**) and `sets` (optional).

### Response example

```json
{
  "room": {
    "twitch_id": 44322889,
    "id": "dansgaming",
    "set": 51975,
    "css": null,
    "user_badge_ids": {
      "2": ["someuserlogin", "anotherlogin"]
    },
    "mod_urls": {
      "1": "//cdn.frankerfacez.com/room/mod-badge/44322889/1",
      "2": "//cdn.frankerfacez.com/room/mod-badge/44322889/2",
      "4": "//cdn.frankerfacez.com/room/mod-badge/44322889/4"
    },
    "vip_badge": {
      "1": "//cdn.frankerfacez.com/room/vip-badge/44322889/1",
      "2": "//cdn.frankerfacez.com/room/vip-badge/44322889/2",
      "4": "//cdn.frankerfacez.com/room/vip-badge/44322889/4"
    }
  },
  "sets": {
    "51975": {
      "id": 51975,
      "title": "Channel: dansgaming",
      "source": null,
      "css": null,
      "emoticons": [
        {
          "id": 425196,
          "name": "dansHi",
          "height": 28,
          "width": 32,
          "public": true,
          "owner": { "name": "dansgaming", "display_name": "DansGaming" },
          "urls": {
            "1": "//cdn.frankerfacez.com/emote/425196/1",
            "2": "//cdn.frankerfacez.com/emote/425196/2",
            "4": "//cdn.frankerfacez.com/emote/425196/4"
          }
        }
      ]
    }
  }
}
```

### Fields

| Path | Type | Required | Meaning | Where the client reads it |
|---|---|---|---|---|
| `room` | object | **yes** | Channel data container. `data.room.twitch_id` is read **unconditionally** — a missing/null `room` throws a TypeError and the room fails to load. | `room.js:352` |
| `room.twitch_id` | number \| string | **yes** | Channel's numeric Twitch user id. Coerced to string `id`; used to register the room and to reject responses whose id doesn't match the expected room. | `room.js:352-363` |
| `room.id` | string | no | The channel **LOGIN** (username), **not** a numeric id. If `room.login` is unset it's taken from here; a mismatch only logs a warning. (Note the inverted naming: login is `id`, numeric is `twitch_id`.) | `room.js:366-368` |
| `room.set` | number \| string | no | The channel's primary FFZ emote-set id, added under provider `ffz-main`. Its set object should appear in `sets`. | `room.js:374-375` |
| `room.user_badge_ids` | object `{ [ffzBadgeId: string]: string[] }` | no | FFZ badge id → user **login** names that receive it in this room (provider `ffz`). Previous set removed first on reload. | `room.js:345-350,382-387` |
| `room.css` | string | no | Raw CSS injected into the room's `ManagedStyle` under key `css`. Falsy/absent deletes the entry. | `room.js:120-123,389-392` |
| `room.mod_urls` | object `{ "1": url, "2"?: url, "4"?: url }` | no | Custom moderator-badge images by scale. Index `1` essential; `2`/`4` optional. `<img>` uses `[4]\|\|[2]\|\|[1]`. Only rendered if the user enabled `chat.badges.custom-mod`. | `room.js:565,575,580`; `badges.jsx:920,928` |
| `room.vip_badge` | object `{ "1": url, "2"?: url, "4"?: url }` | no | Custom VIP-badge images by scale. Same indexing/rendering rules as `mod_urls`; gated on `chat.badges.custom-vip`. | `room.js:543,546,551`; `badges.jsx:921,939` |
| `sets` | object `{ [setId: string]: SetObject }` | no | Emote-set map. Each value passed to `loadSetData(set_id, value)`. Should contain the set referenced by `room.set`. Guarded by `if (data.sets)` — may be omitted. See §2. | `room.js:377-380` |

> The client does **not** read `display_name` or `moderator_badge` from the room object — only the fields above. The set object's own `id` is ignored (overwritten by the map key); set the map key to the real set id.

---

## 7. Image URLs

The client **never constructs emote image URLs** — the API supplies fully-formed absolute (or protocol-relative) URL strings, used verbatim for `src`/`srcset`. **All of these should point at the fork's own object storage / image CDN** rather than `cdn.frankerfacez.com`. The patterns below mirror the upstream CDN layout (substitute your CDN host).

### Emotes

- **Static:** `emote.urls` = `{ "1": url1x, "2"?: url2x, "4"?: url4x }`. Upstream form: `//cdn.frankerfacez.com/emote/{emoteId}/{1|2|4}`. The client uses `urls[1]` as `src` and builds srcset `<url1> 1x, <url2> 2x, <url4> 4x`. Only `1` is required.
- **Animated:** `emote.animated` = `{ "1", "2"?, "4"? }`. Upstream form: `//cdn.frankerfacez.com/emote/{emoteId}/animated/{1|2|4}`. Used for hover/animated src.
- **Mask:** `emote.mask` = `{ "1": url, … }`. `mask[1]` used directly as a CSS `-webkit-mask-image`.

### Badges

- **Non-addon FFZ badges (all global badges from `/v1/badges/ids`):** the client **constructs** the chat image as `{FFZ_IMAGE_CDN}/badge/{id}/{size}/rounded` (size `1`/`2`/`4`), **ignoring** the JSON `urls`/`image`. **Your image CDN must serve this rounded path.** (In this fork the host is the configurable `FFZ_IMAGE_CDN`, no longer hardcoded — `badges.jsx:425/1012`.)
- The `urls`/`image` you return **should still point at your CDN** (e.g. `…/badge/{id}/{size}`) because the **settings/visibility UI and tooltip previews** use them even for non-addon badges.
- **Addon badges** (not produced by this endpoint) use the JSON `urls` (`[1]`/`[2]`/`[4]`) with `image` as fallback.

### Room custom badges

- `room.mod_urls` / `room.vip_badge` = `{ "1", "2", "4" }`, full URL strings. Upstream forms: `//cdn.frankerfacez.com/room/mod-badge/{twitchId}/{scale}` and `//cdn.frankerfacez.com/room/vip-badge/{twitchId}/{scale}`. Emit your CDN equivalents.

### Set icon

- `set.icon` (optional) is a full URL string used as-is for the emote-menu section image.

### Avatars (Phase 3)

- Upstream avatar form: `https://cdn.frankerfacez.com/avatar/{provider}/{provider_id}`. Emit your CDN equivalent.

### Client-constructed (non-image) links — informational

These are built by the client and are **not** API fields, but constrain your `owner`/`artist`/emote `id` values: emote pages `https://www.frankerfacez.com/emoticon/{id}-`; owner/artist links `https://www.frankerfacez.com/{name}`.

---

## 8. Minimal viable responses

Smallest valid bodies so the client runs error-free with little/no content. Good for stubbing the API first, then filling in real data.

### `GET /v1/set/global/ids`
`default_sets` must be present and iterable; everything else can be empty.
```json
{ "default_sets": [], "sets": {} }
```

### `GET /v1/set/{id}`
`set` may be omitted entirely (the set just isn't loaded — no crash). Absolute minimum:
```json
{}
```
Minimum to actually register an (empty) set:
```json
{ "set": { "id": 1, "emoticons": [] } }
```

### `GET /v1/set/{id}/ids` (staging only)
Same as above; return `user_ids` instead of `users` if you include associations.
```json
{ "set": { "id": 1, "emoticons": [] } }
```

### `GET /v1/badges/ids`
Both keys optional and tolerated when absent.
```json
{ "badges": [], "users": {} }
```
(Empty `{}` is also accepted.)

### `GET /v1/room/id/{twitchId}` and `GET /v1/room/{login}`
`room` with a `twitch_id` is mandatory; `sets` is optional.
```json
{ "room": { "twitch_id": 44322889 } }
```
If you reference an emote set, include both `room.set` and a matching entry in `sets` with an array (possibly empty) of emotes:
```json
{
  "room": { "twitch_id": 44322889, "set": 1 },
  "sets": { "1": { "emoticons": [] } }
}
```

> Reminder: every SetObject's emote array (`emoticons` or `emotes`) must be an **array** — even an empty one — or `loadSetData` throws.

---

## 9. Authentication & `/v2` (later phase) — **PHASE 3**

> **Everything in this section is Phase 3.** Implement Phase 1 (sets, badges, rooms) first; the client runs fully on anonymous v1 data. Phase 2 is the single anonymous `/v1/_user/id/{id}` lookup. Phase 3 covers the authenticated account/subscription/collection features.

### Auth flow (SSE bearer token)

The client obtains a bearer token via an IRC challenge over Server-Sent Events.

- **Endpoint:** `GET (SSE) /auth/ext_verify/{userId}` — **hardcoded to `api.frankerfacez.com`** (not `FFZ_API`). To self-host, patch the client constant or front that host.
- **Path param:** `userId` — the user's Twitch id.
- **Flow / events read (`socket.js`):**
  - `challenge.data` (string) → the client posts this as an IRC challenge. (`socket.js:207`)
  - `token.data.token` (string, **required**) → the bearer token. (`socket.js:227`)
  - `token.data.expires` (ISO-8601 string, **required**) → token expiry. (`socket.js:232`)
- The resulting token is sent on all Phase 3 requests as `Authorization: Bearer {token}`.

### GET `/v1/_user/id/{id}` — Subwoofer months (**Phase 2, anonymous**)

Used only by the subwoofer badge tooltip. Served from `FFZ_API` (repointed in this fork — `badges.jsx:1368`), unauthenticated.

- **Path param:** `id` — Twitch user id.

| Path | Type | Required | Meaning | Read at |
|---|---|---|---|---|
| `user.sub_months` | number | no | Subscription months shown in the tooltip. | `badges.jsx:1372` |
| `user.sub_lifetime` | boolean | no | Lifetime-sub flag. | `badges.jsx:1375` |

### GET `/payment/plans` — Plans & pricing (**unauthenticated**)

Host = `FFZ_API`. Read by `emote_menu.jsx:2982-2987`.

| Path | Type | Required | Meaning |
|---|---|---|---|
| `plans` | map `{ [id]: plan }` with `id`, `temporary_collections` | yes | Plan definitions; `temporary_collections` is an array. |
| `gateway_plans` | obj with `plan_id`, `months`, `prices` | yes | Gateway/pricing. Prices are opaque; `months=1` baseline. |

### GET `/v2/subscription/status` — Subscription status (**Bearer**)

Host = `FFZ_API`. Query: `include=plan`. Read by `emote_menu.jsx:3038-3045`.

| Path | Type | Required | Meaning |
|---|---|---|---|
| `user.bonus_month_eligible` | boolean | no | Bonus-month eligibility. |
| `active_subs` | map `{ [id]: { id, expires_at, next_bill_date } }` | no | Active subscriptions. |
| `plans.temporary_collections` | array | no | Temporary collections granted by the plan. |

### POST `/v2/emote/{id}/report` — Report an emote (**Bearer**)

Host = `FFZ_API`. Path param `id` = emote id. The client requires `response.ok` **and** a truthy `success`.

| Path | Type | Required | Meaning | Read at |
|---|---|---|---|---|
| `success` | boolean | **yes** | Whether the report succeeded. | `report-form.vue:248` |

### GET `/v2/emote/{id}/collections/editable` — Editable collections (**Bearer**)

Host = `FFZ_API`. Path param `id` = emote id. Query: `include=collection`. Read by `manage-ffz.vue:120-121` and `collection.vue`.

| Path | Type | Required | Meaning |
|---|---|---|---|
| `emote.collections` | array of collection ids | no | Collections this emote already belongs to. |
| `collections` | map `{ [id]: collection }` | **yes** | All editable collections. |
| `collections.{id}.id` / `.title` / `.count` / `.limit` | (per type) | **yes** | Required collection fields. |
| `collections.{id}.icon` | string (URL) | no | Optional icon. |
| `collections.{id}.owner.provider` / `.provider_id` | string | no | Optional owner provider info (drives avatar URL — see §7). |

### PUT / DELETE `/v2/collection/{cid}/emote/{eid}` — Add/remove emote (**Bearer**)

Host = `FFZ_API`. Path params: `cid` = collection id, `eid` = emote id. `PUT` adds, `DELETE` removes.

| Path | Type | Required | Meaning | Read at |
|---|---|---|---|---|
| `collection.count` | number | no | Updated emote count for the collection. | `collection.vue:172` |

### Phase 3 notes

- All `/v2/*` requests use `Authorization: Bearer {token}` from the SSE flow. `/payment/plans` and `/v1/_user/id/{id}` are anonymous.
- Maps throughout Phase 3 are keyed by id; `emote.collections` and `plans.temporary_collections` are arrays.
- The report endpoint must return both HTTP `2xx` and `{ "success": true }` for the client to treat it as successful.
- CORS for Phase 3 must additionally allow the `Authorization` header and the `POST`/`PUT`/`DELETE` methods (with preflight `OPTIONS`).

---

## 10. Upstream API reference (for cross-checking)

This spec is derived from the **client's own parser code** — i.e. exactly what the
client requires — which is the authoritative contract for the fork. The official
upstream API is also publicly documented; use it to cross-check field names and to
discover endpoints the client doesn't use but a full backend may want:

- **Human docs (curl examples, v1 overview):** <https://www.frankerfacez.com/developers>
- **Swagger UI (interactive):** <https://api.frankerfacez.com/docs/> — multi-spec, with
  selectors `?urls.primaryName=API%20v1`, `?urls.primaryName=API%20v2`, and
  `?urls.primaryName=CDN`. (These are a JS single-page app; the raw OpenAPI spec
  files aren't at a guessable path, so they couldn't be machine-scraped here. If you
  want the exact v2/CDN field definitions reconciled into this doc, grab the spec
  URL from the browser's Network tab — it's the `.json`/`.yaml` request Swagger
  loads — and share it.)

### Additional upstream v1 endpoints (per the Developers page, not currently used by the client)

The client only needs the endpoints in §3–§6. For completeness, the upstream v1 API
(base `//api.frankerfacez.com/v1/`, anonymous, JSON) also exposes:

| Method | Path | Notes |
|---|---|---|
| GET | `/badge/{id}` or `/badge/{name}` | One badge **with** its user mapping. `/_badge/...` = badge only. |
| GET | `/badges` | All badges with user mappings. `/_badges` = without. (The client uses the `/ids` form, §5.) |
| GET | `/emote/{id}` | One emote (dimensions, owner, CDN urls at 1/2/4). |
| GET | `/emoticons` | Bulk emote search/listing. Query: `q`, `page` (≥1), `per_page` (1–200, default 50), `sort` (`name`/`owner`/`count`/`updated`/`created`, append `-asc`/`-desc`), `private` (on/off), `high_dpi` (on/off). |
| GET | `/set/{id}`, `/set/global` | Same data as §3–§4 (the client uses the `/ids` variants). |
| GET | `/user/{name}` or `/user/id/{id}` | User info incl. badges, avatar, global emote sets. `/_user/...` = without badges (see §9). |
| GET | `/room/{name}` or `/room/id/{id}` | Same data as §6. `/_room/...` = without the emote set. |

> Note the upstream `_`-prefixed variants (`/_badge`, `/_room`, `/_user`, `/_badges`)
> return the same object **minus** the heavy association data — a useful pattern to
> mirror, but only `/v1/_user/id/{id}` (§9) is actually called by the client.
