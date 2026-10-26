<div align="center">
  <img src="assets/icon.svg" width="80" height="80" alt="Twitch Stream Replacer">

# Twitch Stream Replacer

**Watch YouTube livestreams on Twitch while keeping the Twitch chat.**

[Overview](#overview) · [Goals](#goals) · [Installation](#installation) · [Development](#development)
</div>

## Overview

Many streamers broadcast on Twitch and YouTube at the same time. Twitch Stream Replacer brings YouTube playback to the familiar Twitch page: the YouTube livestream plays in the video area while the native Twitch chat remains available alongside it.

The browser extension finds the corresponding YouTube livestream, makes it easy to switch between players, and pauses Twitch playback in the background. The Twitch page remains the central place to watch and chat.

## Goals

The project aims to let viewers choose their video platform independently of their chat platform. Viewers who prefer YouTube playback should be able to keep participating in the Twitch community through its familiar chat interface.

The intended feature set includes:

- **Find matching livestreams:** Reliably associate Twitch and YouTube channels and detect active broadcasts.
- **Switch easily:** Use the YouTube player on the Twitch page and return to Twitch playback at any time.
- **Use the existing YouTube sign-in:** Play streams through the regular YouTube player using the browser profile's session.
- **Avoid duplicate playback:** Pause Twitch video and audio while YouTube playback is active.
- **Align video and chat:** Add manual timing adjustments in the future to help reduce the delay between platforms.

> [!NOTE]
> The project is under development. See [Project status](docs/PROJECT_STATUS.md) for the current implementation, validation results, and remaining work.

## How it works

1. The extension identifies the Twitch channel being viewed.
2. It reads the current channel's subscription status from Twitch's loaded player data. An active subscription keeps Twitch playback; an unknown status temporarily prevents replacement.
3. For viewers without a channel subscription, it reads YouTube channel links from the creator's loaded Twitch profile and info panels, then checks the linked channels for an active livestream. The two original configured channels remain available as fallbacks.
4. After switching, the YouTube player replaces the Twitch video area while the native chat remains available.
5. A compact menu lets the viewer return to Twitch playback or open the stream directly on YouTube.

The subscription check is repeated before switching and every five seconds while a supported channel tab is visible. If Twitch reports a new subscription during YouTube playback, the extension restores Twitch's network access and reloads the page. This is the basis for a future automatic switcher; switching to YouTube remains manual. See [subscription detection](docs/SUBSCRIBER_DETECTION.md) for the state contract and validation limits.

### Automatic discovery in 0.3.0

New creators no longer need a source-code mapping when their Twitch profile links to a YouTube channel. Handle (`/@name`), channel ID (`/channel/UC…`), and legacy `/c/`, `/user/` and bare custom-name links are supported. The extension verifies YouTube's channel ID and live player metadata before offering playback.

Discovery uses the profile and panels currently loaded on the Twitch page. If no channel link is found, open the channel's **About / Info** section; links loaded later are checked automatically. Chat links and recommendations are excluded. Short video links, link aggregators and name-based search are outside this first version. YouTube discovery has no periodic background polling; use **Erneut prüfen** to check whether a broadcast has started since the last lookup.

Up to five distinct linked channel URLs are checked. If multiple channels are live, or a linked channel cannot be verified, Twitch keeps playing and the extension asks you to check YouTube directly. Finding a stream never switches playback automatically.

## Installation

The extension uses Chromium Manifest V3 and requires Chrome 120 or later, or a compatible Chromium browser. The current source requires no build step, backend, or API key.

1. Download and extract the repository, or clone it:

   ```sh
   git clone https://github.com/Skriipt/twitch-stream-replacer.git
   ```

2. Open `chrome://extensions`, `edge://extensions` in Edge, or `brave://extensions` in Brave.
3. Enable **Developer mode** and select **Load unpacked**.
4. Select the project folder containing `manifest.json`.
5. Sign in to YouTube in the same browser profile, then reload the Twitch page.

The [installation guide](INSTALLATION.md) covers the current prototype's controls, updates, and required cookie settings. The guide is currently in German.

## YouTube sign-in and Premium

The regular YouTube player uses the browser profile's YouTube session. The extension does not request account credentials or read cookie values.

> [!IMPORTANT]
> The extension cannot verify or enforce YouTube Premium benefits. Whether the embedded player can use the signed-in session depends on factors including cookie settings. The project does not guarantee ad-free playback.

## Permissions and data

| Access | Purpose |
| --- | --- |
| `www.twitch.tv` | Identify the channel and insert the controls and player. |
| `www.youtube.com` | Fetch channel and stream metadata. |
| `*.ttvnw.net` and `declarativeNetRequestWithHostAccess` | Temporarily block Twitch video requests in the relevant tab. |
| `scripting` | Read the subscription state in the Twitch page's JavaScript context, using the existing Twitch host permission. |

The extension has no backend of its own and collects no telemetry. It does not have permission to read cookies. The browser may attach its existing YouTube session to requests; the embedded player connects directly to YouTube.

## Development

The project consists of JavaScript and HTML with no external runtime dependencies.

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 configuration, permissions, and entry points. |
| `config.js` | Mappings between Twitch and YouTube channels. |
| `discovery.js` | Collect creator-owned YouTube channel links from the Twitch profile. |
| `resolver.js` | Read YouTube metadata and validate livestreams. |
| `background.js` | Service worker, lookup cache, and per-tab network rules. |
| `content.js` | Player replacement, menu, media controls, and channel navigation. |
| `subscriber.js` | Read the current channel's subscription state from Twitch's committed player data. |
| `popup.html` | Entry point through the extension's toolbar icon. |

After editing files, reload the extension on the browser's extensions page and refresh Twitch. Technical limitations and previous validation results are documented in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md), currently in German.

### Reproducible checks

Node.js 24 is used in CI. Development dependencies are used only for testing; the unpacked extension still needs no build step.

```sh
npm ci
npx playwright install chromium
npm test
```

`npm run test:unit` runs the URL, resolver, service-worker and subscription regression tests. `npm run check` checks the extension JavaScript syntax. The full suite additionally loads the actual unpacked extension in headless Chromium against controlled Twitch and YouTube fixtures. It exercises discovery, player controls, channel navigation and real Chromium session rules. These tests do not establish live YouTube playback, sign-in or Premium behaviour.

For the real Manifest V3 smoke test against synthetic Twitch/YouTube responses, install Chromium with `npx playwright install chromium`, then run `npm run test:browser`. An existing Chromium executable can be selected with `CHROMIUM_EXECUTABLE`.

An independent project with no affiliation with Twitch, YouTube, or the respective streamers.
