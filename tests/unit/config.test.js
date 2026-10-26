import test from "node:test";
import assert from "node:assert/strict";
import "../../extension/config.js";
import { CHANNEL } from "../fixtures.js";
const config = globalThis.StylerzBridgeConfig;

test("recognizes new Twitch creators and keeps configured identities", () => {
  assert.equal(config.channelForUrl("https://www.twitch.tv/Some_Creator/").twitchLogin, "some_creator");
  assert.equal(config.channelForUrl("https://www.twitch.tv/some_creator/about").twitchLogin, "some_creator");
  assert.equal(config.channelForUrl("https://www.twitch.tv/stylerz").channelId, config.channels[0].channelId);
});
test("excludes non-channel routes and foreign origins", () => {
  for (const url of ["https://www.twitch.tv/directory", "https://www.twitch.tv/videos/123", "https://www.twitch.tv/settings", "https://www.twitch.tv/creator/videos", "https://evil.test/creator", "invalid"]) {
    assert.equal(config.channelForUrl(url), null, url);
  }
});
test("normalizes handle, ID and legacy channel URLs and drops tracking", () => {
  for (const [input, expected] of [
    ["https://youtube.com/@creator?si=abc", "https://www.youtube.com/@creator/streams"],
    ["https://m.youtube.com/@creator/live", "https://www.youtube.com/@creator/streams"],
    [`https://www.youtube.com/channel/${CHANNEL}/videos`, `https://www.youtube.com/channel/${CHANNEL}/streams`],
    ["https://www.youtube.com/c/Creator", "https://www.youtube.com/c/Creator/streams"],
    ["https://www.youtube.com/user/Creator/", "https://www.youtube.com/user/Creator/streams"],
    ["https://www.youtube.com/Creator", "https://www.youtube.com/Creator/streams"],
    ["https://www.youtube.com/@%E6%97%A5%E6%9C%AC", "https://www.youtube.com/@%E6%97%A5%E6%9C%AC/streams"],
  ]) assert.equal(config.youtubeChannelUrl(input), expected);
});
test("rejects videos, lookalike hosts, credentials and arbitrary fetch targets", () => {
  for (const input of ["https://youtube.com.evil.test/@creator", "https://www.youtube.com/watch?v=abcdefghijk", "https://youtu.be/abcdefghijk", "http://www.youtube.com/@creator", "https://user@www.youtube.com/@creator", "https://www.youtube.com:123/@creator", "https://www.youtube.com/redirect?q=https://evil.test", "https://www.youtube.com/@creator/unknown", "https://www.youtube.com/channel/invalid", "javascript:alert(1)"]) {
    assert.equal(config.youtubeChannelUrl(input), null, input);
  }
});
