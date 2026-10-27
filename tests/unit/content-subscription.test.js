import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const config = readFileSync(new URL("../../extension/config.js", import.meta.url), "utf8");
const discovery = readFileSync(new URL("../../extension/discovery.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../../extension/content.js", import.meta.url), "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise((fn) => { resolve = fn; }); return { promise, resolve }; };

async function page(t, initial = "not-subscribed", intercepted, settings) {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => { errors.push(error); });
  const dom = new JSDOM('<!doctype html><head></head><body><div class="channel-root__player" style="position:relative"><video></video></div></body>', {
    url: "https://www.twitch.tv/stylerz", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console,
  });
  t.after(() => { dom.window.close(); });
  const { window } = dom;
  let state = initial;
  let handler = intercepted;
  let routeMessage;
  let paused = 0;
  const intervals = new Map();
  const timeouts = [];
  const calls = [];
  window.setTimeout = (fn, delay) => { timeouts.push(delay); queueMicrotask(fn); return 1; };
  window.setInterval = (fn) => { const id = Symbol(); intervals.set(id, fn); return id; };
  window.clearInterval = (id) => { intervals.delete(id); };
  window.HTMLMediaElement.prototype.pause = () => { paused++; };
  window.chrome = {
    storage: settings && { onChanged: { addListener() {} }, local: { get: async (defaults) => ({ ...defaults, ...settings }), set: async (updates) => { Object.assign(settings, updates); } } },
    runtime: {
      id: "extension", onMessage: { addListener: (fn) => { routeMessage = fn; } },
      sendMessage: async (message) => {
        calls.push(message);
        const overridden = handler?.(message);
        if (overridden !== undefined) return overridden;
        if (message.type === "SUBSCRIPTION") return { ok: true, result: { state, twitchLogin: message.twitchLogin } };
        if (message.type === "LOOKUP") return { ok: true, result: { state: "live", videoId: "abcdefghijk", title: "Live", checkedAt: Date.now() } };
        if (message.type === "SUSPEND") return { ok: true, result: { state: "suspended" } };
        return { ok: true, result: {} };
      },
    },
  };
  window.eval(config);
  window.eval(discovery);
  window.eval(source);
  await flush();
  return {
    window, calls, errors, intervals, timeouts, get paused() { return paused; },
    get shadow() { return window.document.getElementById("stylerz-bridge-prototype")?.shadowRoot; },
    set state(value) { state = value; },
    intercept(fn) { handler = fn; },
    async click(id) { this.shadow.getElementById(id).click(); await flush(); },
    async poll() { for (const fn of intervals.values()) fn(); await flush(); },
    async navigate(path) {
      window.history.pushState({}, "", path);
      routeMessage({ type: "ROUTE_CHANGED" }, { id: "extension" });
      await flush();
    },
  };
}

test("subscribers keep Twitch playback and never use the YouTube lookup or network blocking", async (t) => {
  const p = await page(t, "subscribed");
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  assert.match(p.shadow.getElementById("subscription-status").textContent, /Aktives Kanal-Abo/);
  assert.equal(p.calls.some((call) => call.type === "SUSPEND"), false);
  assert.doesNotMatch(p.shadow.getElementById("status").textContent, /Live auf YouTube/);
  assert.equal(p.paused, 0);
  assert.equal(p.window.document.querySelector("video").muted, false);
});

test("non-subscribers retain the existing manual replacement", async (t) => {
  const p = await page(t);
  assert.equal(p.shadow.getElementById("watch").disabled, false);
  await p.click("watch");
  assert.ok(p.shadow.getElementById("youtube"));
  assert.equal(p.window.document.documentElement.hasAttribute("data-stream-bridge-active"), true);
  assert.ok(p.calls.some((call) => call.type === "SUSPEND"));
  assert.ok(p.paused > 0);
});

test("Twitch cannot undo the mute after the replacement without a DOM change", async (t) => {
  const p = await page(t);
  await p.click("watch");
  const video = p.window.document.querySelector("video");
  assert.equal(video.muted, true);
  video.muted = false;
  video.dispatchEvent(new p.window.Event("volumechange"));
  assert.equal(video.muted, true, "a late Twitch volume update must not restore native audio");
});

test("native audio guards leave unrelated media alone and release the original mute on navigation", async (t) => {
  const p = await page(t);
  const native = p.window.document.querySelector("video");
  const preview = p.window.document.createElement("div");
  preview.className = "picture-by-picture-player";
  preview.innerHTML = '<audio muted></audio>';
  p.window.document.body.append(preview);
  const audio = preview.querySelector("audio");
  audio.muted = true;
  await p.click("watch");
  p.window.document.body.append(native);
  audio.remove();
  const unrelated = p.window.document.createElement("video");
  p.window.document.body.append(unrelated);
  for (const type of ["play", "playing", "volumechange"]) {
    for (const media of [native, audio]) {
      media.muted = false;
      const before = p.paused;
      media.dispatchEvent(new p.window.Event(type));
      assert.equal(media.muted, true, type);
      assert.ok(p.paused > before, `${type} stops native playback`);
    }
    unrelated.dispatchEvent(new p.window.Event(type));
    assert.equal(unrelated.muted, false, "unrelated page media is not muted");
  }
  await p.navigate("/directory");
  assert.equal(native.muted, false, "initially audible media is restored");
  assert.equal(audio.muted, true, "initially muted media stays muted");
  for (const media of [native, audio]) {
    media.muted = false;
    const before = p.paused;
    media.dispatchEvent(new p.window.Event("playing"));
    media.dispatchEvent(new p.window.Event("volumechange"));
    assert.equal(media.muted, false, "the guard is inactive after navigation");
    assert.equal(p.paused, before);
  }
});

test("audio protection adds no timer or lookup between suspension and mounting YouTube", async (t) => {
  const p = await page(t);
  let timersAtSuspension;
  p.intercept((message) => {
    if (message.type === "SUSPEND") timersAtSuspension = p.timeouts.length;
  });
  await p.click("watch");
  assert.ok(p.shadow.getElementById("youtube"));
  assert.equal(p.timeouts.length, timersAtSuspension, "YouTube mounts without another timer");
  const messages = p.calls.length;
  p.window.document.querySelector("video").dispatchEvent(new p.window.Event("volumechange"));
  await flush();
  assert.equal(p.calls.length, messages, "audio enforcement makes no background request");
});

test("a preroll removed in the same DOM turn is tracked before deferred reconciliation", async (t) => {
  const p = await page(t);
  const audio = p.window.document.createElement("audio");
  p.window.document.querySelector(".channel-root__player").append(audio);
  audio.remove();
  await flush();
  assert.equal(p.paused, 0, "tracking does not interrupt Twitch before the switch");
  await p.click("watch");
  assert.equal(audio.muted, true, "removed media is included in the initial mute");
  audio.muted = false;
  audio.dispatchEvent(new p.window.Event("playing"));
  assert.equal(audio.muted, true, "detached playback is still guarded");
  await p.navigate("/directory");
  assert.equal(audio.muted, false, "navigation restores the original mute state");
});

test("unknown/loading data blocks replacement and recovers when Twitch data arrives", async (t) => {
  const p = await page(t, "unknown");
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  assert.doesNotMatch(p.shadow.getElementById("status").textContent, /Live auf YouTube/);
  p.state = "not-subscribed";
  await p.poll();
  assert.equal(p.shadow.getElementById("watch").disabled, false);
  await p.click("watch");
  assert.ok(p.shadow.getElementById("youtube"));
});

test("a new subscription immediately before the click prevents replacement", async (t) => {
  const p = await page(t);
  p.state = "subscribed";
  await p.click("watch");
  assert.equal(p.shadow.getElementById("youtube"), null);
  assert.equal(p.calls.some((call) => call.type === "SUSPEND"), false);
  assert.equal(p.paused, 0);
});

test("background rejection during the lookup leaves Twitch running", async (t) => {
  const p = await page(t);
  p.intercept((message) => message.type === "SUSPEND" ? { ok: false, error: "Aktives Kanal-Abo erkannt." } : undefined);
  await p.click("watch");
  assert.equal(p.shadow.getElementById("youtube"), null);
  assert.equal(p.window.document.documentElement.hasAttribute("data-stream-bridge-active"), false);
  assert.equal(p.paused, 0);
  assert.ok(p.calls.some((call) => call.type === "RESUME"));
});

test("a subscription detected during YouTube playback releases Twitch's network rule", async (t) => {
  const p = await page(t);
  await p.click("watch");
  p.state = "subscribed";
  await p.poll();
  assert.equal(p.calls.at(-1).type, "RESUME");
  // JSDOM does not implement reload; assert the reload request separately.
  assert.equal(p.errors.filter((error) => /navigation/.test(error.message)).length, 1);
});

test("channel navigation discards a delayed subscription answer", async (t) => {
  const p = await page(t);
  const delayed = deferred();
  p.intercept((message) => message.type === "SUBSCRIPTION" && message.twitchLogin === "stylerz" ? delayed.promise : undefined);
  p.shadow.getElementById("check").click();
  await flush();
  p.state = "subscribed";
  await p.navigate("/colthavok");
  delayed.resolve({ ok: true, result: { state: "not-subscribed", twitchLogin: "stylerz" } });
  await flush();
  assert.match(p.shadow.getElementById("channel-name").textContent, /ColtHavok/);
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  assert.match(p.shadow.getElementById("subscription-status").textContent, /Aktives Kanal-Abo/);
  assert.doesNotMatch(p.shadow.getElementById("status").textContent, /Live auf YouTube/);
  assert.equal(p.calls.some((call) => call.type === "SUSPEND"), false);
  assert.equal(p.intervals.size, 1);
});

test("hidden tabs stop subscription polling and leaving supported channels clears it", async (t) => {
  const p = await page(t);
  Object.defineProperty(p.window.document, "hidden", { configurable: true, value: true });
  const count = p.calls.length;
  await p.poll();
  assert.equal(p.calls.length, count);
  Object.defineProperty(p.window.document, "hidden", { configurable: true, value: false });
  p.state = "subscribed";
  p.window.document.dispatchEvent(new p.window.Event("visibilitychange"));
  await flush();
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  await p.navigate("/directory");
  assert.equal(p.intervals.size, 0);
  assert.equal(p.shadow, undefined);
});

test("navigation during suspension releases old rules without replacing the next subscriber's stream", async (t) => {
  const p = await page(t);
  const delayed = deferred();
  p.intercept((message) => message.type === "SUSPEND" ? delayed.promise : undefined);
  p.shadow.getElementById("watch").click();
  await flush();
  assert.equal(p.calls.at(-1).type, "SUSPEND");
  p.state = "subscribed";
  await p.navigate("/colthavok");
  delayed.resolve({ ok: true, result: { state: "suspended" } });
  await flush();
  assert.equal(p.shadow.getElementById("youtube"), null);
  assert.equal(p.paused, 0);
  assert.ok(p.calls.some((call) => call.type === "RESUME"));
});

test("a changed subscription result during suspension aborts before mounting YouTube", async (t) => {
  for (const state of ["subscribed", "unknown"]) {
    const p = await page(t);
    const delayed = deferred();
    p.intercept((message) => message.type === "SUSPEND" ? delayed.promise : undefined);
    p.shadow.getElementById("watch").click();
    await flush();
    p.state = state;
    await p.poll();
    delayed.resolve({ ok: true, result: { state: "suspended" } });
    await flush();
    assert.equal(p.shadow.getElementById("youtube"), null);
    assert.equal(p.paused, 0);
    assert.equal(p.calls.at(-1).type, "RESUME");
    assert.equal(p.errors.filter((error) => /navigation/.test(error.message)).length, 1);
  }
});

test("a delayed automatic restore cannot reload a newly opened channel", async (t) => {
  const p = await page(t);
  await p.click("watch");
  const delayed = deferred();
  p.intercept((message) => message.type === "RESUME" ? delayed.promise : undefined);
  p.state = "subscribed";
  await p.poll();
  assert.equal(p.calls.at(-1).type, "RESUME");
  await p.navigate("/colthavok");
  delayed.resolve({ ok: true, result: { state: "resumed" } });
  await flush();
  assert.match(p.shadow.getElementById("channel-name").textContent, /ColtHavok/);
  assert.equal(p.errors.filter((error) => /navigation/.test(error.message)).length, 0);
});

test("the YouTube lookup starts while the subscription state is still loading", async (t) => {
  const delayed = deferred();
  const p = await page(t, "not-subscribed", (message) => message.type === "SUBSCRIPTION" ? delayed.promise : undefined);
  assert.ok(p.calls.some((call) => call.type === "LOOKUP"));
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  delayed.resolve({ ok: true, result: { state: "not-subscribed", twitchLogin: "stylerz" } });
  await flush();
  assert.equal(p.shadow.getElementById("watch").disabled, false);
  assert.equal(p.calls.filter((call) => call.type === "LOOKUP").length, 1, "the pending lookup is reused");
});

test("an unknown subscription state is retried quickly until Twitch data arrives", async (t) => {
  let reads = 0;
  const p = await page(t, "unknown", (message) => {
    if (message.type !== "SUBSCRIPTION") return undefined;
    reads += 1;
    return { ok: true, result: { state: reads > 3 ? "not-subscribed" : "unknown", twitchLogin: message.twitchLogin } };
  });
  assert.equal(reads, 5, "initial check, three unknown retries, then confirmation");
  assert.equal(p.shadow.getElementById("watch").disabled, false);
  assert.match(p.shadow.getElementById("status").textContent, /Live auf YouTube/);
});

test("fast subscription retries are bounded, so a permanently unknown state falls back to the slow poll", async (t) => {
  const p = await page(t, "unknown");
  const reads = p.calls.filter((call) => call.type === "SUBSCRIPTION").length;
  assert.ok(reads > 3 && reads <= 32, `${reads} reads`);
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  await p.poll();
  assert.equal(p.calls.filter((call) => call.type === "SUBSCRIPTION").length, reads + 1);
});

test("an automatic switch reuses the lookup that just found the stream; a click verifies again", async (t) => {
  const auto = await page(t, "not-subscribed", undefined, { autoSwitchToYouTube: true, panelCollapsed: false });
  assert.ok(auto.shadow.getElementById("youtube"));
  assert.deepEqual(auto.calls.filter((call) => call.type === "LOOKUP").map((call) => call.force), [false, false]);
  const manual = await page(t);
  await manual.click("watch");
  assert.ok(manual.shadow.getElementById("youtube"));
  assert.equal(manual.calls.filter((call) => call.type === "LOOKUP").at(-1).force, true);
});

test("Erneut prüfen still forces a fresh lookup", async (t) => {
  const p = await page(t);
  await p.click("check");
  assert.equal(p.calls.filter((call) => call.type === "LOOKUP").at(-1).force, true);
});

test("the star adds and removes the channel from the favorites", async (t) => {
  const settings = { favorites: ["colthavok"] };
  const p = await page(t, "not-subscribed", undefined, settings);
  const star = p.shadow.getElementById("favorite");
  assert.equal(star.getAttribute("aria-pressed"), "false");
  await p.click("favorite");
  assert.deepEqual([...settings.favorites], ["colthavok", "stylerz"]);
  assert.equal(star.getAttribute("aria-pressed"), "true");
  assert.equal(star.textContent, "★");
  await p.click("favorite");
  assert.deepEqual([...settings.favorites], ["colthavok"]);
  assert.equal(star.getAttribute("aria-pressed"), "false");
});

test("at most ten favorites are kept; the oldest is dropped", async (t) => {
  const settings = { favorites: Array.from({ length: 10 }, (_, i) => `channel${i}`) };
  const p = await page(t, "not-subscribed", undefined, settings);
  await p.click("favorite");
  assert.equal(settings.favorites.length, 10);
  assert.equal(settings.favorites.at(-1), "stylerz");
  assert.equal(settings.favorites.includes("channel0"), false);
});

test("timing marks follow the switch and the embed reports the first playing frame", async (t) => {
  const p = await page(t);
  await p.click("watch");
  const root = p.window.document.getElementById("stylerz-bridge-prototype");
  const marks = JSON.parse(root.getAttribute("data-timing"));
  assert.deepEqual(Object.keys(marks), ["mounted", "lookup", "subscription", "switch", "suspended", "frame"].filter((key) => key in marks));
  for (const key of ["mounted", "subscription", "lookup", "switch", "suspended", "frame"]) assert.equal(typeof marks[key], "number", key);
  const frame = p.shadow.getElementById("youtube");
  const logged = [];
  p.window.console.info = (...args) => { logged.push(args); };
  p.window.dispatchEvent(new p.window.MessageEvent("message", { origin: "https://www.youtube.com", source: frame.contentWindow, data: { type: "stream-bridge-playing" } }));
  assert.equal(typeof JSON.parse(root.getAttribute("data-timing")).playing, "number");
  assert.equal(logged.length, 1);
  p.window.dispatchEvent(new p.window.MessageEvent("message", { origin: "https://evil.test", source: frame.contentWindow, data: { type: "stream-bridge-playing" } }));
  assert.equal(logged.length, 1);
});
