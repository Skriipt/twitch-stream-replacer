import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const config = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../background.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");

function worker() {
  let listener;
  const tabs = new Map([[1, "https://www.twitch.tv/stylerz"], [2, "https://www.twitch.tv/colthavok"]]);
  const states = new Map([[1, "not-subscribed"], [2, "not-subscribed"]]);
  const rules = [];
  const injections = [];
  let injection;
  const chrome = {
    runtime: { id: "extension", onMessage: { addListener: (fn) => { listener = fn; } } },
    tabs: {
      get: async (id) => ({ id, url: tabs.get(id) }),
      onUpdated: { addListener() {} }, onRemoved: { addListener() {} },
    },
    scripting: { executeScript: async (options) => {
      injections.push(options);
      if (injection) return injection(options);
      return [{ frameId: 0, result: { state: states.get(options.target.tabId), twitchLogin: options.args[0] } }];
    } },
    declarativeNetRequest: {
      getSessionRules: async () => [...rules],
      updateSessionRules: async ({ removeRuleIds, addRules }) => {
        for (let index = rules.length - 1; index >= 0; index--) if (removeRuleIds.includes(rules[index].id)) rules.splice(index, 1);
        rules.push(...addRules);
      },
    },
  };
  vm.runInNewContext(`${config}\n${source}`, { chrome, URL, detectSubscription() {} });
  function message(type, tabId = 1, twitchLogin = tabId === 1 ? "stylerz" : "colthavok", overrides = {}) {
    return new Promise((resolve) => {
      const retained = listener({ type, twitchLogin }, {
        id: "extension", frameId: 0, tab: { id: tabId }, url: "https://www.twitch.tv/stylerz", ...overrides,
      }, resolve);
      if (!retained) resolve(undefined);
    });
  }
  return { message, tabs, states, rules, injections, inject(fn) { injection = fn; } };
}

test("subscription check is scoped to the current top-level Twitch tab", async () => {
  const w = worker();
  const reply = await w.message("SUBSCRIPTION");
  assert.equal(reply.result.state, "not-subscribed");
  assert.equal(typeof reply.result.checkedAt, "number");
  assert.equal(w.injections[0].world, "MAIN");
  assert.deepEqual(Array.from(w.injections[0].target.frameIds), [0]);
  for (const sender of [{ frameId: 1 }, { id: "foreign" }, { url: "https://example.com" }]) {
    assert.equal(await w.message("SUBSCRIPTION", 1, "stylerz", sender), undefined);
  }
  assert.equal(w.injections.length, 1);
});

test("subscribers and unknown states cannot create blocking rules", async () => {
  for (const state of ["subscribed", "unknown", undefined, "unexpected"]) {
    const w = worker();
    w.states.set(1, state);
    assert.equal((await w.message("SUSPEND")).ok, false);
    assert.equal(w.rules.length, 0);
  }
});

test("missing/failed/mismatched script results remain unknown", async () => {
  for (const inject of [async () => { throw new Error("injection failed"); }, async () => [],
    async () => [{ frameId: 0, result: { state: "not-subscribed", twitchLogin: "colthavok" } }]]) {
    const w = worker();
    w.inject(inject);
    assert.equal((await w.message("SUBSCRIPTION")).result.state, "unknown");
    assert.equal((await w.message("SUSPEND")).ok, false);
    assert.equal(w.rules.length, 0);
  }
});

test("navigation during detection cannot suspend the next channel", async () => {
  const w = worker();
  w.inject(async () => {
    w.tabs.set(1, "https://www.twitch.tv/colthavok");
    return [{ frameId: 0, result: { state: "not-subscribed", twitchLogin: "stylerz" } }];
  });
  assert.equal((await w.message("SUSPEND")).ok, false);
  assert.equal(w.rules.length, 0);
});

test("SUSPEND rechecks instead of trusting the earlier negative result", async () => {
  const w = worker();
  assert.equal((await w.message("SUBSCRIPTION")).result.state, "not-subscribed");
  w.states.set(1, "subscribed");
  assert.equal((await w.message("SUSPEND")).ok, false);
  assert.equal(w.rules.length, 0);
});

test("two tabs remain independent; RESUME works even when detection fails", async () => {
  const w = worker();
  const results = await Promise.all([w.message("SUSPEND", 1), w.message("SUSPEND", 2)]);
  assert.ok(results.every((reply) => reply.ok));
  assert.equal(w.rules.length, 2);
  assert.notEqual(w.rules[0].id, w.rules[1].id);
  w.inject(async () => { throw new Error("failed"); });
  assert.equal((await w.message("RESUME", 1)).ok, true);
  assert.equal(w.rules.length, 1);
  assert.equal(w.rules[0].condition.tabIds[0], 2);
});
