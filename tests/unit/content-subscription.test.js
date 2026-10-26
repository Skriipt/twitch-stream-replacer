import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const config = readFileSync(new URL("../../extension/config.js", import.meta.url), "utf8");
const discovery = readFileSync(new URL("../../extension/discovery.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../../extension/content.js", import.meta.url), "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise((fn) => { resolve = fn; }); return { promise, resolve }; };

async function page(t, initial = "not-subscribed") {
  const errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", (error) => { errors.push(error); });
  const dom = new JSDOM('<!doctype html><head></head><body><div class="channel-root__player" style="position:relative"><video></video></div></body>', {
    url: "https://www.twitch.tv/stylerz", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: console,
  });
  t.after(() => { dom.window.close(); });
  const { window } = dom;
  let state = initial;
  let handler;
  let routeMessage;
  let paused = 0;
  const intervals = new Map();
  const calls = [];
  window.setTimeout = (fn) => { queueMicrotask(fn); return 1; };
  window.setInterval = (fn) => { const id = Symbol(); intervals.set(id, fn); return id; };
  window.clearInterval = (id) => { intervals.delete(id); };
  window.HTMLMediaElement.prototype.pause = () => { paused++; };
  window.chrome = {
    runtime: {
      id: "extension", onMessage: { addListener: (fn) => { routeMessage = fn; } },
      sendMessage: async (message) => {
        calls.push(message);
        const overridden = handler?.(message);
        if (overridden !== undefined) return overridden;
        if (message.type === "SUBSCRIPTION") return { ok: true, result: { state, twitchLogin: message.twitchLogin } };
        if (message.type === "LOOKUP") return { ok: true, result: { state: "live", videoId: "abcdefghijk", title: "Live" } };
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
    window, calls, errors, intervals, get paused() { return paused; },
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

test("subscribers keep Twitch playback without YouTube lookup or network blocking", async (t) => {
  const p = await page(t, "subscribed");
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  assert.match(p.shadow.getElementById("subscription-status").textContent, /Aktives Kanal-Abo/);
  assert.deepEqual(p.calls.map((call) => call.type), ["SUBSCRIPTION"]);
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

test("unknown/loading data blocks replacement and recovers when Twitch data arrives", async (t) => {
  const p = await page(t, "unknown");
  assert.equal(p.shadow.getElementById("watch").disabled, true);
  assert.equal(p.calls.some((call) => call.type === "LOOKUP"), false);
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
  assert.equal(p.calls.filter((call) => call.type === "LOOKUP" && call.twitchLogin === "colthavok").length, 0);
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
