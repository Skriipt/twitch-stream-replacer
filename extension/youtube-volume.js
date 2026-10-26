(() => {
  "use strict";
  // Wheel events never bubble out of a cross-origin iframe. Listen inside only
  // the player created by Stream Bridge, leaving other YouTube embeds alone.
  if (window.top === window || window.name !== "stream-bridge-youtube" ||
      location.ancestorOrigins[0] !== "https://www.twitch.tv") return;

  document.addEventListener("wheel", (event) => {
    if (!event.deltaY || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const video = document.querySelector("video");
    if (!video) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const current = video.muted ? 0 : Math.round(video.volume * 100);
    const next = Math.max(0, Math.min(100, current + (event.deltaY < 0 ? 1 : -1)));
    video.volume = next / 100;
    video.muted = next === 0;
  }, { capture: true, passive: false });
})();
