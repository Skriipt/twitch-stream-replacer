import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { listing, player, pageJson, profileUrl, publicResponse, VIDEO } from "../fixtures.js";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.chrome; });

async function worker() {
  const listeners = {};
  const tabs = new Map([[1, { url: "https://www.twitch.tv/creator" }], [2, { url: "https://www.twitch.tv/second" }]]);
  let rules = [];
  const local = {};
  const session = {};
  const storageArea = (values) => ({
    get: async (keys) => typeof keys === "string" ? { [keys]: values[keys] } : { ...keys, ...values },
    set: async (updates) => { Object.assign(values, updates); },
    remove: async (key) => { delete values[key]; },
  });
  globalThis.chrome = {
    storage: { local: storageArea(local), session: storageArea(session) },
    runtime: { id: "test-extension", onMessage: { addListener: (fn) => { listeners.message = fn; } } },
    tabs: { get: async (id) => tabs.get(id), sendMessage: async () => {},
      onUpdated: { addListener: (fn) => { listeners.updated = fn; } }, onRemoved: { addListener: (fn) => { listeners.removed = fn; } } },
    scripting: { executeScript: async ({ args }) => [{ frameId: 0, result: { state: "not-subscribed", twitchLogin: args[0] } }] },
    declarativeNetRequest: {
      getSessionRules: async () => rules,
      updateSessionRules: async ({ removeRuleIds, addRules }) => { rules = rules.filter((rule) => !removeRuleIds.includes(rule.id)).concat(addRules); },
    },
  };
  await import(`../../extension/background.js?test=${crypto.randomUUID()}`);
  const sender = (tabId = 1) => ({ id: "test-extension", frameId: 0, tab: { id: tabId }, url: tabs.get(tabId).url });
  const message = (fields, tabId = 1) => new Promise((resolve) => listeners.message(fields, sender(tabId), resolve));
  return { message, sender, listeners, tabs, local, session, rules: () => rules };
}

test("lookup is scoped to current tab login and profile-link set; force refresh bypasses cache", async () => {
  const app = await worker();
  let count = 0;
  globalThis.fetch = async (url) => {
    count += 1;
    return publicResponse(url, url.includes("/watch?") ? pageJson("ytInitialPlayerResponse", player()) : pageJson("ytInitialData", listing()));
  };
  const fields = { type: "LOOKUP", twitchLogin: "creator", youtubeLinks: [profileUrl] };
  assert.equal((await app.message({ ...fields, youtubeLinks: [] })).result.state, "unlinked");
  assert.equal((await app.message(fields)).result.videoId, VIDEO);
  await app.message(fields);
  assert.equal(count, 2);
  await app.message({ ...fields, force: true });
  assert.equal(count, 4);
  const mismatch = await app.message({ ...fields, twitchLogin: "other" });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /geändert/);
  assert.equal(count, 4);
});
test("coalesces simultaneous lookups for the same channel and links", async () => {
  const app = await worker();
  let count = 0;
  globalThis.fetch = async (url) => {
    count += 1;
    return publicResponse(url, url.includes("/watch?") ? pageJson("ytInitialPlayerResponse", player()) : pageJson("ytInitialData", listing()));
  };
  const fields = { type: "LOOKUP", twitchLogin: "creator", youtubeLinks: [profileUrl] };
  const replies = await Promise.all([app.message(fields), app.message(fields)]);
  assert.ok(replies.every((reply) => reply.result.state === "live"));
  assert.equal(count, 2);
});
test("ignores foreign senders and iframes", async () => {
  const app = await worker();
  for (const overrides of [{ id: "foreign" }, { frameId: 1 }, { url: "https://evil.test/creator" }]) {
    let called = false;
    assert.equal(app.listeners.message({ type: "LOOKUP" }, { ...app.sender(), ...overrides }, () => { called = true; }), undefined);
    assert.equal(called, false);
  }
});
test("serializes per-tab video rules and removes only the relevant tab on resume", async () => {
  const app = await worker();
  const replies = await Promise.all([
    app.message({ type: "SUSPEND", twitchLogin: "creator" }),
    app.message({ type: "SUSPEND", twitchLogin: "second" }, 2),
  ]);
  assert.ok(replies.every((reply) => reply.ok));
  assert.equal(app.rules().length, 2);
  assert.notEqual(app.rules()[0].id, app.rules()[1].id);
  await app.message({ type: "RESUME" });
  assert.deepEqual(app.rules().map((rule) => rule.condition.tabIds), [[2]]);
  app.tabs.set(1, { url: "https://www.twitch.tv/elsewhere" });
  assert.equal((await app.message({ type: "SUSPEND", twitchLogin: "creator" })).ok, false);
});
test("tab reload clears suspension even on the same channel", async () => {
  const app = await worker();
  await app.message({ type: "SUSPEND", twitchLogin: "creator" });
  app.listeners.updated(1, { status: "loading" });
  await app.message({ type: "RESUME" }); // queued behind the navigation cleanup
  assert.equal(app.rules().length, 0);
});

test("automatic suspension requires opt-in and respects per-tab Twitch overrides", async () => {
  const app = await worker();
  const automatic = { type: "SUSPEND", twitchLogin: "creator", automatic: true };
  assert.equal((await app.message(automatic)).result.state, "cancelled");
  assert.equal(app.rules().length, 0);
  Object.assign(app.local, { autoSwitchToYouTube: true, autoSwitchRevision: "first" });
  assert.equal((await app.message(automatic)).result.state, "suspended");
  await app.message({ type: "RESUME", twitchLogin: "creator", keepTwitch: true });
  assert.equal(app.rules().length, 0);
  assert.equal((await app.message(automatic)).result.state, "cancelled");
  assert.equal((await app.message({ ...automatic, twitchLogin: "second" }, 2)).result.state, "suspended");
  app.local.autoSwitchRevision = "second";
  assert.equal((await app.message(automatic)).result.state, "suspended");
  app.local.autoSwitchToYouTube = false;
  await app.message({ type: "RESUME" });
  assert.equal((await app.message(automatic)).result.state, "cancelled");
  assert.equal((await app.message({ ...automatic, automatic: false })).result.state, "suspended", "manual playback still works");
  app.listeners.removed(1);
  assert.equal(app.session["twitchOverride:1"], undefined);
});
