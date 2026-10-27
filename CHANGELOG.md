# Changelog

## Unreleased

## 0.3.2

### Fixed

- Stop preroll audio after switching to YouTube even when Twitch moves or detaches its media element before the switch or tries to resume it afterward.

## 0.3.1

### Added

- Downloadable extension-only ZIP and SHA-256 checksum on GitHub Releases, with the manifest at the archive root for unpacked installation.
- Automatic release publication after successful checks on `main`, plus a version policy and checks that require an increment for every change set.
- Favorites: star a channel in its panel (up to ten, listed and removable in the popup). Opening any Twitch page checks their YouTube status in the background, at most every two minutes, so the result is ready when a favorite is opened.
- A timing log of the switch (`mounted`, `subscription`, `lookup`, `switch`, `suspended`, `frame`, `loaded`, `playing`) in the console and the panel's `data-timing` attribute.

### Changed

- Keep a live YouTube result for 90 seconds (other results 30 seconds), and let an automatic switch reuse a live result of that age.
- Switch to YouTube sooner: retry an unconfirmed subscription state every 0.4 seconds for up to 12 seconds instead of waiting for the five-second poll, start the YouTube lookup while the subscription state loads, and let an automatic switch reuse the lookup that just found the stream.
- Start the YouTube lookup as soon as a Twitch channel tab starts loading. Configured channels and channels whose profile links were seen before (the last 25 are remembered locally) are looked up before the page finishes rendering. This includes viewers who turn out to be subscribed; Twitch keeps playing for them.
- Remember the collapsed panel across reloads, channels and Twitch tabs.
- Show the volume level briefly while changing it with the mouse wheel.
- Reveal the player menu button only while the pointer moves over the video, like YouTube's own controls.
- Omit the subscription status line from the menu during YouTube playback.

### Fixed

- Keep native Twitch audio paused and muted when Twitch changes volume or inserts or replaces player elements during YouTube playback.

## 0.3.0

### Added

- Find YouTube livestreams for additional creators through channel links in their loaded Twitch profile and info panels.
- Check profile links that appear after the Twitch page loads, and verify channel ownership, live status and embedding support before offering playback.

### Changed

- Use a smaller, collapsible player panel with clearer status indicators, keyboard controls and sizing that follows the player area.
- Explain automatic discovery and YouTube sign-in in the updated toolbar popup.

### Maintenance

- Add reproducible resolver and Chromium extension tests, with continuous checks for pull requests.

Discovery currently requires a direct YouTube channel link in the loaded profile. Ambiguous results keep Twitch playing; playback changes only when selected. The two original channel mappings remain supported. YouTube Premium behaviour is not guaranteed.
