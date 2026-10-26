# Project status: Stream Bridge 0.3.0

Updated: October 26, 2026. Version 0.3.0 adds profile-based channel discovery and a compact interface to the imported 0.2.1 prototype. This document separates repository checks from historical reports and live validation limits.

## Implemented behavior

- Direct YouTube channel links in the loaded Twitch profile and info panels identify additional creators. Handles, channel IDs, and legacy channel URLs are supported; the original STYLERZ and ColtHavok fallback mappings remain available.
- Discovery handles links loaded after navigation and discards stale results after channel or link changes. Twitch channel and profile headings must match the current channel. Chat links and recommendations are excluded.
- The resolver verifies channel identity, live status, and embedding support for up to five distinct channel URLs. Multiple live channels or a failed check leave Twitch playing.
- A compact, collapsible panel and an overlay menu preserve the full player area. The toolbar popup explains discovery and YouTube sign-in.
- The subscription guard keeps Twitch playback for active channel subscribers. Missing or uncertain player data blocks replacement; see [subscription detection](SUBSCRIBER_DETECTION.md) for the state contract and evidence.

Discovery only reads direct channel URLs in the currently loaded profile. Open **About / Info** when links are missing. Name-based search, link aggregators, individual video links, and periodic YouTube discovery polling are not implemented. **Erneut prüfen** (Check again) starts a new lookup after a previous one finishes.

## Reproducible repository checks

Run these commands from the repository root after installing the development dependencies:

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

`npm run test:unit` covers URL normalization, resolver validation, background messages and network rules, subscription detection, and the content-script subscription lifecycle with mocked APIs and JSDOM.

`npm run test:browser` covers runtime failure handling and the actual unpacked Manifest V3 extension in Chromium against controlled Twitch/YouTube responses. It exercises delayed profile links, ambiguous and ended streams, pending lookup changes, stale profiles during navigation, multiple tabs, player sizing, keyboard and menu controls, subscription checks in the page's `MAIN` world, and restoration of Twitch playback and network access. `npm test` runs both groups. GitHub Actions runs the same checks on pull requests and pushes to `main`.

These checks establish fixture behavior and real Chromium extension integration. They do not establish authenticated Twitch behavior, real subscription purchases/expirations, YouTube playback, Premium benefits, or behavior during actual Twitch ad breaks.

## Previous live observations

During the original 0.3.0 discovery work, Chromium screenshots were inspected at normal and small player sizes and in the popup. A public Twitch About section was checked for its DOM structure, and its headings and legacy YouTube URL informed the discovery implementation. A separate Node request verified the linked YouTube channel as offline.

A loaded-extension attempt on the real Twitch page found the profile link but could not reach YouTube from a fresh Chromium profile. **Real YouTube playback, Premium sign-in, and Twitch ad breaks were not confirmed by that attempt.** A successful Node metadata request does not replace browser validation.

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
