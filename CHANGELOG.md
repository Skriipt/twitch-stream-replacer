# Changelog

## Unreleased

### Changed

- Remember the collapsed panel across reloads, channels and Twitch tabs.
- Show the volume level briefly while changing it with the mouse wheel.
- Reveal the player menu button only while the pointer moves over the video, like YouTube's own controls.
- Omit the subscription status line from the menu during YouTube playback.

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
