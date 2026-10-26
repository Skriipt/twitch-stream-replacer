import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { CHANNEL, SECOND_CHANNEL, VIDEO, SECOND_VIDEO, listing, player, pageJson, profileUrl, subscriptionScript } from "./fixtures.js";

const extensionPath = fileURLToPath(new URL("../", import.meta.url));
let context;
let worker;
const root = "#stylerz-bridge-prototype";
const pages = new Set();
const errors = [];
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

before(async () => {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    viewport: { width: 1280, height: 800 },
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await context.route("https://www.twitch.tv/**", (route) => route.fulfill({ contentType: "text/html", body: fixture(new URL(route.request().url()).pathname.split("/")[1]) }));
  await context.route("https://www.youtube.com/embed/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body style='margin:0;background:black;color:white'>YouTube embed fixture</body></html>" }));
});
after(async () => { await context?.close(); });

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
  await expect(page.locator("html")).toHaveAttribute("data-stream-bridge-active", "");
  await expect(page.locator(".picture-by-picture-player")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Chat" })).toBeVisible();
  assert.equal(await page.locator("video").first().evaluate((video) => video.muted && video.paused), true);
  assert.equal((await sessionRules()).length, 1);
  const frameBox = await page.locator(`${root} iframe`).boundingBox();
  assert.equal(frameBox.width, 960);
  assert.equal(frameBox.height, 540);
  await page.locator(`${root} #menu`).click();
  await expect(page.locator(`${root} #back`)).toBeVisible();
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
  const popup = await context.newPage();
  const id = new URL(worker.url()).host;
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.getByRole("heading", { name: "Stream Bridge", exact: true })).toBeVisible();
  assert.equal(await popup.locator('a[href*="twitch.tv/stylerz"], a[href*="undefined"]').count(), 0);
  assert.equal(await popup.locator("body").evaluate((body) => body.scrollWidth), 320);
  if (process.env.STREAM_BRIDGE_ARTIFACTS) await popup.screenshot({ path: `${process.env.STREAM_BRIDGE_ARTIFACTS}/popup.png`, clip: { x: 0, y: 0, width: 320, height: 420 } });
  await popup.close();
  assert.deepEqual(errors, []);
});
