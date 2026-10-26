(() => {
  "use strict";
  const CONFIG = globalThis.StylerzBridgeConfig;
  const ROOT_ID = "stylerz-bridge-prototype";
  const ACTIVE_ATTRIBUTE = "data-stream-bridge-active";
  const PREVIEW_SELECTOR = ".picture-by-picture-player";
  if (window.top !== window || document.getElementById(ROOT_ID)) return;

  let root = null;
  let shadow = null;
  let mount = null;
  let mountPosition = null;
  let active = false;
  let switching = false;
  let checking = false;
  let stream = null;
  let generation = 0;
  let route = "";
  let scheduled = false;
  let firstCheck = false;
  let channel = null;
  let pageStyle = null;
  const mutedVideos = new Map();

  function isChannel() {
    return Boolean(CONFIG.channelForUrl(location.href));
  }

  async function send(type, fields = {}) {
    const reply = await chrome.runtime.sendMessage({ type, twitchLogin: channel?.twitchLogin, ...fields });
    if (!reply?.ok) throw new Error(reply?.error || "Erweiterung bitte neu laden und Twitch aktualisieren.");
    return reply.result;
  }

  function status(message) {
    if (shadow) {
      shadow.getElementById("status").textContent = message;
      shadow.getElementById("announcement").textContent = message;
    }
  }

  function setMenuOpen(open, focusTrigger = false) {
    root?.toggleAttribute("data-menu-open", open);
    const trigger = shadow?.getElementById("menu");
    if (trigger) {
      trigger.setAttribute("aria-expanded", String(open));
      trigger.setAttribute("aria-label", open ? "Stream-Bridge-Menü schließen" : "Stream-Bridge-Menü öffnen");
      if (focusTrigger) trigger.focus();
    }
  }

  function setActiveLayout(enabled) {
    root?.toggleAttribute("data-active", enabled);
    document.documentElement.toggleAttribute(ACTIVE_ATTRIBUTE, enabled);
    if (!enabled) root?.removeAttribute("data-menu-open");
  }

  function syncButtons() {
    if (!shadow) return;
    shadow.getElementById("check").disabled = checking || switching || active;
    shadow.getElementById("watch").disabled = !stream || checking || switching || active;
    shadow.getElementById("back").hidden = !active;
    shadow.getElementById("watch").hidden = active;
    shadow.getElementById("check").hidden = active;
    shadow.getElementById("menu").hidden = !active;
    shadow.getElementById("close-menu").hidden = !active;
  }

  function silence(video) {
    if (!mutedVideos.has(video)) mutedVideos.set(video, video.muted);
    video.muted = true;
    video.pause();
  }

  function stopNativeVideos() {
    if (!active) return;
    mount?.querySelectorAll("video, audio").forEach(silence);
    document.querySelectorAll(`${PREVIEW_SELECTOR} video, ${PREVIEW_SELECTOR} audio`).forEach(silence);
  }

  function restoreNativeVideos() {
    for (const [video, muted] of mutedVideos) video.muted = muted;
    mutedVideos.clear();
  }

  function releaseMount() {
    if (mount && mountPosition && mount.style.position === "relative") {
      if (mountPosition.value) mount.style.setProperty("position", mountPosition.value, mountPosition.priority);
      else mount.style.removeProperty("position");
    }
    mountPosition = null;
    mount = null;
  }

  function teardown() {
    generation += 1;
    if (active || switching) void send("RESUME").catch(() => {});
    setActiveLayout(false);
    active = false;
    switching = false;
    checking = false;
    firstCheck = false;
    stream = null;
    root?.remove();
    root = null;
    shadow = null;
    pageStyle?.remove();
    pageStyle = null;
    restoreNativeVideos();
    releaseMount();
  }

  async function check(force = true) {
    if (checking || active || switching || !shadow) return;
    const token = generation;
    checking = true;
    stream = null;
    status(`Suche den aktuellen ${channel.displayName}-Livestream …`);
    syncButtons();
    try {
      const result = await send("LOOKUP", { force });
      if (token !== generation || !isChannel()) return;
      if (result.state === "live") {
        stream = result;
        shadow.getElementById("direct").href = `https://www.youtube.com/watch?v=${result.videoId}`;
        status(`Live auf YouTube: ${result.title}`);
      } else status(`Aktuell kein öffentlicher ${channel.displayName}-Livestream auf YouTube gefunden. Twitch läuft weiter.`);
    } catch (error) {
      if (token === generation) status(error.message);
    } finally {
      if (token === generation) { checking = false; syncButtons(); }
    }
  }

  async function watch() {
    if (!stream || active || switching || !mount) return;
    const token = generation;
    switching = true;
    syncButtons();
    status("Wechsle zu YouTube …");
    try {
      // The channel tab may have stayed open since a previous broadcast.
      // Recheck before suspending Twitch so an old result cannot open a VOD.
      const selected = await send("LOOKUP", { force: true });
      if (token !== generation || !isChannel()) return;
      if (selected.state !== "live") {
        stream = null;
        status("Der YouTube-Livestream ist inzwischen beendet. Twitch läuft weiter.");
        return;
      }
      stream = selected;
      shadow.getElementById("direct").href = `https://www.youtube.com/watch?v=${selected.videoId}`;
      await send("SUSPEND");
      if (token !== generation || !isChannel()) {
        // teardown already queues cleanup; a late extra RESUME could clear a
        // newer activation after navigation to another supported streamer.
        return;
      }
      active = true;
      setActiveLayout(true);
      setMenuOpen(false);
      stopNativeVideos();
      const frame = document.createElement("iframe");
      frame.id = "youtube";
      frame.title = `${channel.displayName} – YouTube-Livestream`;
      // youtube.com intentionally shares the browser's regular YouTube session.
      // Do not use youtube-nocookie.com or a credentialless/sandboxed iframe.
      const url = new URL(`https://www.youtube.com/embed/${selected.videoId}`);
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("origin", location.origin);
      frame.src = url.href;
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.addEventListener("load", () => {
        if (active && frame.isConnected) status("YouTube-Player geöffnet. Falls nötig im Player auf Play klicken.");
      });
      shadow.getElementById("screen").replaceChildren(frame);
      shadow.getElementById("screen").hidden = false;
      status("YouTube wird geladen. Premium hängt von deiner YouTube-Anmeldung und den Cookie-Einstellungen ab.");
    } catch (error) {
      if (token === generation) {
        active = false;
        setActiveLayout(false);
        restoreNativeVideos();
        void send("RESUME").catch(() => {});
        status(error.message);
      }
    } finally {
      if (token === generation) { switching = false; syncButtons(); }
    }
  }

  async function back() {
    if (!active || switching) return;
    switching = true;
    syncButtons();
    status("Stelle Twitch wieder her …");
    try {
      await send("RESUME");
      // A blocked live player may retain an error. Reload gives Twitch a clean player.
      location.reload();
    } catch (error) {
      switching = false;
      status(`${error.message} Bitte Twitch neu laden oder die Erweiterung deaktivieren.`);
      syncButtons();
    }
  }

  function createUI() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.cssText = "position:absolute;inset:0;z-index:1000;pointer-events:none;";
    // Twitch's picture-by-picture ad preview is a sibling above the chat, not
    // inside the main player. Scope the CSS to our active replacement only;
    // leaving YouTube restores Twitch's own collapsed/expanded state.
    pageStyle = document.createElement("style");
    pageStyle.textContent = `
      html[${ACTIVE_ATTRIBUTE}] ${PREVIEW_SELECTOR} { display:none !important; }
      html[${ACTIVE_ATTRIBUTE}] .right-column__toggle-visibility--with-chat-video-player {
        top:calc((40px - var(--border-width-default, 1px) - var(--button-size-default, 30px))/2) !important;
      }
      html[${ACTIVE_ATTRIBUTE}] .right-column__toggle-visibility--with-chat-video-player-and-turbo-ads-upsell { top:6rem !important; }
      html[${ACTIVE_ATTRIBUTE}] .right-column--collapsed .right-column__toggle-visibility--with-chat-video-player { top:1.5rem !important; }
    `;
    document.head.append(pageStyle);
    shadow = root.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { font: 13px/1.45 system-ui,sans-serif; color: #f4f1fa; }
        * { box-sizing: border-box; }
        [hidden] { display: none !important; }
        .bridge { position:absolute; inset:0; pointer-events:none; }
        .panel { position:absolute; top:12px; left:12px; pointer-events:auto; margin:0; padding:14px; width:min(440px,calc(100% - 24px));
          background:#19171fee; border:1px solid #6b5b82; border-radius:12px; box-shadow:0 4px 24px #0005;
          max-height:calc(100% - 24px); overflow:auto; }
        .heading { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
        #close-menu { margin-left:auto; padding:2px 7px; font-size:18px; }
        strong { font-size:14px; } .tag { color:#d9c3ff; font-size:11px; border:1px solid #62516f; border-radius:4px; padding:1px 5px; }
        p { margin:6px 0; } #status { overflow-wrap:anywhere; }
        .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; align-items:center; }
        button,a { font:inherit; } button { cursor:pointer; border:1px solid #6b5b82; border-radius:7px; padding:7px 10px; color:inherit; background:#302b3a; }
        #watch { background:#7041bb; border-color:#b396e1; font-weight:650; }
        button:disabled { opacity:.5; cursor:default; } a { color:#dec7ff; text-decoration:underline; }
        button:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid #fff; outline-offset:3px; }
        details { margin-top:9px; color:#ddd4e7; } summary { cursor:pointer; }
        details p { margin:8px 0 0; } .small { font-size:12px; color:#c7bdcf; }
        #screen { position:absolute; inset:0; pointer-events:auto; background:#000; }
        iframe { display:block; border:0; width:100%; height:100%; }
        #menu { position:absolute; top:10px; right:10px; z-index:2; pointer-events:auto;
          width:36px; height:30px; padding:0; font-size:22px; line-height:1; border-radius:8px;
          background:#19171fcc; opacity:.45; }
        #menu:hover, #menu:focus-visible, :host([data-menu-open]) #menu { opacity:1; }
        .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
        :host([data-active]) .bridge { background:#0e0b12; pointer-events:auto; }
        :host([data-active]) .panel { display:none; left:auto; right:10px; top:48px; z-index:3;
          max-height:calc(100% - 60px); width:min(440px,calc(100% - 20px)); background:#19171ff5; }
        :host([data-active][data-menu-open]) .panel { display:block; }
        @media (max-width:600px) { .panel { top:6px; left:6px; width:calc(100% - 12px); padding:10px; } }
      </style>
      <section class="bridge" aria-label="Stream Bridge">
        <div id="screen" hidden></div>
        <div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
        <button id="menu" type="button" aria-label="Stream-Bridge-Menü öffnen" title="Stream-Bridge-Menü" aria-controls="bridge-panel" aria-expanded="false" hidden>⋯</button>
        <div class="panel" id="bridge-panel">
          <div class="heading"><strong id="channel-name">Stream Bridge</strong><span class="tag">PROTOTYP</span><button id="close-menu" type="button" aria-label="Menü schließen" hidden>×</button></div>
          <p id="status">YouTube-Livestream prüfen …</p>
          <div class="actions">
            <button id="watch" type="button" disabled>YouTube ansehen</button>
            <button id="check" type="button">Erneut prüfen</button>
            <button id="back" type="button" hidden>Zurück zu Twitch ↻</button>
            <a id="direct" href="https://www.youtube.com/@STYLERZlive/streams" target="_blank" rel="noopener">Auf YouTube öffnen ↗</a>
          </div>
          <details>
            <summary>YouTube-Konto &amp; Premium</summary>
            <p>Verwendet deine normale YouTube-Anmeldung in diesem Browserprofil. Premium wird vom Add-on nicht automatisch bestätigt.</p>
            <p><a href="https://www.youtube.com/" target="_blank" rel="noopener">YouTube öffnen und Premium-Konto prüfen ↗</a></p>
            <p>Falls hier Werbung erscheint: YouTube-Cookies auf Twitch zulassen, dann Twitch neu laden. Die Freigabe nur für diese Seite setzen.</p>
            <p class="small">„Auf YouTube öffnen“ nutzt YouTube direkt als Alternative. „Zurück zu Twitch“ lädt die Twitch-Seite neu. Zeitanpassung folgt später.</p>
          </details>
        </div>
      </section>`;
    shadow.getElementById("channel-name").textContent = `${channel.displayName} · Stream Bridge`;
    shadow.getElementById("direct").href = channel.youtubeStreams;
    shadow.getElementById("menu").addEventListener("click", () => {
      setMenuOpen(!root.hasAttribute("data-menu-open"));
    });
    shadow.getElementById("close-menu").addEventListener("click", () => { setMenuOpen(false, true); });
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && active && root.hasAttribute("data-menu-open")) {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false, true);
      }
    });
    // Keep our controls from toggling the native Twitch player behind them.
    shadow.addEventListener("click", (event) => { event.stopPropagation(); });
    shadow.addEventListener("pointerdown", (event) => { event.stopPropagation(); });
    shadow.getElementById("check").addEventListener("click", () => { void check(); });
    shadow.getElementById("watch").addEventListener("click", () => { void watch(); });
    shadow.getElementById("back").addEventListener("click", () => { void back(); });
    shadow.getElementById("direct").addEventListener("click", () => {
      if (!active) return;
      // Avoid simultaneous embedded and first-party YouTube playback.
      shadow.getElementById("screen").replaceChildren();
      shadow.getElementById("screen").hidden = true;
      setMenuOpen(true);
      status("Stream auf YouTube geöffnet. Twitch-Video bleibt angehalten; der Twitch-Chat bleibt hier verfügbar.");
    });
  }

  function reconcile() {
    scheduled = false;
    if (!isChannel()) { if (root) teardown(); return; }
    if (root?.isConnected && mount?.isConnected) { stopNativeVideos(); return; }
    const player = document.querySelector('.channel-root__player, [data-a-target="video-player"], .video-player');
    if (!player) return;
    if (!root) createUI();
    releaseMount();
    mount = player;
    if (getComputedStyle(mount).position === "static") {
      mountPosition = { value: mount.style.getPropertyValue("position"), priority: mount.style.getPropertyPriority("position") };
      mount.style.setProperty("position", "relative");
    }
    mount.append(root);
    stopNativeVideos();
    if (!firstCheck) { firstCheck = true; void check(false); }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(reconcile, 100);
  }

  function routeChanged() {
    if (route !== location.pathname) {
      const next = CONFIG.channelForUrl(location.href);
      route = location.pathname;
      if (channel?.twitchLogin !== next?.twitchLogin) {
        teardown();
        channel = next;
      }
      schedule();
    }
  }

  const observer = new MutationObserver((records) => {
    routeChanged();
    if (!isChannel()) return;
    if (!root?.isConnected || !mount?.isConnected ||
        (active && records.some((record) => mount.contains(record.target) ||
          record.target instanceof Element && record.target.closest(PREVIEW_SELECTOR) ||
          [...record.addedNodes].some((node) => node instanceof Element && (node.matches(PREVIEW_SELECTOR) || node.querySelector(PREVIEW_SELECTOR)))))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("play", (event) => {
    if (active && event.target instanceof HTMLMediaElement &&
        (mount?.contains(event.target) || event.target.closest(PREVIEW_SELECTOR))) silence(event.target);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (active && root?.hasAttribute("data-menu-open") && !event.composedPath().includes(root)) setMenuOpen(false);
  });
  window.navigation?.addEventListener("navigatesuccess", routeChanged);
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message?.type === "ROUTE_CHANGED") routeChanged();
  });
  window.addEventListener("popstate", routeChanged);
  window.addEventListener("pagehide", teardown);
  window.addEventListener("pageshow", schedule);
  routeChanged();
})();
