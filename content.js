(() => {
  "use strict";
  const CONFIG = globalThis.StylerzBridgeConfig;
  const ROOT_ID = "stylerz-bridge-prototype";
  const ACTIVE_ATTRIBUTE = "data-stream-bridge-active";
  const PREVIEW_SELECTOR = ".picture-by-picture-player";
  const RELOAD_MESSAGE = "Erweiterung bitte neu laden und Twitch aktualisieren.";
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
  let checkedLinks = "";
  let channel = null;
  let pageStyle = null;
  let autoSwitch = false;
  let settingsRevision = 0;
  let subscription = { state: "unknown" };
  let subscriptionPending = null;
  let subscriptionTimer = null;
  const mutedVideos = new Map();

  function isChannel() {
    return Boolean(CONFIG.channelForUrl(location.href));
  }

  function extensionRuntime() {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.id || typeof runtime.sendMessage !== "function") throw new Error(RELOAD_MESSAGE);
    return runtime;
  }

  async function send(type, fields = {}) {
    let reply;
    try {
      reply = await extensionRuntime().sendMessage({ type, twitchLogin: channel?.twitchLogin, ...fields });
    } catch (error) {
      // Reloading/updating the extension invalidates scripts in already-open
      // tabs. They cannot reconnect themselves; the Twitch page must reload.
      if (!globalThis.chrome?.runtime?.id || /Extension context invalidated|Receiving end does not exist|Could not establish connection/i.test(error.message)) {
        throw new Error(RELOAD_MESSAGE);
      }
      throw error;
    }
    if (!reply?.ok) throw new Error(reply?.error || RELOAD_MESSAGE);
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
    shadow.getElementById("watch").disabled = subscription.state !== "not-subscribed" || !stream || checking || switching || active;
    shadow.getElementById("back").hidden = !active;
    shadow.getElementById("watch").hidden = active;
    shadow.getElementById("check").hidden = active;
    shadow.getElementById("menu").hidden = !active;
    shadow.getElementById("close-menu").hidden = !active;
  }

  function subscriptionStatus() {
    if (!shadow) return;
    const messages = {
      subscribed: "Aktives Kanal-Abo erkannt. Twitch bleibt aktiv; der Stream wird nicht ersetzt.",
      "not-subscribed": "Kein aktives Kanal-Abo erkannt. Der Wechsel zu YouTube ist verfügbar.",
      unknown: "Abo-Status noch unklar. Neue Wechsel bleiben bis zur Bestätigung gesperrt.",
    };
    const label = shadow.getElementById("subscription-status");
    if (label.textContent !== messages[subscription.state]) label.textContent = messages[subscription.state];
    syncButtons();
  }

  function refreshSubscription() {
    if (subscriptionPending) return subscriptionPending;
    const token = generation;
    const request = (async () => {
      let result;
      try { result = await send("SUBSCRIPTION"); }
      catch (error) { result = { state: "unknown", error: error.message }; }
      if (token !== generation || !isChannel()) return { state: "unknown" };
      subscription = result;
      subscriptionStatus();
      return result;
    })();
    subscriptionPending = request;
    void request.finally(() => {
      if (subscriptionPending === request) subscriptionPending = null;
    });
    return request;
  }

  async function pollSubscription() {
    if (!root || document.hidden) return;
    const token = generation;
    const previous = subscription.state;
    const result = await refreshSubscription();
    if (token !== generation) return;
    if (result.state === "subscribed" && active && !switching) { void back(false); return; }
    if (result.state === "subscribed") stream = null;
    if (result.state === "not-subscribed" && previous !== result.state && !stream) void check(false);
    syncButtons();
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
    checkedLinks = "";
    stream = null;
    subscription = { state: "unknown" };
    subscriptionPending = null;
    clearInterval(subscriptionTimer);
    subscriptionTimer = null;
    root?.remove();
    root = null;
    shadow = null;
    pageStyle?.remove();
    pageStyle = null;
    restoreNativeVideos();
    releaseMount();
  }

  function youtubeLinks() {
    return globalThis.StreamBridgeDiscovery.collect(document, channel);
  }

  function showResult(result) {
    stream = result.state === "live" ? result : null;
    const direct = shadow.getElementById("direct");
    direct.removeAttribute("href");
    if (result.youtubeStreams) direct.href = result.youtubeStreams;
    else if (channel.youtubeStreams) direct.href = channel.youtubeStreams;
    if (stream) {
      direct.href = `https://www.youtube.com/watch?v=${result.videoId}`;
      status(`Live auf YouTube: ${result.title}`);
    } else if (result.state === "unlinked") {
      status("Kein YouTube-Kanallink im geladenen Twitch-Profil gefunden. Öffne den Info-Bereich des Kanals. Neue Profillinks werden automatisch geprüft.");
    } else if (result.state === "ambiguous") {
      status("Mehrere verlinkte YouTube-Kanäle sind live. Bitte direkt im Twitch-Profil auswählen. Twitch läuft weiter.");
    } else status(`Aktuell kein öffentlicher ${channel.displayName}-Livestream auf YouTube gefunden. Twitch läuft weiter.`);
  }

  function maybeAutoSwitch() {
    if (autoSwitch && stream && !stream.autoSwitchSuppressed && !checking) void watch(true);
  }

  async function check(force = true) {
    if (checking || active || switching || !shadow) return;
    const token = generation;
    checking = true;
    stream = null;
    const links = youtubeLinks();
    checkedLinks = JSON.stringify(links);
    const direct = shadow.getElementById("direct");
    direct.removeAttribute("href");
    if (channel.youtubeStreams) direct.href = channel.youtubeStreams;
    status(`Suche den aktuellen ${channel.displayName}-Livestream …`);
    syncButtons();
    try {
      const viewer = await refreshSubscription();
      if (token !== generation || !isChannel()) return;
      if (viewer.state !== "not-subscribed") {
        status(viewer.error || (viewer.state === "subscribed" ? "Twitch läuft mit deinem Kanal-Abo weiter." : "Der Abo-Status konnte noch nicht bestätigt werden. Bitte erneut prüfen."));
        return;
      }
      const result = await send("LOOKUP", { force, youtubeLinks: links });
      if (token !== generation || !isChannel()) return;
      if (checkedLinks !== JSON.stringify(youtubeLinks())) return;
      showResult(result);
    } catch (error) {
      if (token === generation) status(error.message);
    } finally {
      if (token === generation) {
        checking = false; syncButtons();
        if (checkedLinks !== JSON.stringify(youtubeLinks())) schedule();
        else maybeAutoSwitch();
      }
    }
  }

  async function watch(automatic = false) {
    if (subscription.state !== "not-subscribed" || !stream || active || switching || !mount) return;
    if (automatic && !autoSwitch) return;
    const token = generation;
    switching = true;
    syncButtons();
    status("Wechsle zu YouTube …");
    try {
      const viewer = await refreshSubscription();
      if (token !== generation || !isChannel()) return;
      if (viewer.state !== "not-subscribed") {
        stream = null;
        status(viewer.error || "Twitch bleibt aktiv. Ein Wechsel ist nur ohne bestätigtes Kanal-Abo möglich.");
        return;
      }
      // The channel tab may have stayed open since a previous broadcast.
      // Recheck before suspending Twitch so an old result cannot open a VOD.
      const links = youtubeLinks();
      const selected = await send("LOOKUP", { force: true, youtubeLinks: links });
      if (token !== generation || !isChannel()) return;
      if (JSON.stringify(links) !== JSON.stringify(youtubeLinks())) {
        stream = null;
        shadow.getElementById("direct").removeAttribute("href");
        status("Die YouTube-Profillinks haben sich geändert. Bitte erneut prüfen.");
        return;
      }
      if (automatic && (!autoSwitch || selected.autoSwitchSuppressed)) {
        showResult(selected);
        return;
      }
      if (selected.state !== "live") {
        showResult(selected);
        return;
      }
      stream = selected;
      shadow.getElementById("direct").href = `https://www.youtube.com/watch?v=${selected.videoId}`;
      const suspension = await send("SUSPEND", { automatic });
      if (token !== generation || !isChannel()) {
        // teardown already queues cleanup; a late extra RESUME could clear a
        // newer activation after navigation to another supported streamer.
        return;
      }
      if (suspension.state !== "suspended") {
        showResult(selected);
        return;
      }
      if (automatic && !autoSwitch) {
        await send("RESUME");
        if (token === generation) showResult(selected);
        return;
      }
      // A periodic check can finish while the background guard is running.
      if (subscription.state !== "not-subscribed") {
        await send("RESUME");
        if (token !== generation || !isChannel()) return;
        location.reload();
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
      if (token === generation) {
        switching = false; syncButtons();
        if (!active && checkedLinks !== JSON.stringify(youtubeLinks())) schedule();
      }
    }
  }

  async function back(keepTwitch = true) {
    if (!active || switching) return;
    const token = generation;
    switching = true;
    syncButtons();
    status("Stelle Twitch wieder her …");
    try {
      await send("RESUME", { keepTwitch });
      if (token !== generation || !isChannel()) return;
      // A blocked live player may retain an error. Reload gives Twitch a clean player.
      location.reload();
    } catch (error) {
      if (token !== generation) return;
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
        :host { --ground:#18181b; --raised:#26262c; --raised-hover:#323239; --ink:#efeff1; --muted:#b4b4bd;
          --edge:#3a3a42; --live:#ff4e45; --wait:#f5c451;
          font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); }
        * { box-sizing:border-box; }
        [hidden] { display:none !important; }
        .bridge { position:absolute; inset:0; pointer-events:none; container-type:size; }
        .panel { position:absolute; top:10px; left:10px; pointer-events:auto; margin:0; padding:10px 12px 12px;
          width:min(360px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; overscroll-behavior:contain;
          background:#18181bf2; border-radius:8px; box-shadow:0 6px 24px #0008; }
        .heading { display:flex; align-items:center; gap:8px; min-height:28px; }
        .dot { flex:none; width:8px; height:8px; border-radius:50%; background:var(--muted); }
        .bridge:has(#check:disabled):not(:has(#back:not([hidden]))) .dot { background:var(--wait); animation:pulse 1.2s ease-in-out infinite; }
        .bridge:has(#watch:not(:disabled)) .dot, :host([data-active]) .dot { background:var(--live); animation:none; }
        .title { min-width:0; flex:1; display:flex; flex-direction:column; line-height:1.2; }
        #channel-name { font-size:14px; font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sub { color:var(--muted); font-size:11.5px; }
        .live-badge { display:none; flex:none; padding:1px 6px; border-radius:3px; background:var(--live); color:#fff; font-size:11px; font-weight:700; }
        .bridge:has(#watch:not(:disabled)) .live-badge { display:inline-block; }
        .bridge:has(#watch:not(:disabled)) .dot { display:none; }
        .icon-btn { flex:none; display:grid; place-items:center; width:28px; height:28px; min-height:0; padding:0; border-radius:4px;
          background:transparent; color:var(--muted); font-size:18px; line-height:1; }
        .icon-btn:hover:not(:disabled) { background:var(--raised); color:var(--ink); }
        #collapse svg { width:14px; height:14px; transition:transform .15s ease; }
        :host([data-collapsed]) #collapse svg { transform:rotate(-90deg); }
        :host([data-active]) #collapse { display:none; }
        .body { margin-top:8px; }
        :host([data-collapsed]:not([data-active])) .body { display:none; }
        :host([data-collapsed]:not([data-active])) .panel { width:auto; max-width:calc(100% - 20px); padding:4px 4px 4px 10px; background:#18181bd9; }
        p { margin:0; } #status { overflow-wrap:anywhere; }
        .actions { display:flex; flex-wrap:wrap; gap:6px 8px; margin-top:10px; align-items:center; }
        button,a { font:inherit; }
        button { cursor:pointer; border:0; border-radius:4px; padding:6px 11px; min-height:32px; color:var(--ink); background:var(--raised);
          transition:background-color .12s ease, opacity .12s ease; }
        button:hover:not(:disabled) { background:var(--raised-hover); }
        button:active:not(:disabled) { transform:translateY(1px); }
        #watch { background:var(--ink); color:#0e0e10; font-weight:650; }
        #watch:hover:not(:disabled) { background:#fff; }
        #watch:disabled { background:var(--raised); color:var(--muted); }
        button:disabled { opacity:.55; cursor:default; }
        a { color:var(--ink); text-decoration:underline; text-decoration-color:#efeff166; text-underline-offset:3px; }
        a:hover { text-decoration-color:currentColor; }
        #direct { margin-left:auto; padding:6px 2px; white-space:nowrap; }
        #direct:not([href]) { display:none; }
        button:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid #fff; outline-offset:2px; }
        details { margin-top:10px; padding-top:8px; border-top:1px solid var(--edge); color:var(--muted); }
        summary { cursor:pointer; width:max-content; max-width:100%; }
        summary:hover { color:var(--ink); }
        details p { margin:6px 0 0; } .small { font-size:12px; }
        #screen { position:absolute; inset:0; pointer-events:auto; background:#000; }
        iframe { display:block; border:0; width:100%; height:100%; }
        #menu { position:absolute; top:10px; right:10px; z-index:2; pointer-events:auto;
          width:36px; height:30px; min-height:0; padding:0; font-size:22px; line-height:1; border-radius:4px;
          background:#18181bcc; opacity:.45; transition:opacity .15s ease; }
        #menu:hover, #menu:focus-visible, :host([data-menu-open]) #menu { opacity:1; }
        .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
        :host([data-active]) .bridge { background:#0e0e10; pointer-events:auto; }
        :host([data-active]) .panel { display:none; left:auto; right:10px; top:48px; z-index:3;
          max-height:calc(100% - 60px); background:#18181bfa; }
        :host([data-active][data-menu-open]) .panel { display:block; }
        @container (max-width:480px) {
          .panel { top:6px; left:6px; width:calc(100% - 12px); }
          :host([data-active]) .panel { right:6px; width:calc(100% - 12px); }
          #direct { margin-left:0; }
        }
        @container (max-height:260px) { :host(:not([data-active])) details { display:none; } }
        @keyframes pulse { 50% { opacity:.35; } }
        @media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }
      </style>
      <section class="bridge" aria-label="Stream Bridge">
        <div id="screen" hidden></div>
        <div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
        <button id="menu" type="button" aria-label="Stream-Bridge-Menü öffnen" title="Stream-Bridge-Menü" aria-controls="bridge-panel" aria-expanded="false" hidden>⋯</button>
        <div class="panel" id="bridge-panel">
          <div class="heading">
            <span class="dot" aria-hidden="true"></span>
            <span class="title"><strong id="channel-name">Stream Bridge</strong><span class="sub">Stream Bridge · Prototyp</span></span>
            <span class="live-badge" aria-hidden="true">Live</span>
            <button id="collapse" class="icon-btn" type="button" aria-label="Stream Bridge einklappen" aria-expanded="true" aria-controls="bridge-body" title="Einklappen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button id="close-menu" class="icon-btn" type="button" aria-label="Menü schließen" title="Schließen" hidden>×</button>
          </div>
          <div class="body" id="bridge-body">
            <p id="status">YouTube-Livestream prüfen …</p>
            <p id="subscription-status" class="small" role="status" aria-live="polite"></p>
            <div class="actions">
              <button id="watch" type="button" disabled>YouTube ansehen</button>
              <button id="check" type="button">Erneut prüfen</button>
              <button id="back" type="button" hidden>Zurück zu Twitch ↻</button>
              <a id="direct" target="_blank" rel="noopener">Auf YouTube öffnen ↗</a>
            </div>
            <details>
              <summary>YouTube-Konto &amp; Premium</summary>
              <p>Nutzt deine YouTube-Anmeldung in diesem Browserprofil. Ob Premium greift, prüft das Add-on nicht.</p>
              <p>Falls Werbung erscheint: YouTube-Cookies auf twitch.tv zulassen und Twitch neu laden. <a href="https://www.youtube.com/" target="_blank" rel="noopener">YouTube öffnen ↗</a></p>
              <p class="small">„Zurück zu Twitch“ lädt die Seite neu. Zeitanpassung folgt später.</p>
            </details>
          </div>
        </div>
      </section>`;
    shadow.getElementById("channel-name").textContent = channel.displayName;
    // youtubeStreams stays unset until discovery; #direct is hidden without an href.
    if (channel.youtubeStreams) shadow.getElementById("direct").href = channel.youtubeStreams;
    const collapse = shadow.getElementById("collapse");
    collapse.addEventListener("click", () => {
      const collapsed = !root.hasAttribute("data-collapsed");
      root.toggleAttribute("data-collapsed", collapsed);
      collapse.setAttribute("aria-expanded", String(!collapsed));
      collapse.setAttribute("aria-label", collapsed ? "Stream Bridge ausklappen" : "Stream Bridge einklappen");
      collapse.title = collapsed ? "Ausklappen" : "Einklappen";
    });
    subscriptionStatus();
    subscriptionTimer = setInterval(() => { void pollSubscription(); }, 5_000);
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
    if (root?.isConnected && mount?.isConnected) {
      stopNativeVideos();
      if (!checking && !active && !switching && checkedLinks !== JSON.stringify(youtubeLinks())) void check(false);
      return;
    }
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
    if (!active && !channel.channelId) schedule();
    if (!root?.isConnected || !mount?.isConnected ||
        (active && records.some((record) => mount.contains(record.target) ||
          record.target instanceof Element && record.target.closest(PREVIEW_SELECTOR) ||
          [...record.addedNodes].some((node) => node instanceof Element && (node.matches(PREVIEW_SELECTOR) || node.querySelector(PREVIEW_SELECTOR)))))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
  document.addEventListener("play", (event) => {
    if (active && event.target instanceof HTMLMediaElement &&
        (mount?.contains(event.target) || event.target.closest(PREVIEW_SELECTOR))) silence(event.target);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (active && root?.hasAttribute("data-menu-open") && !event.composedPath().includes(root)) setMenuOpen(false);
  });
  window.navigation?.addEventListener("navigatesuccess", routeChanged);
  try {
    const runtime = extensionRuntime();
    runtime.onMessage.addListener((message, sender) => {
      if (sender.id === runtime.id && message?.type === "ROUTE_CHANGED") routeChanged();
    });
  } catch {
    // Continue mounting the UI so the initial check can show reload guidance.
  }
  window.addEventListener("popstate", routeChanged);
  window.addEventListener("pagehide", teardown);
  window.addEventListener("pageshow", schedule);
  // Subscribe before reading so a popup change cannot be overwritten by an
  // older initial read. Failure leaves the manual controls available.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.autoSwitchToYouTube) return;
      settingsRevision += 1;
      autoSwitch = changes.autoSwitchToYouTube.newValue === true;
      if (autoSwitch && stream) stream.autoSwitchSuppressed = false;
      maybeAutoSwitch();
    });
    const revision = settingsRevision;
    void chrome.storage.local.get({ autoSwitchToYouTube: false }).then((settings) => {
      if (revision !== settingsRevision) return;
      autoSwitch = settings.autoSwitchToYouTube === true;
      maybeAutoSwitch();
    }).catch(() => {});
  } catch {
    // Extension updates may invalidate storage alongside the runtime.
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pollSubscription(); });
  routeChanged();
})();
