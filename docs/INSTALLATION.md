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

## Automatic switching

Open the extension's toolbar popup and enable **Automatisch zu YouTube** (Automatically switch to YouTube) to open a single verified public livestream automatically. The setting is off by default, is stored locally in the browser profile, and applies to all Twitch tabs, including tabs already open. Turning it off leaves an existing YouTube player running and makes future switches manual. It adds no periodic YouTube discovery polling.

The subscription guard also applies to automatic switching: an active or unknown subscription status keeps Twitch playing. A switch is allowed only after Twitch confirms there is no channel subscription.

## Player controls

During YouTube playback, a small **⋯ button halfway down the right edge** opens **Zurück zu Twitch** (Return to Twitch), **Auf YouTube öffnen** (Open on YouTube), and **YouTube-Konto & Premium** (YouTube account and Premium). This keeps the button clear of YouTube's corner controls. The menu overlays the video without reducing its size. Close it with **×**, **Escape**, or a click in the chat. Like YouTube's own controls, the ⋯ button appears while the pointer moves over the video and fades out after about 2.5 seconds without movement or when the pointer leaves the player; keyboard focus also reveals it. The menu omits the subscription status line during YouTube playback.

Hover over the YouTube player and scroll up to raise the volume or down to lower it in **1-percentage-point steps**. Volume stops at 100%; reaching 0% mutes playback, and scrolling up unmutes at 1%. The next step starts from the current volume, including changes made with YouTube's controls. Scrolling over Twitch chat or the Stream Bridge menu keeps its normal behavior. Ctrl/Command-scroll remains available for browser zoom. This control applies only to the embedded player opened by Stream Bridge. A short indicator at the top of the player shows the new level, or **Stumm** (Muted) at 0%.

Wheel changes use the YouTube player's own volume and mute methods so its slider, mute indicator, and playback state stay synchronized. Volume control becomes available once those methods are ready.

Twitch's small ad preview above chat is hidden during YouTube playback and its space is released. Leaving YouTube mode restores Twitch's own layout.

If no public YouTube livestream is available, Twitch keeps playing. **Erneut prüfen** (Check again) starts another lookup; there is no periodic YouTube discovery polling. The panel's arrow collapses it to a small channel indicator. The browser profile remembers this choice for all Twitch tabs, reloads, and channels until the panel is expanded again. STYLERZ and ColtHavok also retain their configured fallback mappings.

**Auf YouTube öffnen** opens the stream directly on YouTube. During YouTube mode, this removes the embedded player to prevent duplicate playback. Twitch video stays paused while chat remains available in the Twitch tab.

**Zurück zu Twitch ↻** removes the temporary video blocking rule and reloads Twitch. Reloading can discard unsent chat text.

Even with automatic switching enabled, that channel then stays on Twitch in the same tab across reloads. Other channels and tabs can still switch automatically. Turn the automatic setting off and on in the toolbar popup to allow automatic switching for that channel in the tab again. Closing the tab clears this exception.

## Favorites and faster switching

Click the star in the panel of a channel page to mark it as a favorite (up to ten; the toolbar popup lists and removes them). Whenever a Twitch page opens, the extension checks the favorites' YouTube status in the background, at most every two minutes, so the result is ready when you open one. Favorites need a known YouTube link, which the extension remembers after the first visit to the channel; STYLERZ and ColtHavok are always known. This is the only recurring YouTube request, and only while you browse Twitch. Without favorites, the extension only looks up the channel you open.

For measuring, the page records the steps of a switch (`mounted`, `subscription`, `lookup`, `switch`, `suspended`, `frame`, `loaded`, `playing`) in milliseconds since navigation start. The console prints them as `[Stream Bridge] Timing (ms)` when the YouTube player starts, and the panel's `data-timing` attribute holds them.

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

The extension uses Twitch access to insert controls, YouTube access to discover streams, and `*.ttvnw.net` access with temporary Chromium network rules to pause Twitch video requests in the relevant tab. The `scripting` permission reads subscription status from the current Twitch player's loaded data. The `storage` permission saves the automatic playback preference and the collapsed panel state locally and remembers a tab's deliberate return to Twitch for the browser session. The browser may attach its existing YouTube session to channel requests; only channel and stream metadata is processed. There is no cookie permission or password/token extraction.

An independent project with no affiliation with Twitch, YouTube, or the respective streamers.
