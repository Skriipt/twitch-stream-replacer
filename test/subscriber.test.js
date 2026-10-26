import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../subscriber.js", import.meta.url), "utf8").replace("export ", "");

function detect({ data, extra = [], pathname = "/stylerz", origin = "https://www.twitch.tv", stale = false, missingPlayer = false, missingReact = false, detached = false } = {}) {
  const player = {};
  const current = { stateNode: {}, child: { stateNode: player, memoizedProps: {} } };
  let fiber = current.child;
  for (const entry of [data, ...extra]) {
    fiber.sibling = { memoizedProps: { data: entry } };
    fiber = fiber.sibling;
  }
  const root = stale ? { child: { memoizedProps: { data: subscribed() } } } : current;
  root.stateNode = { current };
  player.__reactFiber$test = { return: root };
  if (missingReact) delete player.__reactFiber$test;
  if (detached) current.child.stateNode = {};
  const context = vm.createContext({
    location: { origin, pathname },
    document: { querySelector: () => missingPlayer ? null : player },
  });
  return JSON.parse(JSON.stringify(vm.runInContext(`${source}\ndetectSubscription("stylerz")`, context)));
}

const subscribed = (benefit = { id: "benefit" }) => ({
  currentUser: { id: "viewer" }, user: { login: "stylerz", self: { subscriptionBenefit: benefit } },
});

test("active subscription is detected without depending on tier or payment method", () => {
  for (const detail of [{ tier: "1000" }, { tier: "2000" }, { tier: "3000" }, { purchasedWithPrime: true }, { isGift: true }, { renewsAt: null }]) {
    assert.equal(detect({ data: subscribed({ id: "benefit", ...detail }) }).state, "subscribed");
  }
});

test("only an explicit null benefit means no subscription for a signed-in viewer", () => {
  assert.deepEqual(detect({ data: subscribed(null) }), { state: "not-subscribed", twitchLogin: "stylerz" });
  for (const benefit of [undefined, false, {}, { id: "" }]) {
    const data = subscribed();
    data.user.self.subscriptionBenefit = benefit;
    assert.equal(detect({ data }).state, "unknown");
  }
  const missing = subscribed();
  delete missing.user.self.subscriptionBenefit;
  assert.equal(detect({ data: missing }).state, "unknown");
});

test("loaded signed-out data is negative, stale logout data remains unknown", () => {
  assert.equal(detect({ data: { currentUser: null, user: { login: "stylerz", self: null } } }).state, "not-subscribed");
  assert.equal(detect({ data: { ...subscribed(), currentUser: null } }).state, "unknown");
});

test("partial, failed, or absent data never becomes a negative result", () => {
  for (const data of [undefined, {}, { user: subscribed().user }, { ...subscribed(), currentUser: undefined },
    { ...subscribed(), loading: true }, { ...subscribed(), error: {} }, { ...subscribed(), errors: [{}] },
    { currentUser: { id: "viewer" }, user: { login: "stylerz", self: null } }]) {
    assert.equal(detect({ data }).state, "unknown");
  }
});

test("current route and broadcaster must both match", () => {
  for (const options of [{ pathname: "/colthavok" }, { pathname: "/stylerz/videos" }, { origin: "https://example.com" },
    { data: { ...subscribed(), user: { ...subscribed().user, login: "colthavok" } } }]) {
    assert.equal(detect({ data: subscribed(), ...options }).state, "unknown");
  }
  assert.equal(detect({ pathname: "/STYLERZ/", data: subscribed() }).state, "subscribed");
  assert.equal(detect({ pathname: "/stylerz/about", data: subscribed() }).state, "subscribed");
  assert.equal(detect({ pathname: "/STYLERZ/about/", data: subscribed(null) }).state, "not-subscribed");
});

test("uses the committed tree rather than stale DOM fiber alternates", () => {
  assert.equal(detect({ data: subscribed(null), stale: true }).state, "not-subscribed");
});

test("missing React internals, detached players, and conflicting account data remain unknown", () => {
  for (const options of [{ missingPlayer: true }, { missingReact: true }, { detached: true },
    { extra: [subscribed(null)] }, { extra: [{ ...subscribed(), currentUser: { id: "other-viewer" } }] },
    { extra: [{ currentUser: null, user: { login: "stylerz" } }] }]) {
    assert.equal(detect({ data: subscribed(), ...options }).state, "unknown");
  }
});

test("foreign-channel benefits and global Prime/Turbo eligibility do not count as a channel subscription", () => {
  assert.equal(detect({ data: subscribed(null), extra: [{ ...subscribed(), user: { ...subscribed().user, login: "colthavok" } }] }).state, "not-subscribed");
  const data = subscribed(null);
  data.currentUser.hasTurbo = true;
  data.user.self.canPrimeSubscribe = true;
  assert.equal(detect({ data }).state, "not-subscribed");
});

test("traversal is bounded even on a malformed cyclic tree", () => {
  const player = {};
  const root = { stateNode: {} };
  root.stateNode.current = root;
  root.child = root;
  player.__reactFiber$test = root;
  const context = vm.createContext({ location: { origin: "https://www.twitch.tv", pathname: "/stylerz" }, document: { querySelector: () => player } });
  assert.equal(vm.runInContext(`${source}\ndetectSubscription("stylerz").state`, context), "unknown");
});
