import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { CHANNEL, SECOND_CHANNEL, VIDEO, SECOND_VIDEO, listing, player, pageJson, profileUrl, subscriptionScript } from "../fixtures.js";

const extensionPath = fileURLToPath(new URL("../../extension/", import.meta.url));
let context;
let worker;
const root = "#stylerz-bridge-prototype";
const pages = new Set();
const errors = [];
const embedFixture = `<!doctype html><html><head><style>
  body{margin:0;background:black;color:white}video{display:block;width:100vw;height:100vh}
  button{position:absolute;right:10px;width:36px;height:30px}#settings{top:10px}#fullscreen{bottom:10px}
</style></head><body><div id="movie_player"><video></video><button id="settings" aria-label="Settings">⚙</button>
<button id="fullscreen" aria-label="Fullscreen">⛶</button>
<button id="mute" aria-label="Mute" aria-pressed="false" style="left:10px;right:auto;bottom:10px">Mute</button>
<input id="volume" aria-label="Volume" type="range" min="0" max="100" value="50" style="position:absolute;left:60px;bottom:10px">
</div><script>
  // Model YouTube's player state separately from the underlying media element.
  // Reconciliation must not undo changes made through the player controls.
  const player = document.querySelector('#movie_player');
  let volume = 50;
  let muted = false;
  window.reconcilePlayerState = () => {
    const video = player.querySelector('video');
    video.volume = volume / 100;
    video.muted = muted;
    document.querySelector('#volume').value = volume;
    document.querySelector('#mute').setAttribute('aria-pressed', String(muted));
  };
  player.getVolume = () => volume;
  player.isMuted = () => muted;
  player.setVolume = (next) => { volume = next; window.reconcilePlayerState(); };
  player.mute = () => { muted = true; window.reconcilePlayerState(); };
  // Observed in the live embed: unMute raises low volumes to at least 5%.
  player.unMute = () => { muted = false; volume = Math.max(5, volume); window.reconcilePlayerState(); };
  document.querySelector('#mute').onclick = () => { muted ? player.unMute() : player.mute(); };
  document.querySelector('#volume').oninput = (event) => { player.setVolume(Number(event.target.value)); player.unMute(); };
  window.reconcilePlayerState();
  document.querySelector('#settings').onclick = () => { document.body.dataset.settingsClicked = 'true'; };
</script></body></html>`;
function fixture(login) {
  return `<!doctype html><html lang="de"><meta charset="utf-8"><style>
    body{margin:0;background:#0e0e10;color:#efeff1;font:14px system-ui}main{display:flex;gap:12px}
    .channel-root__player{width:960px;height:540px;background:#222;flex:none}video{width:100%;height:100%}
    .chat-room{width:280px}.picture-by-picture-player{height:180px;background:#333}
    .about-section{padding:16px}textarea{width:260px;height:80px}</style>
    <main><div class="channel-root__player"><video></video></div><aside class="chat-room">
    <div class="picture-by-picture-player"><video></video>Ad preview fixture</div><p>Twitch chat fixture</p><textarea aria-label="Chat"></textarea>
    <a href="https://www.youtube.com/@chat_spam" data-a-target="social-media-link">Chat spam</a></aside></main>
    <header class="home-header-sticky"><a href="/${login}"><h1>${login}</h1></a><a data-a-target="channel-home-tab-About" href="/${login}/about">Info</a></header>
    <section class="about-section"><div data-a-target="about-panel"><h3>Über ${login}</h3><div id="socials"></div></div></section>${subscriptionScript(login)}</html>`;
}
async function mockYouTube(routes) {
  await worker.evaluate((routes) => {
    globalThis.testRequests = [];
    globalThis.fetch = async (url, options) => {
      globalThis.testRequests.push({ url, credentials: options.credentials });
      const response = new Response(routes[url] || "not found", { status: routes[url] ? 200 : 404 });
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
  }, routes);
}
function routes(channel = CHANNEL, video = VIDEO, url = profileUrl) {
  return { [url]: pageJson("ytInitialData", listing(channel, [video])),
    [`https://www.youtube.com/watch?v=${video}`]: pageJson("ytInitialPlayerResponse", player(channel, video)) };
}
async function open(login = "creator") {
  const page = await context.newPage();
  pages.add(page);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`https://www.twitch.tv/${login}`);
  await expect(page.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  return page;
}
async function addLinks(page, urls = [profileUrl]) {
  await page.locator("#socials").evaluate((element, urls) => {
    element.replaceChildren(...urls.map((url) => {
      const link = document.createElement("a");
      link.href = url;
      link.dataset.aTarget = "social-media-link";
      link.textContent = "YouTube";
      return link;
    }));
  }, urls);
}
async function close(page) { pages.delete(page); await page.close(); }
async function sessionRules() { return worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules()); }
async function openPopup() {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await expect(page.getByRole("switch", { name: "Automatisch zu YouTube", exact: true })).toBeEnabled();
  return page;
}
async function setAutomatic(popup, enabled) {
  const toggle = popup.getByRole("switch", { name: "Automatisch zu YouTube", exact: true });
  await toggle.setChecked(enabled);
  await expect(toggle).toBeEnabled();
  await expect(popup.getByRole("status")).toContainText(enabled ? "Ein ·" : "Aus ·");
}

before(async () => {
  if (process.env.STREAM_BRIDGE_ARTIFACTS) await mkdir(process.env.STREAM_BRIDGE_ARTIFACTS, { recursive: true });
  context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1280, height: 800 },
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await context.route("https://www.twitch.tv/**", (route) => route.fulfill({ contentType: "text/html", body: fixture(new URL(route.request().url()).pathname.split("/")[1]) }));
  await context.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: embedFixture }));
});
after(async () => { await context?.close(); assert.deepEqual(errors, []); });

test("loaded extension discovers late profile links, switches video and preserves chat; compact UI and menu work", async () => {
  await mockYouTube(routes());
  const page = await open();
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  await expect(page.locator(`${root} #direct`)).toBeHidden();
  assert.equal((await worker.evaluate(() => testRequests)).length, 0, "chat link must not trigger any lookup");
  await addLinks(page);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} #status`)).toContainText("Creator live <test>");
  await expect(page.locator(`${root} #direct`)).toHaveAttribute("href", `https://www.youtube.com/watch?v=${VIDEO}`);
  assert.equal((await worker.evaluate(() => testRequests)).length, 2);
  await page.locator(`${root} #collapse`).click();
  await expect(page.locator(`${root} #status`)).toBeHidden();
  await page.locator(`${root} #collapse`).press("Enter");
  await expect(page.locator(`${root} #status`)).toBeVisible();
  await page.locator(`${root} #watch`).click();
  await expect(page.locator(`${root} iframe`)).toHaveAttribute("src", new RegExp(`/embed/${VIDEO}`));
  // The embed reports its first playing frame; the page records it in its timing log.
  await page.frameLocator(`${root} iframe`).locator("video").evaluate((video) => video.dispatchEvent(new Event("playing")));
  await expect.poll(async () => Object.keys(JSON.parse(await page.locator(`${root}`).evaluate((element) => element.getAttribute("data-timing")))))
    .toEqual(expect.arrayContaining(["mounted", "subscription", "lookup", "switch", "suspended", "frame", "loaded", "playing"]));
  await expect(page.locator("html")).toHaveAttribute("data-stream-bridge-active", "");
  await expect(page.locator(".picture-by-picture-player")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Chat" })).toBeVisible();
  assert.equal(await page.locator("video").first().evaluate((video) => video.muted && video.paused), true);
  assert.equal((await sessionRules()).length, 1);
  const frameBox = await page.locator(`${root} iframe`).boundingBox();
  assert.equal(frameBox.width, 960);
  assert.equal(frameBox.height, 540);
  await page.getByRole("textbox", { name: "Chat" }).hover();
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "0");
  await page.locator(`${root} iframe`).hover();
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "0.45");
  // Like YouTube's controls, the button fades after the pointer rests.
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "0", { timeout: 5_000 });
  await page.locator(`${root} iframe`).hover({ position: { x: 300, y: 200 } });
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "0.45");
  await page.getByRole("textbox", { name: "Chat" }).hover();
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "0", { timeout: 1_000 });
  await page.locator(`${root} #menu`).click();
  await expect(page.locator(`${root} #back`)).toBeVisible();
  await expect(page.locator(`${root} #subscription-status`)).toBeHidden();
  await page.getByRole("textbox", { name: "Chat" }).hover();
  await expect(page.locator(`${root} #menu`)).toHaveCSS("opacity", "1");
  await page.locator(`${root} #close-menu`).press("Escape");
  await expect(page.locator(`${root} #back`)).toBeHidden();
  await expect(page.locator(`${root} #menu`)).toBeFocused();
  await page.locator(`${root} #menu`).click();
  await page.getByRole("textbox", { name: "Chat" }).click();
  await expect(page.locator(`${root} #back`)).toBeHidden();
  // Optional artifacts stay outside the repository and contain only fixtures.
  if (process.env.STREAM_BRIDGE_ARTIFACTS) {
    await mkdir(process.env.STREAM_BRIDGE_ARTIFACTS, { recursive: true });
    await page.locator(`${root} #menu`).click();
    await page.screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/active-menu.png` });
  }
  await page.locator(`${root} #menu`).click();
  if (!(await page.locator(`${root} #back`).isVisible())) await page.locator(`${root} #menu`).click();
  await page.locator(`${root} #back`).click();
  await expect(page.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  assert.equal((await sessionRules()).length, 0);
  await expect(page.locator(".picture-by-picture-player")).toBeVisible();
  await close(page);
});

for (const destination of ["player", "preview", "replacement"]) test(`native audio inserted into ${destination} is silenced before delayed reconciliation`, async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    await expect(page.locator(`${root} iframe`)).toBeVisible();
    const state = await page.evaluate(async (destination) => {
      // Real, locally generated audio: play before attaching so no document
      // play event can hide the gap in the MutationObserver's delayed scan.
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const output = audioContext.createMediaStreamDestination();
      oscillator.connect(output);
      oscillator.start();
      await audioContext.resume();
      const audio = new Audio();
      audio.srcObject = output.stream;
      await audio.play();
      const before = { muted: audio.muted, paused: audio.paused };
      const container = document.querySelector(destination === 'preview' ? '.picture-by-picture-player' : '.channel-root__player');
      // Keep the observation within the same task as the DOM mutation, after
      // its microtask delivery, rather than waiting for the 100 ms scan.
      if (destination === 'replacement') {
        const replacement = document.createElement('div');
        replacement.className = 'channel-root__player';
        replacement.append(audio);
        container.replaceWith(replacement);
      } else container.append(audio);
      await new Promise(queueMicrotask);
      const after = { muted: audio.muted, paused: audio.paused };
      audio.pause();
      audio.remove();
      oscillator.stop();
      output.stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
      return { before, after };
    }, destination);
    assert.deepEqual(state.before, { muted: false, paused: false }, "the native source really started");
    assert.deepEqual(state.after, { muted: true, paused: true }, "an inserted native source must not leak audio for 100 ms");
  } finally { await close(page); }
});

test("late native volume updates stay muted without an event loop or affecting YouTube", async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    const frame = page.frameLocator(`${root} iframe`);
    await expect(frame.locator("video")).toHaveJSProperty("muted", false);
    const state = await page.locator(".channel-root__player > video").evaluate(async (video) => {
      let events = 0;
      video.addEventListener('volumechange', () => { events++; });
      // Let the browser dispatch real property-change events, without
      // dispatchEvent, DOM changes, or the debounced reconciliation.
      for (let i = 0; i < 10; i++) {
        const changed = new Promise((resolve) => video.addEventListener('volumechange', resolve, { once: true }));
        video.muted = false;
        video.volume = (i + 1) / 10;
        await changed;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { muted: video.muted, paused: video.paused, events };
    });
    assert.equal(state.muted, true);
    assert.equal(state.paused, true);
    assert.ok(state.events >= 20 && state.events <= 30, `bounded volumechange events: ${state.events}`);
    await expect(frame.locator("video")).toHaveJSProperty("muted", false);
    await frame.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(frame.locator("video")).toHaveJSProperty("muted", true);
    await frame.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(frame.locator("video")).toHaveJSProperty("muted", false);
  } finally { await close(page); }
});

test("collapsed panel is remembered across reloads, channels and tabs", async () => {
  await mockYouTube(routes());
  const first = await open("collapsefirst");
  try {
    await first.locator(`${root} #collapse`).click();
    await expect(first.locator(`${root} #status`)).toBeHidden();
    await first.reload();
    await expect(first.locator(`${root} #collapse`)).toHaveAttribute("aria-expanded", "false");
    await expect(first.locator(`${root} #status`)).toBeHidden();
    const second = await open("collapsesecond");
    await expect(second.locator(`${root} #status`)).toBeHidden();
    await expect(second.locator(`${root} #collapse`)).toHaveAccessibleName("Stream Bridge ausklappen");
    if (process.env.STREAM_BRIDGE_ARTIFACTS) await second.screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/collapsed-panel.png` });
    await second.locator(`${root} #collapse`).click();
    await expect(second.locator(`${root} #status`)).toBeVisible();
    await expect(first.locator(`${root} #status`)).toBeVisible();
    await expect(first.locator(`${root} #collapse`)).toHaveAttribute("aria-expanded", "true");
    await close(second);
  } finally {
    await worker.evaluate(() => chrome.storage.local.remove("panelCollapsed"));
    await close(first);
  }
});

test("bridge menu leaves native YouTube corner controls clickable at normal and small sizes", async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    const frame = page.frameLocator(`${root} iframe`);
    for (const [width, height] of [[960, 540], [400, 225], [320, 180]]) {
      await page.locator(".channel-root__player").evaluate((element, [width, height]) => {
        element.style.width = `${width}px`; element.style.height = `${height}px`;
      }, [width, height]);
      const menu = await page.locator(`${root} #menu`).boundingBox();
      const screen = await page.locator(`${root} iframe`).boundingBox();
      for (const control of ["settings", "fullscreen"]) {
        const box = await frame.locator(`#${control}`).boundingBox();
        const overlaps = menu.x < box.x + box.width && menu.x + menu.width > box.x &&
          menu.y < box.y + box.height && menu.y + menu.height > box.y;
        assert.equal(overlaps, false, `${width}×${height}: bridge menu overlaps ${control}`);
      }
      assert.ok(menu.y >= screen.y && menu.y + menu.height <= screen.y + screen.height);
      await frame.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(frame.locator("body")).toHaveAttribute("data-settings-clicked", "true");
      await page.locator(`${root} #menu`).click();
      const panel = await page.locator(`${root} .panel`).boundingBox();
      assert.ok(panel.x >= screen.x && panel.x + panel.width <= screen.x + screen.width);
      assert.ok(panel.y >= screen.y && panel.y + panel.height <= screen.y + screen.height);
      await page.locator(`${root} #close-menu`).press("Escape");
    }
  } finally { await close(page); }
});

test("wheel over the cross-origin YouTube player changes volume by 1%, clamps and mutes", async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    const video = page.frameLocator(`${root} iframe`).locator("video");
    await expect(video).toHaveJSProperty("volume", 0.5);
    await video.hover();
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 0.51);
    const hud = page.frameLocator(`${root} iframe`).locator("#stream-bridge-volume");
    await expect(hud).toHaveText("51 %");
    await expect(hud).toHaveCSS("opacity", "1");
    if (process.env.STREAM_BRIDGE_ARTIFACTS) await page.screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/volume-hud.png` });
    await expect(hud).toHaveCSS("opacity", "0");
    await page.mouse.wheel(0, 120);
    await expect(video).toHaveJSProperty("volume", 0.5);
    await video.evaluate(() => { document.getElementById("movie_player").setVolume(1); });
    await page.mouse.wheel(0, 120);
    await expect(video).toHaveJSProperty("volume", 0);
    await expect(video).toHaveJSProperty("muted", true);
    await expect(hud).toHaveText("Stumm");
    await page.mouse.wheel(0, 120);
    await expect(video).toHaveJSProperty("volume", 0);
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 0.01);
    await expect(video).toHaveJSProperty("muted", false);
    await video.evaluate(() => { document.getElementById("movie_player").setVolume(99); });
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 1);
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 1);
    // Native mute and volume changes must be the starting point for the next step.
    await video.evaluate(() => {
      const player = document.getElementById("movie_player");
      player.setVolume(70);
      player.mute();
    });
    await page.mouse.wheel(0, -1);
    await expect(video).toHaveJSProperty("volume", 0.01);
    await expect(video).toHaveJSProperty("muted", false);
    const ignored = await video.evaluate((element) => {
      return [{ deltaX: 120 }, { deltaY: -120, ctrlKey: true }, { deltaY: -120, metaKey: true }].map((options) => {
        const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
        element.dispatchEvent(event);
        return { volume: element.volume, prevented: event.defaultPrevented };
      });
    });
    assert.deepEqual(ignored, Array(3).fill({ volume: 0.01, prevented: false }));
    // Wheel events inside a cross-origin frame do not bubble to the parent.
    const captured = await video.evaluate((element) => {
      const event = new WheelEvent("wheel", { deltaY: 1, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(captured, true);
    await expect(video).toHaveJSProperty("volume", 0);
    await page.getByRole("textbox", { name: "Chat" }).hover();
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 0);
  } finally { await close(page); }
});

test("wheel changes survive player reconciliation and keep native mute and volume controls synchronized", async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    const frame = page.frameLocator(`${root} iframe`);
    const video = frame.locator("video");
    const mute = frame.getByRole("button", { name: "Mute", exact: true });
    const volume = frame.getByRole("slider", { name: "Volume", exact: true });
    // The controls exist before the fixture binds their handlers. Its initial
    // media volume is set last, so wait for initialization before the click.
    await expect(video).toHaveJSProperty("volume", 0.5);
    await mute.click();
    await expect(video).toHaveJSProperty("muted", true);
    await video.hover();
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 0.01);
    await expect(video).toHaveJSProperty("muted", false);
    // Replay the player's later state update, which used to restore its old mute.
    await video.evaluate(() => window.reconcilePlayerState());
    await expect(video).toHaveJSProperty("muted", false);
    await expect(video).toHaveJSProperty("volume", 0.01);
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await expect(volume).toHaveValue("1");
    await page.mouse.wheel(0, -120);
    await expect(volume).toHaveValue("2");
    await page.mouse.wheel(0, 120);
    await expect(volume).toHaveValue("1");
    await page.mouse.wheel(0, 120);
    await expect(video).toHaveJSProperty("muted", true);
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await expect(volume).toHaveValue("0");
    // Use the actual slider event path, then scroll from its new state.
    await volume.fill("73");
    await expect(video).toHaveJSProperty("volume", 0.73);
    await video.hover();
    await page.mouse.wheel(0, -120);
    await expect(volume).toHaveValue("74");
    await video.evaluate(() => window.reconcilePlayerState());
    await expect(video).toHaveJSProperty("volume", 0.74);
    await expect(video).toHaveJSProperty("muted", false);
    // A normalized media volume is not necessarily the volume shown by YouTube.
    await video.evaluate((element) => { element.volume = 0.2; });
    await page.mouse.wheel(0, -120);
    await expect(volume).toHaveValue("75");
    await expect(video).toHaveJSProperty("volume", 0.75);
  } finally { await close(page); }
});

test("wheel input waits for usable player methods without changing the media element directly", async () => {
  await mockYouTube(routes());
  const page = await open();
  try {
    await addLinks(page);
    await page.locator(`${root} #watch`).click();
    const player = page.frameLocator(`${root} iframe`).locator("#movie_player");
    const results = await player.evaluate((element) => {
      const getVolume = element.getVolume;
      const isMuted = element.isMuted;
      return ["missing", "not-ready", "invalid-volume", "invalid-mute"].map((state) => {
        element.getVolume = state === "missing" ? undefined : state === "not-ready" ? () => undefined :
          state === "invalid-volume" ? () => NaN : getVolume;
        element.isMuted = state === "invalid-mute" ? () => undefined : isMuted;
        const event = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
        element.querySelector("video").dispatchEvent(event);
        const result = { prevented: event.defaultPrevented, volume: element.querySelector("video").volume };
        element.getVolume = getVolume;
        element.isMuted = isMuted;
        return result;
      });
    });
    assert.deepEqual(results, Array(4).fill({ prevented: false, volume: 0.5 }));
    await player.locator("video").hover();
    await page.mouse.wheel(0, -120);
    await expect(player.getByRole("slider", { name: "Volume", exact: true })).toHaveValue("51");
  } finally { await close(page); }
});

test("wheel support leaves unrelated YouTube embeds and standalone players unchanged", async () => {
  const page = await open();
  try {
    await page.evaluate((videoId) => {
      const frame = document.createElement("iframe");
      frame.id = "unrelated-youtube";
      frame.src = `https://www.youtube.com/embed/${videoId}`;
      document.body.prepend(frame);
    }, VIDEO);
    const video = page.frameLocator("#unrelated-youtube").locator("video");
    await video.hover();
    await page.mouse.wheel(0, -120);
    await expect(video).toHaveJSProperty("volume", 0.5);
    await page.goto(`https://www.youtube.com/embed/${VIDEO}`);
    await page.locator("video").hover();
    await page.mouse.wheel(0, -120);
    await expect(page.locator("video")).toHaveJSProperty("volume", 0.5);
  } finally { await close(page); }
});

test("profile ownership rejects stale SPA DOM; channel changes remove old player and network rules", async () => {
  await mockYouTube(routes());
  const page = await open("firstcreator");
  await addLinks(page);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await page.locator(`${root} #watch`).click();
  await expect(page.locator(`${root} iframe`)).toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, "", "/nextcreator");
    window.setSubscription("not-subscribed", "nextcreator");
  });
  await expect(page.locator(`${root} #channel-name`)).toHaveText("nextcreator");
  await expect(page.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  await expect.poll(async () => (await sessionRules()).length).toBe(0);
  assert.equal(await page.locator("video").first().evaluate((video) => video.muted), false);
  await expect(page.locator(`${root} #direct`)).toBeHidden();
  const nextUrl = "https://www.youtube.com/@next/streams";
  await mockYouTube(routes(SECOND_CHANNEL, SECOND_VIDEO, nextUrl));
  await page.locator("a:has(h1)").evaluate((link) => { link.href = "/nextcreator"; });
  await page.locator('[data-a-target="channel-home-tab-About"]').evaluate((link) => { link.href = "/nextcreator/about"; });
  // Even after the main heading changes, the old About panel is not evidence.
  await page.locator(`${root} #check`).click();
  await expect(page.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  assert.equal((await worker.evaluate(() => testRequests)).length, 0);
  await page.locator('[data-a-target="about-panel"] h3').evaluate((heading) => { heading.textContent = "Über nextcreator"; });
  await addLinks(page, [nextUrl]);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} #direct`)).toHaveAttribute("href", `https://www.youtube.com/watch?v=${SECOND_VIDEO}`);
  await page.evaluate(() => history.pushState({}, "", "/directory"));
  await expect(page.locator(root)).toHaveCount(0);
  await close(page);
});

test("ambiguous streams and an ended stream never suspend Twitch", async () => {
  const second = "https://www.youtube.com/@second/streams";
  await mockYouTube({ ...routes(), ...routes(SECOND_CHANNEL, SECOND_VIDEO, second) });
  const page = await open("ambiguouscreator");
  await addLinks(page, [profileUrl, second]);
  await expect(page.locator(`${root} #status`)).toContainText("Mehrere verlinkte");
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  assert.equal((await sessionRules()).length, 0);
  await addLinks(page, [profileUrl]);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await mockYouTube({ [profileUrl]: pageJson("ytInitialData", listing(CHANNEL, [])) });
  await page.locator(`${root} #watch`).click();
  await expect(page.locator(`${root} #status`)).toContainText("kein öffentlicher");
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await close(page);
});

test("profile changes during an in-flight lookup discard the old result and check the new link", async () => {
  const nextUrl = "https://www.youtube.com/@changed/streams";
  await mockYouTube({ ...routes(), ...routes(SECOND_CHANNEL, SECOND_VIDEO, nextUrl) });
  await worker.evaluate(() => {
    const fetchFixture = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      if (args[0].includes("/@creator/")) await new Promise((resolve) => { globalThis.releaseLookup = resolve; });
      return fetchFixture(...args);
    };
  });
  const page = await open("changingcreator");
  await addLinks(page);
  await expect.poll(() => worker.evaluate(() => Boolean(globalThis.releaseLookup))).toBe(true);
  await addLinks(page, [nextUrl]);
  await worker.evaluate(() => { globalThis.releaseLookup(); delete globalThis.releaseLookup; });
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} #direct`)).toHaveAttribute("href", `https://www.youtube.com/watch?v=${SECOND_VIDEO}`);
  assert.equal((await sessionRules()).length, 0);
  await close(page);
});

test("simultaneous creator tabs have independent Chromium session rules", async () => {
  await mockYouTube(routes());
  const first = await open("multifirst");
  const second = await open("multisecond");
  await addLinks(first);
  await addLinks(second);
  await expect(first.locator(`${root} #watch`)).toBeEnabled();
  await expect(second.locator(`${root} #watch`)).toBeEnabled();
  await Promise.all([first.locator(`${root} #watch`).click(), second.locator(`${root} #watch`).click()]);
  await expect(first.locator(`${root} iframe`)).toBeVisible();
  await expect(second.locator(`${root} iframe`)).toBeVisible();
  assert.equal((await sessionRules()).length, 2);
  await close(first);
  await expect.poll(async () => (await sessionRules()).length).toBe(1);
  await expect(second.locator(`${root} iframe`)).toBeVisible();
  await close(second);
  await expect.poll(async () => (await sessionRules()).length).toBe(0);
});

test("UI fits a small player and popup has no broken or hardcoded creator links", async () => {
  await mockYouTube(routes());
  const page = await open("smallcreator");
  await page.locator(".channel-root__player").evaluate((element) => { element.style.width = "400px"; element.style.height = "225px"; });
  await addLinks(page);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  const panel = await page.locator(`${root} .panel`).boundingBox();
  assert.ok(panel.width <= 400 && panel.height <= 225);
  await expect(page.locator(`${root} details`)).toBeHidden();
  if (process.env.STREAM_BRIDGE_ARTIFACTS) await page.screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/small-player.png` });
  await close(page);
  const popup = await openPopup();
  await expect(popup.getByRole("heading", { name: "Stream Bridge", exact: true })).toBeVisible();
  await expect(popup.getByRole("switch")).not.toBeChecked();
  assert.equal(await popup.locator(".brand img").evaluate((image) => image.complete && image.naturalWidth === 48), true);
  const iconPaths = await worker.evaluate(() => Object.values(chrome.runtime.getManifest().icons));
  for (const path of iconPaths) {
    assert.equal(await popup.evaluate(async (path) => {
      const image = new Image();
      image.src = chrome.runtime.getURL(path);
      await image.decode();
      return image.naturalWidth;
    }, path), Number(/icon-(\d+)/.exec(path)[1]));
  }
  assert.equal(await popup.locator('a[href*="twitch.tv/stylerz"], a[href*="undefined"]').count(), 0);
  assert.equal(await popup.locator("body").evaluate((body) => body.scrollWidth), 320);
  if (process.env.STREAM_BRIDGE_ARTIFACTS) await popup.locator("body").screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/popup.png` });
  await popup.close();
});

test("popup opt-in switches existing tabs, persists across reloads and turning it off preserves active playback", async () => {
  await mockYouTube(routes());
  const first = await open("autofirst");
  const second = await open("autosecond");
  await addLinks(first);
  await addLinks(second);
  await expect(first.locator(`${root} #watch`)).toBeEnabled();
  await expect(second.locator(`${root} #watch`)).toBeEnabled();
  let popup = await openPopup();
  await expect(popup.getByRole("switch")).not.toBeChecked();
  await popup.getByRole("switch").press("Space");
  await expect(popup.getByRole("status")).toContainText("Ein ·");
  await expect(first.locator(`${root} iframe`)).toBeVisible();
  await expect(second.locator(`${root} iframe`)).toBeVisible();
  assert.equal((await sessionRules()).length, 2);
  await popup.close();
  popup = await openPopup();
  await expect(popup.getByRole("switch")).toBeChecked();
  await first.reload();
  await expect(first.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  await addLinks(first);
  await expect(first.locator(`${root} iframe`)).toBeVisible();
  await setAutomatic(popup, false);
  await expect(first.locator(`${root} iframe`)).toBeVisible();
  await expect(second.locator(`${root} iframe`)).toBeVisible();
  const manual = await open("autodisabled");
  await addLinks(manual);
  await expect(manual.locator(`${root} #watch`)).toBeEnabled();
  await expect(manual.locator(`${root} iframe`)).toHaveCount(0);
  await manual.locator(`${root} #watch`).click();
  await expect(manual.locator(`${root} iframe`)).toBeVisible();
  await Promise.all([close(first), close(second), close(manual), popup.close()]);
  await expect.poll(async () => (await sessionRules()).length).toBe(0);
});

test("automatic playback respects return to Twitch and can be re-enabled in the popup", async () => {
  await mockYouTube(routes());
  const popup = await openPopup();
  await setAutomatic(popup, true);
  const page = await open("autoreturn");
  await addLinks(page);
  await expect(page.locator(`${root} iframe`)).toBeVisible();
  await page.locator(`${root} #menu`).click();
  await page.locator(`${root} #back`).click();
  await expect(page.locator(`${root} #status`)).toContainText("Kein YouTube-Kanallink");
  await addLinks(page);
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await page.locator(`${root} #check`).click();
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  await setAutomatic(popup, false);
  await setAutomatic(popup, true);
  await expect(page.locator(`${root} iframe`)).toBeVisible();
  await setAutomatic(popup, false);
  await close(page);
  await popup.close();
  await expect.poll(async () => (await sessionRules()).length).toBe(0);
});

test("automatic playback leaves ambiguous, offline and failed lookups on Twitch", async () => {
  const popup = await openPopup();
  await setAutomatic(popup, true);
  const second = "https://www.youtube.com/@second/streams";
  await mockYouTube({ ...routes(), ...routes(SECOND_CHANNEL, SECOND_VIDEO, second) });
  const page = await open("autouncertain");
  await addLinks(page, [profileUrl, second]);
  await expect(page.locator(`${root} #status`)).toContainText("Mehrere verlinkte");
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  await mockYouTube({ [profileUrl]: pageJson("ytInitialData", listing(CHANNEL, [])) });
  await addLinks(page);
  await expect(page.locator(`${root} #status`)).toContainText("kein öffentlicher");
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  await mockYouTube({});
  await page.locator(`${root} #check`).click();
  await expect(page.locator(`${root} #check`)).toBeEnabled();
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await setAutomatic(popup, false);
  await close(page);
  await popup.close();
});

test("automatic playback follows Twitch's subscription data within a second instead of waiting for the slow poll", async () => {
  await mockYouTube(routes());
  const popup = await openPopup();
  await setAutomatic(popup, true);
  const page = await open("autoquick");
  await page.evaluate(() => window.setSubscription("unknown"));
  await addLinks(page);
  await expect(page.locator(`${root} #status`)).toContainText("Abo-Status konnte noch nicht bestätigt");
  // Land just after a 5s tick would have fired, so only the fast retry can react in time.
  await page.waitForTimeout(1_000);
  await page.evaluate(() => window.setSubscription("not-subscribed"));
  const started = Date.now();
  await expect(page.locator(`${root} iframe`)).toBeVisible({ timeout: 2_000 });
  assert.ok(Date.now() - started < 2_000);
  await setAutomatic(popup, false);
  await close(page);
  await popup.close();
});

test("favorites are starred on the channel page, listed in the popup and removable there", async () => {
  await mockYouTube({});
  const page = await open("favstar");
  const star = page.locator(`${root} #favorite`);
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator(`${root} #favorite`)).toHaveAttribute("aria-pressed", "true");
  const popup = await openPopup();
  await expect(popup.locator("#favorites li")).toHaveText(/favstar/);
  await popup.getByRole("button", { name: "favstar aus Favoriten entfernen" }).click();
  await expect(popup.locator("#favorites li")).toHaveCount(0);
  await expect(popup.locator("#favorites-empty")).toBeVisible();
  await expect(page.locator(`${root} #favorite`)).toHaveAttribute("aria-pressed", "false");
  await popup.close();
  await close(page);
});

test("disabling automatic playback during the initial lookup never suspends Twitch", async () => {
  const popup = await openPopup();
  // An automatic switch reuses that lookup, so there is no second lookup to hold.
  for (const phase of ["initial"]) {
    await mockYouTube(routes());
    await worker.evaluate(() => {
      const fetchFixture = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async (...args) => {
        calls += 1;
        if (calls === 1) {
          await new Promise((resolve) => { globalThis.releaseAutoLookup = resolve; });
        }
        return fetchFixture(...args);
      };
    });
    await setAutomatic(popup, true);
    const page = await open(`autocancel${phase}`);
    await addLinks(page);
    await expect.poll(() => worker.evaluate(() => Boolean(globalThis.releaseAutoLookup))).toBe(true);
    await setAutomatic(popup, false);
    await worker.evaluate(() => { globalThis.releaseAutoLookup(); delete globalThis.releaseAutoLookup; });
    await expect(page.locator(`${root} #watch`)).toBeEnabled();
    await expect(page.locator(`${root} #status`)).toContainText("Live auf YouTube");
    await expect(page.locator(`${root} iframe`)).toHaveCount(0);
    assert.equal((await sessionRules()).length, 0);
    await close(page);
  }
  await popup.close();
});

test("disabling automatic playback while a suspension is in flight restores Twitch without opening YouTube", async () => {
  await mockYouTube(routes());
  const popup = await openPopup();
  await setAutomatic(popup, true);
  const page = await open("autocancelsuspension");
  await worker.evaluate(() => {
    const updateRules = chrome.declarativeNetRequest.updateSessionRules.bind(chrome.declarativeNetRequest);
    globalThis.restoreAutoRules = () => { chrome.declarativeNetRequest.updateSessionRules = updateRules; };
    chrome.declarativeNetRequest.updateSessionRules = async (updates) => {
      if (updates.addRules?.length) await new Promise((resolve) => { globalThis.releaseAutoRules = resolve; });
      return updateRules(updates);
    };
  });
  await addLinks(page);
  await expect.poll(() => worker.evaluate(() => Boolean(globalThis.releaseAutoRules))).toBe(true);
  await setAutomatic(popup, false);
  await worker.evaluate(() => { globalThis.releaseAutoRules(); delete globalThis.releaseAutoRules; });
  await expect(page.locator(`${root} #watch`)).toBeEnabled();
  await expect(page.locator(`${root} #status`)).toContainText("Live auf YouTube");
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await worker.evaluate(() => { globalThis.restoreAutoRules(); delete globalThis.restoreAutoRules; });
  await close(page);
  await popup.close();
});

test("automatic playback preserves the subscription guard and recovers once a nonsubscriber is confirmed", async () => {
  await mockYouTube(routes());
  const popup = await openPopup();
  await setAutomatic(popup, true);
  const page = await open("autosubscriber");
  await page.evaluate(() => window.setSubscription("subscribed"));
  await addLinks(page);
  await expect(page.locator(`${root} #status`)).toContainText("Twitch läuft mit deinem Kanal-Abo weiter");
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await page.evaluate(() => window.setSubscription("unknown"));
  await page.locator(`${root} #check`).click();
  await expect(page.locator(`${root} #status`)).toContainText("Abo-Status konnte noch nicht bestätigt");
  await expect(page.locator(`${root} #watch`)).toBeDisabled();
  await expect(page.locator(`${root} iframe`)).toHaveCount(0);
  assert.equal((await sessionRules()).length, 0);
  await page.evaluate(() => window.setSubscription("not-subscribed"));
  await page.locator(`${root} #check`).click();
  await expect(page.locator(`${root} iframe`)).toBeVisible();
  await setAutomatic(popup, false);
  await close(page);
  await popup.close();
});
