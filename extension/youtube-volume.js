(() => {
  "use strict";
  // Wheel events never bubble out of a cross-origin iframe. Listen inside only
  // the player created by Stream Bridge, leaving other YouTube embeds alone.
  if (window.top === window || window.name !== "stream-bridge-youtube" ||
      location.ancestorOrigins[0] !== "https://www.twitch.tv") return;

  // Pointer events stay inside this cross-origin frame and :hover does not
  // reach the Twitch page, so report activity for the menu button's auto-hide.
  let lastActivity = 0;
  function reportPointer() {
    const now = Date.now();
    if (now - lastActivity < 250) return;
    lastActivity = now;
    window.parent.postMessage({ type: "stream-bridge-pointer" }, "https://www.twitch.tv");
  }
  document.addEventListener("pointermove", reportPointer, { capture: true, passive: true });
  document.addEventListener("pointerdown", reportPointer, { capture: true, passive: true });

  // First frame of real playback, for the Twitch page's timing log.
  document.addEventListener("playing", () => {
    window.parent.postMessage({ type: "stream-bridge-playing" }, "https://www.twitch.tv");
  }, { capture: true, once: true });

  let hud = null;
  let hudTimer = 0;

  // API volume changes show no feedback in the embed, so mirror YouTube's
  // bezel briefly. Build nodes directly: the embed enforces Trusted Types.
  function showVolume(player, volume) {
    if (!hud?.isConnected) {
      hud = document.createElement("div");
      hud.id = "stream-bridge-volume";
      hud.setAttribute("aria-hidden", "true");
      hud.style.cssText = "position:absolute;top:12%;left:50%;z-index:2147483647;transform:translateX(-50%);" +
        "min-width:96px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;pointer-events:none;" +
        "font:600 15px/1.2 Roboto,Arial,sans-serif;text-align:center;transition:opacity .2s ease;";
      const label = document.createElement("div");
      const track = document.createElement("div");
      track.style.cssText = "height:3px;margin-top:6px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden;";
      const fill = document.createElement("div");
      fill.style.cssText = "height:100%;background:#fff;";
      track.append(fill);
      hud.append(label, track);
      player.append(hud);
    }
    hud.firstChild.textContent = volume === 0 ? "Stumm" : `${volume} %`;
    hud.lastChild.firstChild.style.width = `${volume}%`;
    hud.style.opacity = "1";
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.style.opacity = "0"; }, 900);
  }

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
    showVolume(player, next);
  }, { capture: true, passive: false });
})();
