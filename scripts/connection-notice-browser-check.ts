import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";

const output = fileURLToPath(new URL("../artifacts/connection-notice-review/", import.meta.url));
await mkdir(output, { recursive: true });
const store = new WorkspaceStore(createTestData());
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 837, height: 1132 }, colorScheme: "dark" });
const errors: string[] = [];

await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/v1/auth/session") {
    await route.fulfill({ json: {
      user: { id: "user-maya", username: "maya", email: "maya@example.test" },
      setupRequired: false,
      registration: { enabled: false, invitationRequired: true },
      magicLinkEnabled: false,
      corporateIdentity: store.getCorporateIdentity(),
    } });
  } else if (path === "/v1/bootstrap") {
    await route.fulfill({ json: store.getBootstrap("user-maya") });
  } else if (path === "/v1/me/game-guide") {
    await route.fulfill({ json: { status: null } });
  } else {
    await route.fulfill({ status: 404, json: { error: "Unexpected request" } });
  }
});
await context.routeWebSocket(/\/v1\/realtime/, (socket) => socket.close());

const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  const notice = page.locator(".connection-notice.offline");
  await notice.waitFor();
  assert.equal(await notice.textContent(), "Connection unavailable");
  await page.getByRole("button", { name: "Close daily bonus" }).click();

  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const viewport of [{ width: 837, height: 1132 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const geometry = await notice.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const header = document.querySelector(".top-bar")!.getBoundingClientRect();
        const dock = document.querySelector(".control-dock")?.getBoundingClientRect();
        const zoom = document.querySelector(".world-zoom-controls")?.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
          headerBottom: header.bottom, dockTop: dock?.top,
          overlapsZoom: zoom ? bounds.left < zoom.right && bounds.right > zoom.left && bounds.top < zoom.bottom && bounds.bottom > zoom.top : false,
          visibleAtCenter: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
          viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: element.scrollWidth > element.clientWidth + 1 };
      });
      assert(geometry.left >= 0 && geometry.right <= geometry.viewportWidth && geometry.top > geometry.headerBottom
        && geometry.bottom < (geometry.dockTop ?? geometry.viewportHeight) && geometry.visibleAtCenter
        && !geometry.overflow && !geometry.overlapsZoom,
        JSON.stringify(geometry));
      await page.screenshot({ path: `${output}/${theme}-${viewport.width}x${viewport.height}.png`, animations: "disabled" });
    }
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await page.setViewportSize({ width: 837, height: 1132 });
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.locator(".side-panel").waitFor();
  assert(await notice.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  }));
  await page.screenshot({ path: `${output}/dark-837x1132-panel.png`, animations: "disabled" });
  let resumeSettingsLoad!: () => void;
  const settingsLoad = new Promise<void>((resolve) => { resumeSettingsLoad = resolve; });
  await page.route("**/src/components/SettingsPanel.tsx*", async (route) => {
    await settingsLoad;
    await route.continue();
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".deferred-content-status").waitFor();
  assert(await notice.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  }));
  await page.screenshot({ path: `${output}/dark-837x1132-loading-panel.png`, animations: "disabled" });
  resumeSettingsLoad();
  assert.deepEqual(errors, []);
  process.stdout.write(`Connection notice checked across dark/light desktop and mobile layouts. Screenshots: ${output}\n`);
} finally {
  await browser.close();
}
