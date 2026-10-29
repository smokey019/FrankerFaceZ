# Chrome Web Store listing: SmokeyZ

Copy for the Developer Dashboard. Package: `bun run package:ext` -> `dist/smokeyz-<version>.zip`.

## Store listing tab

**Name:** SmokeyZ

**Summary** (manifest description, 132 chars max):
Custom emotes, chat features and UI tweaks for Twitch. A community fork of FrankerFaceZ; not affiliated with Twitch.

**Category:** Social & Communication
**Language:** English

**Description**

(The store shows this as plain text, so paste it as is.)

SmokeyZ adds custom emotes, chat features and interface tweaks to Twitch.tv.

WHAT YOU GET
- Custom emotes and badges in chat, with an emote menu and emote cards
- Chat filtering, highlights, mentions and message formatting options
- Layout, theme and player tweaks, configurable from the Home > Settings menu on Twitch
- A built-in catalog of 43 community add-ons, all off until you turn them on (7TV and BetterTTV emotes, Pronouns, Deck, Mass Ban Tool and more)
- Settings are stored locally in the extension and kept in sync across your Twitch tabs

ADDED IN SMOKEYZ
- Session chat logs on viewer cards: open a user's card to see a collapsible list of what they have said in the current channel session, in their chat colour with badges. Stored locally only, cleared when you refresh or change channel, and works without moderator access.
- Moderation notices for everyone: see timeout, ban and deleted-message notices in chat even if you are not a moderator.
- All emotes in mod logs: FFZ, BetterTTV and 7TV emotes render in Twitch's built-in moderator logs on the viewer card (moderators only).
- Per-tab Swap Sides button: a button at the top of chat that swaps chat and navigation to the other side of the window for that tab only, including in theatre mode.
- Refresh Emotes button: reload FFZ, add-on and badge data, and Twitch's emote data, from the emote menu without reloading the page.
- "Added by" credit on emote tooltips and cards, when the emote source provides it (add-ons such as 7TV can).
- Option to hide Twitch's sticky promotional banner at the bottom of the page.
- Option to hide event promotion links in Twitch's top navigation.
- Experiments page shows when each experiment was first detected and sorts newest first.
- Fork Changelog page under Home that lists SmokeyZ's own changes.
- Performance work on startup and chat rendering.
- Reloads itself into Twitch tabs the browser skipped, such as tabs restored when the browser starts.

SMOKEY'S UTILITIES ADD-ON (optional, off by default)
- Pinned mentions at the top of chat, with limits, timers, colours and optional desktop notifications
- Keeps video quality from dropping when the tab is in the background
- Opens the Live tab automatically on the Following page
- Keyboard shortcuts for timeout, ban, purge and delete from the viewer card, with an optional confirmation

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
- *`scripting` and host permission for `*://*.twitch.tv/*`:* Chrome occasionally fails to run the content script in Twitch tabs that were restored while the browser was starting, which leaves the extension silently missing until the tab is reloaded. On startup and when a Twitch tab finishes loading, the service worker uses `scripting.executeScript` to inject the same bundled `content.js` into twitch.tv tabs that don't have it yet. It never injects anything else and never touches other sites.
- No `tabs`, `storage` or other API permissions are requested.

**Remote code:** No. All code is bundled in the package, including the community add-ons (`web/addons/`), which are fetched at build time by `bin/fetch_addons.js` and shipped in the zip. Data (emote sets, badges, translations) is fetched as JSON and images, never executed.

**Data usage:** tick *Personally identifiable information* (your Twitch login name is sent to the FrankerFaceZ socket server) and *Website content* (the channel being viewed and links in chat, for emotes and link previews). Certify that data is not sold, not used for unrelated purposes and not used for creditworthiness. See `privacy-policy.md` for what leaves the browser.

**Privacy policy URL:** host `extension/store/privacy-policy.md`, e.g. https://github.com/smokey019/FrankerFaceZ/blob/master/extension/store/privacy-policy.md

## Distribution tab

Visibility: **Unlisted** (only people with the link can install; same review as public).
