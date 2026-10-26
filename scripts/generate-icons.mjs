import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const svg = await readFile(new URL("../assets/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`../assets/icon-${size}.png`, import.meta.url)), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
