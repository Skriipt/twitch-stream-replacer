(() => {
  "use strict";
  // Wheel events never bubble out of a cross-origin iframe. Listen inside only
  // the player created by Stream Bridge, leaving other YouTube embeds alone.
  if (window.top === window || window.name !== "stream-bridge-youtube" ||
      location.ancestorOrigins[0] !== "https://www.twitch.tv") return;

  document.addEventListener("wheel", (event) => {
    if (!event.deltaY || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    // These methods belong to YouTube's page, so this content script runs in
    // MAIN. Updating the media element alone leaves YouTube's UI/state stale;
    // its next state update can then undo the wheel change.
    const player = document.getElementById("movie_player");
    if (!["getVolume", "isMuted", "setVolume", "mute", "unMute"].every((method) => typeof player?.[method] === "function")) return;
    const volume = player.getVolume();
    const muted = player.isMuted();
    if (!Number.isFinite(volume) || typeof muted !== "boolean") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const current = muted ? 0 : Math.round(volume);
    const next = Math.max(0, Math.min(100, current + (event.deltaY < 0 ? 1 : -1)));
    // YouTube's unMute can raise low volumes to 5%. Unmute first, then set the
    // requested level, and avoid unMute when the player is already audible.
    if (next > 0 && muted) player.unMute();
    player.setVolume(next);
    if (next === 0) player.mute();
  }, { capture: true, passive: false });
})();
