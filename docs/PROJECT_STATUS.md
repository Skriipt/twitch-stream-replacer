# Project status: Stream Bridge 0.3.0

Updated: October 26, 2026. Version 0.3.0 adds profile-based channel discovery and a compact interface to the imported 0.2.1 prototype. This document separates repository checks from historical reports and live validation limits.

## Implemented behavior

- Direct YouTube channel links in the loaded Twitch profile and info panels identify additional creators. Handles, channel IDs, and legacy channel URLs are supported; the original STYLERZ and ColtHavok fallback mappings remain available.
- Discovery handles links loaded after navigation and discards stale results after channel or link changes. Twitch channel and profile headings must match the current channel. Chat links and recommendations are excluded.
- The resolver verifies channel identity, live status, and embedding support for up to five distinct channel URLs. Multiple live channels or a failed check leave Twitch playing.
- A compact, collapsible panel and an overlay menu preserve the full player area. The collapsed state is saved locally and applies to all Twitch tabs, reloads, and channels. The toolbar popup explains discovery and YouTube sign-in.
- During YouTube playback, the ⋯ menu button appears only while the pointer moves over the player, hides after about 2.5 seconds of inactivity, and remains visible with keyboard focus or an open menu. Hover does not cross the cross-origin embed boundary, so the embed script posts throttled pointer activity to `https://www.twitch.tv`; the Twitch page accepts it only from its own Stream Bridge frame. Touch-only devices keep the button visible. Wheel volume changes show a brief level indicator inside the player. The active menu omits the subscription status line.
- The active menu button sits halfway down the right edge to avoid YouTube's corner controls. Mouse-wheel input over the Stream Bridge embed changes volume by one percentage point per event, clamps to 0–100%, mutes at zero, and unmutes when raised. A narrowly scoped content script handles wheel events inside the cross-origin embed using the existing YouTube permission.
- Wheel volume uses the embedded player's `getVolume`, `isMuted`, `setVolume`, `mute`, and `unMute` methods in the page's `MAIN` world. This updates YouTube's state and controls together, avoiding later resets caused by changing the HTML video element alone. The handler ignores input until usable player methods are present. The `movie_player` element is a YouTube implementation detail and may require adaptation if YouTube changes it; the volume method contracts are described in the [YouTube Player API reference](https://developers.google.com/youtube/iframe_api_reference#Changing_the_player_volume).
- The subscription guard keeps Twitch playback for active channel subscribers. Missing or uncertain player data blocks replacement; see [subscription detection](SUBSCRIBER_DETECTION.md) for the state contract and evidence.

Discovery only reads direct channel URLs in the currently loaded profile. Open **About / Info** when links are missing. Name-based search, link aggregators, individual video links, and periodic YouTube discovery polling are not implemented. **Erneut prüfen** (Check again) starts a new lookup after a previous one finishes.

## Automatic switching and extension icons

The toolbar popup provides **Automatisch zu YouTube** (Automatically switch to YouTube), a locally saved preference that is off by default and applies to all Twitch tabs. Automatic playback repeats the live and subscription checks used for manual switching. Turning it off while a lookup or switch is pending prevents activation; existing YouTube players continue playing. A deliberate return to Twitch persists for that channel in the same tab across reloads until automatic switching is enabled again or the tab closes. The setting requires the `storage` permission.

The bridge and play-symbol icon replaces the original placeholder. Its editable SVG source and packaged PNGs at 16, 32, 48, and 128 pixels live in `extension/assets/`. Run `npm run icons` to regenerate the PNGs using Chromium.

Automatic switching keeps Twitch playing for active or unknown subscription states. It introduces no periodic YouTube polling; the existing subscription checks remain in place.

## Switching speed

The service worker starts the YouTube lookup when a Twitch channel tab starts loading, for the two configured channels and for channels whose profile links an earlier lookup saw. The last 25 channels' links are stored in `chrome.storage.local` (`knownProfileLinks`). The page also starts its lookup while the subscription state is loading, and the result is cached for 30 seconds. Because the subscription is unknown at that point, subscribers to a channel also trigger one lookup per visit; they are never switched. An unconfirmed subscription state is retried every 0.4 seconds, up to 30 times. An automatic switch reuses a lookup younger than 10 seconds, while a manual click or an older result is verified again before Twitch is suspended.

## Reproducible repository checks

Run these commands from the repository root after installing the development dependencies:

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

`npm run test:unit` covers URL normalization, resolver validation, background messages and network rules, subscription detection, and the content-script subscription lifecycle with mocked APIs and JSDOM.

`npm run test:browser` covers runtime failure handling and the actual unpacked Manifest V3 extension in Chromium against controlled Twitch/YouTube responses. It exercises delayed profile links, ambiguous and ended streams, pending lookup changes, stale profiles during navigation, multiple tabs, player sizing, keyboard and menu controls, subscription checks in the page's `MAIN` world, restoration of Twitch playback and network access, saved automatic switching preferences, keyboard operation, deliberate returns to Twitch, and cancellation during pending lookups or network suspension. `npm test` runs both groups. GitHub Actions runs the same checks on pull requests and pushes to `main`.

These checks establish fixture behavior and real Chromium extension integration. They do not establish authenticated Twitch behavior, real subscription purchases/expirations, YouTube playback, Premium benefits, or behavior during actual Twitch ad breaks.

Player-control regressions additionally exercise clickable native corner controls at 960×540, 400×225, and 320×180; real mouse-wheel input inside a cross-origin embed; exact 1% steps, mute/unmute and volume limits; and isolation from unrelated YouTube embeds and standalone players. The fixture keeps player state separate from its HTML video element and reapplies that state after wheel input to catch volume resets and stale UI indicators. It also checks readiness and verifies that wheel steps start from player volume when media volume differs. UI checks cover the volume indicator, menu button reveal and idle hiding, and the collapsed panel preference across reloads, channels, and tabs. These use synthetic player controls, rather than live YouTube playback.

## Previous live observations

During the original 0.3.0 discovery work, Chromium screenshots were inspected at normal and small player sizes and in the popup. A public Twitch About section was checked for its DOM structure, and its headings and legacy YouTube URL informed the discovery implementation. A separate Node request verified the linked YouTube channel as offline.

A loaded-extension attempt on the real Twitch page found the profile link but could not reach YouTube from a fresh Chromium profile. **Real YouTube playback, Premium sign-in, and Twitch ad breaks were not confirmed by that attempt.** A successful Node metadata request does not replace browser validation.

The automatic-switching and icon work also inspected popup and icon screenshots. Its browser checks used controlled fixtures and did not perform a new live Twitch/YouTube playback check.

A follow-up wheel-volume check loaded the current YouTube embed in a fresh Chromium extension profile. Its `movie_player` exposed all five volume/mute methods. Real mouse-wheel input changed the player-reported state from muted at 50% to unmuted at 1%, then 2%, back to 1%, and muted at 0%. A separate method-order probe confirmed that calling `unMute` after setting 1% raises it to 5%; the handler therefore unmutes before setting the requested volume. The embed showed a playback error, so this confirms current player-method integration, not audible live playback or signed-in behavior.

The UI refinement check loaded the current YouTube embed under a Twitch fixture origin. Wheel input created the volume indicator inside `movie_player` without Trusted Types or console errors, and pointer activity reached the Twitch page. The embed again showed "Video unavailable", so the indicator's appearance over live video was not confirmed.

Subscription work on October 26, 2026 separately confirmed `not-subscribed` for a live ColtHavok stream in a fresh signed-out Chromium profile. Offline STYLERZ lacked channel-specific player data and remained `unknown`. Authenticated subscription behavior still requires manual validation; details and source evidence are recorded in the subscription document.

## Development history

1. **0.1.0 — STYLERZ:** A fixed `@STYLERZlive` mapping, verified livestream discovery, manual player replacement, and return to Twitch. The regular YouTube player uses the browser session; Twitch video requests are paused in the affected tab.
2. **0.2.0 — ColtHavok:** A second `@ColtHavok` mapping, isolated results, cleanup during channel navigation, and multiple-tab support.
3. **0.2.1 — Player area and ad preview:** A banner that consumed about 133 pixels in the original reproduction became a small overlay menu. The simulated ad preview occupied another 180 pixels above chat; YouTube mode now hides its container and releases that space.
4. **0.3.0 — Profile discovery:** Direct profile links support additional creators, with metadata verification and a smaller interface.

The earlier development record reported 10 passing resolver tests and 27 passing browser checks for 0.2.1, including simulated ad previews, navigation, multiple tabs, network rules, and a YouTube session cookie reaching the embed. Those test sources were absent from the imported release and were not rerun during repository import. They are historical reports, not results from the current suites.

At import, all seven release files matched the source archive by SHA-256; the four JavaScript files passed syntax checks, and manifest file references were validated. Those static checks did not establish Premium sign-in or reliable ad-free playback.

## Remaining work

- Validate playback during real Twitch ad breaks and with a signed-in YouTube Premium profile.
- Validate subscription purchases and expirations with authenticated accounts.
- Explore manual timing adjustments and synchronization assistance.
- Explore additional discovery sources and a manual mapping interface.

See the [README](../README.md) for an overview and the [installation guide](INSTALLATION.md) for setup and updates.
