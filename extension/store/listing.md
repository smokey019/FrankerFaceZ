# Chrome Web Store listing: SmokeyZ

Copy for the Developer Dashboard. Package: `bun run package:ext` -> `dist/smokeyz-<version>.zip`.

## Store listing tab

**Name:** SmokeyZ

**Summary** (manifest description, 132 chars max):
Custom emotes, chat features and UI tweaks for Twitch. A community fork of FrankerFaceZ; not affiliated with Twitch.

**Category:** Social & Communication
**Language:** English

**Description**

SmokeyZ adds custom emotes, chat features and interface tweaks to Twitch.tv.

- Custom emotes and badges in chat, with an emote menu and emote cards
- Chat filtering, highlights, mentions and message formatting options
- Layout, theme and player tweaks, configurable from the Home > Settings menu on Twitch
- Settings are stored locally in the extension and kept in sync across your Twitch tabs

SmokeyZ is a community fork of the open-source FrankerFaceZ project (Apache-2.0). It is not made by, endorsed by or affiliated with Twitch Interactive, Inc. or the FrankerFaceZ team. Source code: https://github.com/smokey019/FrankerFaceZ

Only runs on twitch.tv. Do not run it alongside FrankerFaceZ or a FrankerFaceZ userscript; whichever loads second steps aside.

**Icon:** `extension/icons/icon128.png`
**Screenshots:** 1280x800 or 640x400, at least one (take them of the Twitch chat and the settings menu with the extension on).

## Privacy tab

**Single purpose:** Enhance Twitch.tv chat and the Twitch interface with custom emotes, badges and customization options.

**Permission justifications**

- *Content script on `*://*.twitch.tv/*` (all frames):* Loads the bundled SmokeyZ code into Twitch pages, including the Twitch player and clips pages, which are separate twitch.tv hosts. `api.twitch.tv` is excluded.
- *`web_accessible_resources` (`web/*`):* The content script injects the bundled script into the page so it can interact with Twitch's own page code. Restricted to twitch.tv.
- *`externally_connectable` (twitch.tv):* Lets the injected page script talk to the extension's service worker to read and save settings.
- No `host_permissions`, `tabs`, `storage` or other API permissions are requested.

**Remote code:** No. All code is bundled in the package. Data (emote sets, badges, translations) is fetched as JSON and images, never executed.

**Data usage:** tick *Personally identifiable information* (your Twitch login name is sent to the FrankerFaceZ socket server) and *Website content* (the channel being viewed and links in chat, for emotes and link previews). Certify that data is not sold, not used for unrelated purposes and not used for creditworthiness. See `privacy-policy.md` for what leaves the browser.

**Privacy policy URL:** host `extension/store/privacy-policy.md`, e.g. https://github.com/smokey019/FrankerFaceZ/blob/master/extension/store/privacy-policy.md

## Distribution tab

Visibility: **Unlisted** (only people with the link can install; same review as public).
