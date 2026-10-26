# Changelog

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
