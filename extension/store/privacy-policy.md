# SmokeyZ Privacy Policy

Last updated: 2026-10-22

SmokeyZ is a browser extension that adds emotes, chat features and interface customization to Twitch.tv. It is a community fork of FrankerFaceZ.

## What SmokeyZ stores

Your SmokeyZ settings (chosen options, profiles, and any custom data you configure) are stored locally in your browser by the extension. They are not sent to the extension author.

## What leaves your browser

SmokeyZ itself has no analytics, tracking or advertising, and no error reporting is enabled. To work, the client talks to these services, which are operated by the FrankerFaceZ project and Twitch, not by the SmokeyZ author:

- **FrankerFaceZ servers** (`api.frankerfacez.com`, `cdn2.frankerfacez.com`, and FrankerFaceZ socket and PubSub hosts): the channel you are viewing is used to look up emotes, badges and room data. If you are logged in to Twitch, your Twitch login name is sent to the FrankerFaceZ socket server so it can return your emote sets and badges. When a feature needs you to authenticate with FrankerFaceZ, your numeric Twitch user ID is sent to the FrankerFaceZ API, and a short verification message is sent from your account to a FrankerFaceZ-run Twitch chat channel (`frankerfacezauthorizer`) to prove you own the account. Your IP address is visible to these servers as with any web request.
- **FrankerFaceZ link service** (`link-service.workers.frankerfacez.com`): if link previews are enabled, links that appear in chat are sent to it to generate previews.
- **Twitch** (`twitch.tv` and its APIs): the extension runs on Twitch pages and uses Twitch's own requests to read chat and page data. Twitch's privacy policy applies to that data.

SmokeyZ does not collect your Twitch password or payment information, and the author does not sell or share data with third parties.

## Add-ons

SmokeyZ includes a catalog of community-made FrankerFaceZ add-ons, bundled inside the extension. All add-ons are off by default. When you turn one on in the Add-Ons menu, it runs on Twitch pages and may contact its own service, which is run by that add-on's author or a third party and not by SmokeyZ. Examples: 7TV, BetterTTV and FFZ:AP (emote lookups for the channels you view), a pronouns service (usernames), EloWard (usernames), custom-command bot APIs, and Google Translate (messages you choose to translate). Each add-on's description in the menu says what it does. Their data handling is governed by those services' own policies. Add-ons you never enable do not run and send nothing.

## Permissions

The extension runs only on `twitch.tv` pages. It requests the `scripting` permission and access to `twitch.tv` only so it can re-inject its own bundled script into Twitch tabs the browser did not load it into, such as tabs restored at browser startup. It requests no other browser permissions.

## Contact

Open an issue at https://github.com/smokey019/FrankerFaceZ/issues.

## Changes

Changes to this policy will be published at this location with a new date.
