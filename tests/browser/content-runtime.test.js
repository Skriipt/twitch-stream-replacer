import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const scripts = await Promise.all(["config.js", "discovery.js", "content.js"].map((file) => readFile(new URL(`../../extension/${file}`, import.meta.url), "utf8")));
let browser;
before(async () => { browser = await chromium.launch({ channel: "chromium", headless: true }); });
after(async () => { await browser?.close(); });

test("startup without an extension runtime shows reload guidance instead of sendMessage errors", async () => {
  for (const chromeState of [null, {}, { runtime: {} }]) {
    const page = await browser.newPage();
    try {
      const errors = [];
      await page.addInitScript((state) => { window.chrome = state; }, chromeState);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://www.twitch.tv/**", (route) => route.fulfill({ contentType: "text/html", body:
        `<html><body><div class="channel-root__player" style="width:960px;height:540px"></div>${scripts.map((script) => `<script>${script}</script>`).join("")}</body></html>` }));
      await page.goto("https://www.twitch.tv/creator");
      assert.deepEqual(errors, []);
      await expect(page.locator("#stylerz-bridge-prototype #status")).toContainText("Twitch");
      assert.deepEqual(errors, []);
      await expect(page.locator("#stylerz-bridge-prototype #status")).not.toContainText("sendMessage");
      await expect(page.locator("#stylerz-bridge-prototype #watch")).toBeDisabled();
    } finally { await page.close(); }
  }
});

test("a runtime lost after startup gives reload guidance when checking again", async () => {
  for (const failure of ["missing", "invalidated", "disconnected"]) {
    const page = await browser.newPage();
    try {
      await page.addInitScript(() => {
        window.chrome = { runtime: { id: "test-extension", onMessage: { addListener() {} },
          sendMessage: async ({ type, twitchLogin }) => ({ ok: true, result: type === "SUBSCRIPTION"
            ? { state: "not-subscribed", twitchLogin } : { state: "unlinked" } }) } };
      });
      await page.route("https://www.twitch.tv/**", (route) => route.fulfill({ contentType: "text/html", body:
        `<html><body><div class="channel-root__player" style="width:960px;height:540px"></div>${scripts.map((script) => `<script>${script}</script>`).join("")}</body></html>` }));
      await page.goto("https://www.twitch.tv/creator");
      const status = page.locator("#stylerz-bridge-prototype #status");
      await expect(status).toContainText("Kein YouTube-Kanallink");
      await page.evaluate((failure) => {
        if (failure === "missing") delete window.chrome.runtime;
        else if (failure === "invalidated") window.chrome.runtime.sendMessage = () => { throw new Error("Extension context invalidated."); };
        else window.chrome.runtime.sendMessage = async () => { throw new Error("Could not establish connection. Receiving end does not exist."); };
      }, failure);
      await page.locator("#stylerz-bridge-prototype #check").click();
      await expect(status).toContainText("Erweiterung bitte neu laden und Twitch aktualisieren.");
      await expect(page.locator("#stylerz-bridge-prototype #watch")).toBeDisabled();
    } finally { await page.close(); }
  }
});
