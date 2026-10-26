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
2. It checks the associated YouTube channel for an active livestream.
3. After switching, the YouTube player replaces the Twitch video area while the native chat remains available.
4. A compact menu lets the viewer return to Twitch playback or open the stream directly on YouTube.

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

The extension has no backend of its own and collects no telemetry. It does not have permission to read cookies. The browser may attach its existing YouTube session to requests; the embedded player connects directly to YouTube.

## Development

The project consists of JavaScript and HTML with no external runtime dependencies.

| File | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 configuration, permissions, and entry points. |
| `config.js` | Mappings between Twitch and YouTube channels. |
| `resolver.js` | Read YouTube metadata and validate livestreams. |
| `background.js` | Service worker, lookup cache, and per-tab network rules. |
| `content.js` | Player replacement, menu, media controls, and channel navigation. |
| `popup.html` | Entry point through the extension's toolbar icon. |

After editing files, reload the extension on the browser's extensions page and refresh Twitch. Technical limitations and previous validation results are documented in [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md), currently in German.

An independent project with no affiliation with Twitch, YouTube, or the respective streamers.
