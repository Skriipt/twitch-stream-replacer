# Installing Stream Bridge

Stream Bridge is an unpacked Chromium Manifest V3 extension. Use Chrome 120 or later, or a compatible version of Edge or Brave. No build step, backend, or API key is required.

## Install

1. Download and fully extract the repository ZIP, or clone the repository.
2. Open `chrome://extensions` (Edge: `edge://extensions`; Brave: `brave://extensions`).
3. Enable **Developer mode**, select **Load unpacked**, and choose the repository's **`extension/` directory**. This directory contains `manifest.json`; do not select the repository root.
4. Open [YouTube](https://www.youtube.com/) in the same browser profile, choose the account you want to use, and complete any cookie consent prompt yourself.
5. Open or reload a Twitch channel page. Stream Bridge looks for YouTube channel links in the loaded creator profile and info panels. If no links are found, open the channel's **About / Info** section; links loaded later are checked automatically.
6. If a public YouTube livestream is available and the channel subscription check permits replacement, select **YouTube ansehen** (Watch on YouTube). Click Play in the player if necessary. Twitch chat stays available and YouTube uses the original player area.

The extension's controls currently use German labels. An active Twitch channel subscription keeps Twitch playback. An unknown subscription status blocks replacement until Twitch provides usable player data; see [subscription detection](SUBSCRIBER_DETECTION.md).

## Player controls

During YouTube playback, a small **⋯ button in the upper-right corner** opens **Zurück zu Twitch** (Return to Twitch), **Auf YouTube öffnen** (Open on YouTube), and **YouTube-Konto & Premium** (YouTube account and Premium). The menu overlays the video without reducing its size. Close it with **×**, **Escape**, or a click in the chat.

Twitch's small ad preview above chat is hidden during YouTube playback and its space is released. Leaving YouTube mode restores Twitch's own layout.

If no public YouTube livestream is available, Twitch keeps playing. **Erneut prüfen** (Check again) starts another lookup; there is no periodic YouTube discovery polling. The panel's arrow collapses it to a small channel indicator. STYLERZ and ColtHavok also retain their configured fallback mappings.

**Auf YouTube öffnen** opens the stream directly on YouTube. During YouTube mode, this removes the embedded player to prevent duplicate playback. Twitch video stays paused while chat remains available in the Twitch tab.

**Zurück zu Twitch ↻** removes the temporary video blocking rule and reloads Twitch. Reloading can discard unsent chat text.

## Update an existing installation

Replace the files in the previously loaded extension directory with the new contents of `extension/`, then select **Reload ↻** on the browser's extensions page. If you previously loaded the repository root, remove that old entry and load **`extension/`** instead. Alternatively, disable the old version before loading the new directory. Keep only one version enabled, then reload Twitch.

## YouTube sign-in and Premium

The regular YouTube player uses the browser profile's YouTube session. The extension does not request passwords or read cookie values.

**The extension cannot verify or enforce Premium benefits.** If an embedded player shows ads despite Premium, check the account on YouTube and the third-party cookie permissions for YouTube on the Twitch page. Use a site-specific exception instead of disabling cookie protection globally, then reload Twitch and switch again.

YouTube describes embedded-player sign-in requirements in its [official help article](https://support.google.com/youtube/answer/7437519?hl=en).

## Scope and permissions

- Discovery supports direct YouTube channel links in the loaded Twitch profile: `@handle`, `/channel/UC…`, `/c/name`, `/user/name`, and legacy custom names. It excludes name-based search, link aggregators, individual video links, chat links, and recommendations.
- Up to five distinct channel URLs are checked. Multiple live channels or a failed verification leave Twitch playing.
- Results and players are scoped to the current channel. Channel navigation removes the previous player.
- Twitch video requests are blocked only in the switched tab. Returning to Twitch, reloading, and channel navigation remove the blocking rule; other tabs remain available.
- The player retains normal YouTube controls. Player fullscreen hides Twitch chat.
- Manual timing adjustments and automatic synchronization are not implemented.
- The extension is not an ad blocker; sponsorships within a stream remain visible.
- There is no extension backend, telemetry, or credential storage.

The extension uses Twitch access to insert controls, YouTube access to discover streams, and `*.ttvnw.net` access with temporary Chromium network rules to pause Twitch video requests in the relevant tab. The `scripting` permission reads subscription status from the current Twitch player's loaded data. The browser may attach its existing YouTube session to channel requests; only channel and stream metadata is processed. There is no cookie permission or password/token extraction.

An independent project with no affiliation with Twitch, YouTube, or the respective streamers.
