import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { extractJson, findLiveCandidates, validateLivePlayer, discoverLiveStream } from "../resolver.js";
import { CHANNEL, SECOND_CHANNEL, VIDEO, SECOND_VIDEO, listing, player, pageJson, profileUrl, publicResponse } from "./fixtures.js";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const creator = { twitchLogin: "creator", displayName: "Creator" };
function serve(routes) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(routes[url], `Unexpected request: ${url}`);
    return publicResponse(url, routes[url]);
  };
  return calls;
}
function liveRoutes(url = profileUrl, channel = CHANNEL, video = VIDEO) {
  return { [url]: pageJson("ytInitialData", listing(channel, [video])),
    [`https://www.youtube.com/watch?v=${video}`]: pageJson("ytInitialPlayerResponse", player(channel, video)) };
}

test("reads JSON literals with nested braces and escaped strings without executing scripts", () => {
  const data = { text: 'quote: " brace: } slash: \\', nested: { value: 1 } };
  assert.deepEqual(extractJson(pageJson("ytInitialData", data), "ytInitialData"), data);
  assert.equal(extractJson("var ytInitialData = alert('unsafe')", "ytInitialData"), null);
});
test("requires machine-readable live badges and exact channel ownership", () => {
  assert.deepEqual(findLiveCandidates(listing(), { channelId: CHANNEL }), [VIDEO]);
  assert.deepEqual(findLiveCandidates(listing(CHANNEL, []), { channelId: CHANNEL }), []);
  assert.throws(() => findLiveCandidates(listing(), { channelId: SECOND_CHANNEL }), /bestätigt/);
});
test("excludes ended, upcoming, foreign and non-embeddable broadcasts", () => {
  assert.equal(validateLivePlayer(player(CHANNEL, VIDEO, { microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true, endTimestamp: "2026-10-26" } } } }), { channelId: CHANNEL }), null);
  assert.equal(validateLivePlayer(player(CHANNEL, VIDEO, { microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: false } } } }), { channelId: CHANNEL }), null);
  assert.throws(() => validateLivePlayer(player(), { channelId: SECOND_CHANNEL }), /bestätigten/);
  assert.throws(() => validateLivePlayer(player(CHANNEL, VIDEO, { playabilityStatus: { status: "OK", playableInEmbed: false } }), { channelId: CHANNEL }), /eingebettet/);
});
test("discovers an unconfigured creator through a profile link and validates the watch page", async () => {
  const calls = serve(liveRoutes());
  const result = await discoverLiveStream(creator, [profileUrl, "https://youtube.com/@creator?tracking=1"]);
  assert.equal(result.state, "live");
  assert.equal(result.videoId, VIDEO);
  assert.equal(result.channelId, CHANNEL);
  assert.equal(result.source, "profile");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, "include");
});
test("no profile link is unlinked, not an invented same-name channel", async () => {
  const calls = serve({});
  assert.deepEqual(await discoverLiveStream(creator, []), { state: "unlinked" });
  assert.deepEqual(await discoverLiveStream(creator, ["https://evil.test/@creator"]), { state: "unlinked" });
  assert.equal(calls.length, 0);
});
test("offline channel keeps a confirmed direct channel link", async () => {
  serve({ [profileUrl]: pageJson("ytInitialData", listing(CHANNEL, [])) });
  const result = await discoverLiveStream(creator, [profileUrl]);
  assert.equal(result.state, "offline");
  assert.equal(result.youtubeStreams, `https://www.youtube.com/channel/${CHANNEL}/streams`);
});
test("two linked channels with active streams stay ambiguous", async () => {
  const secondUrl = "https://www.youtube.com/@second/streams";
  serve({ ...liveRoutes(), ...liveRoutes(secondUrl, SECOND_CHANNEL, SECOND_VIDEO) });
  assert.deepEqual(await discoverLiveStream(creator, [profileUrl, secondUrl]), { state: "ambiguous" });
});
test("one live among multiple checked channels is found; aliases are deduplicated by channel ID", async () => {
  const secondUrl = "https://www.youtube.com/@second/streams";
  serve({ ...liveRoutes(), [secondUrl]: pageJson("ytInitialData", listing(SECOND_CHANNEL, [])) });
  assert.equal((await discoverLiveStream(creator, [profileUrl, secondUrl])).videoId, VIDEO);
  serve({ ...liveRoutes(), [secondUrl]: pageJson("ytInitialData", listing()) });
  assert.equal((await discoverLiveStream(creator, [profileUrl, secondUrl])).state, "live");
});
test("rejects watch-page substitutions and configured-channel identity changes", async () => {
  serve({ ...liveRoutes(), [`https://www.youtube.com/watch?v=${VIDEO}`]: pageJson("ytInitialPlayerResponse", player(CHANNEL, SECOND_VIDEO)) });
  await assert.rejects(discoverLiveStream(creator, [profileUrl]), /anderen Stream/);
  serve(liveRoutes());
  await assert.rejects(discoverLiveStream({ ...creator, channelId: SECOND_CHANNEL, youtubeStreams: profileUrl }), /bestätigt/);
});
test("does not silently pick a stream when another linked channel fails", async () => {
  serve({ ...liveRoutes(), "https://www.youtube.com/@broken/streams": "<html>consent</html>" });
  await assert.rejects(discoverLiveStream(creator, [profileUrl, "https://www.youtube.com/@broken"]), /gelesen/);
});
test("caps profile requests and rejects consent or network failures", async () => {
  const calls = serve({});
  await assert.rejects(discoverLiveStream(creator, Array.from({ length: 6 }, (_, i) => `https://youtube.com/@creator${i}`)), /Zu viele/);
  assert.equal(calls.length, 0);
  globalThis.fetch = async () => publicResponse("https://consent.youtube.com/", "consent");
  await assert.rejects(discoverLiveStream(creator, [profileUrl]), /Bestätigung/);
  globalThis.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(discoverLiveStream(creator, [profileUrl]), /nicht erreichbar/);
});
