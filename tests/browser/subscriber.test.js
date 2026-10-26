// Real MV3/MAIN-world smoke check against local response fixtures, not Twitch
// accounts. Included in `npm run test:browser` and `npm test`.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { subscriptionScript } from "../fixtures.js";

test("loaded extension guards subscriptions and restores Twitch through MAIN-world detection", async () => {
  const extension = fileURLToPath(new URL("../../extension/", import.meta.url));
  const profile = await mkdtemp(path.join(tmpdir(), "stream-bridge-test-"));
  let context;

  function fixture(state) {
    return `<!doctype html><html><body><div class="channel-root__player" style="position:relative;width:800px;height:450px"><video></video></div>
      ${subscriptionScript("stylerz", state)}</body></html>`;
  }

  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium", headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15_000 });
    // Keep the actual resolver, service worker, Chrome messaging, script injection
    // and network rules. Only replace external YouTube responses with fixtures.
    await worker.evaluate(() => {
      globalThis.fetch = async (url) => {
        const channelId = "UC6NBwF9A5P2ni8YRvVHgvsA";
        const data = url.includes("/watch?") ? {
          videoDetails: { videoId: "abcdefghijk", channelId, title: "Fixture live" },
          microformat: { playerMicroformatRenderer: { liveBroadcastDetails: { isLiveNow: true } } },
          playabilityStatus: { status: "OK", playableInEmbed: true },
        } : {
          metadata: { channelMetadataRenderer: { externalId: channelId } },
          contents: { videoRenderer: { videoId: "abcdefghijk", style: "LIVE" } },
        };
        const name = url.includes("/watch?") ? "ytInitialPlayerResponse" : "ytInitialData";
        const response = new Response(`var ${name} = ${JSON.stringify(data)};`);
        Object.defineProperty(response, "url", { value: url });
        return response;
      };
    });
    await context.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ body: "<!doctype html><title>Fixture player</title>", contentType: "text/html" }));

    const subscribed = await context.newPage();
    await subscribed.route("https://www.twitch.tv/stylerz", (route) => route.fulfill({ body: fixture("subscribed"), contentType: "text/html" }));
    await subscribed.goto("https://www.twitch.tv/stylerz");
    await subscribed.waitForFunction(() => document.querySelector("#stylerz-bridge-prototype")?.shadowRoot.querySelector("#subscription-status")?.textContent.includes("Aktives Kanal-Abo"));
    assert.equal(await subscribed.locator("#stylerz-bridge-prototype").locator("#watch").isDisabled(), true);
    assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
    console.log("PASS: subscribed viewer retains Twitch through real MAIN-world detection");

    let state = "not-subscribed";
    const viewer = await context.newPage();
    await viewer.route("https://www.twitch.tv/stylerz", (route) => route.fulfill({ body: fixture(state), contentType: "text/html" }));
    await viewer.goto("https://www.twitch.tv/stylerz");
    await viewer.waitForFunction(() => document.querySelector("#stylerz-bridge-prototype")?.shadowRoot.querySelector("#watch")?.disabled === false);
    await viewer.locator("#stylerz-bridge-prototype").locator("#watch").click();
    await viewer.waitForFunction(() => document.documentElement.hasAttribute("data-stream-bridge-active"));
    assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 1);
    console.log("PASS: nonsubscriber can replace playback and creates a tab-scoped network rule");

    state = "subscribed";
    const reloaded = viewer.waitForEvent("load");
    await viewer.evaluate(() => {
      window.setSubscription("subscribed");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await reloaded;
    await viewer.waitForFunction(() => document.querySelector("#stylerz-bridge-prototype")?.shadowRoot.querySelector("#subscription-status")?.textContent.includes("Aktives Kanal-Abo"));
    assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
    assert.equal(await viewer.locator("html").getAttribute("data-stream-bridge-active"), null);
    console.log("PASS: newly subscribed viewer restores Twitch and clears the network rule");

    state = "unknown";
    await viewer.reload();
    await viewer.waitForFunction(() => document.querySelector("#stylerz-bridge-prototype")?.shadowRoot.querySelector("#subscription-status")?.textContent.includes("noch unklar"));
    assert.equal(await viewer.locator("#stylerz-bridge-prototype").locator("#watch").isDisabled(), true);
    assert.equal((await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length, 0);
    console.log("PASS: unknown data prevents replacement in the loaded extension");
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
