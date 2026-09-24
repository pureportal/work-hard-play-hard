import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";

const output = fileURLToPath(new URL("../artifacts/build-browser/", import.meta.url));
await mkdir(output, { recursive: true });
const store = new WorkspaceStore(createTestData());
const runtime = new WorldRuntime(store);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
const userId = "user-maya";

await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
  } else if (path === "/v1/auth/session") {
    await route.fulfill({ headers, json: { user: { id: userId, username: "maya", email: "maya@example.test" }, setupRequired: false,
      registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
  } else if (path === "/v1/bootstrap") {
    await route.fulfill({ headers, json: store.getBootstrap(userId) });
  } else if (path === "/v1/me/game-guide") {
    await route.fulfill({ headers, json: { status: "completed" } });
  } else {
    await route.fulfill({ headers, status: 404, json: { error: "Unexpected request" } });
  }
});

await context.routeWebSocket(/\/v1\//, (socket) => {
  const peer = runtime.connect(userId, "floor-studio", (event) => socket.send(JSON.stringify(event)));
  socket.onMessage((message) => runtime.handleCommand(peer, clientCommandSchema.parse(JSON.parse(String(message)))));
  socket.onClose(() => runtime.disconnect(peer));
});

const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
runtime.start();

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const closeBonus = page.getByRole("button", { name: "Close daily bonus", exact: true });
  if (await closeBonus.isVisible()) await closeBonus.click();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  const shared = page.locator(".build-layout-panel");
  await shared.getByRole("textbox", { name: "Search assets" }).fill("crystal");
  await shared.getByRole("button", { name: "Crystal floor lamp" }).waitFor();
  assert.equal(await shared.getByRole("tab", { name: "All" }).getAttribute("aria-selected"), "true");
  await shared.getByRole("button", { name: "Crystal floor lamp" }).click();
  assert.equal(await shared.getByRole("button", { name: "Crystal floor lamp" }).getAttribute("aria-pressed"), "true");
  await page.screenshot({ path: `${output}/shared-desktop.png` });

  await page.getByRole("button", { name: "Personal", exact: true }).click();
  const personal = page.locator(".player-build-panel");
  await personal.getByRole("tab", { name: "Shop" }).click();
  await personal.getByRole("textbox", { name: "Search assets" }).fill("crystal");
  await personal.getByRole("button", { name: /Crystal floor lamp/ }).waitFor();
  await page.screenshot({ path: `${output}/personal-shop-desktop.png` });
  await personal.getByRole("tab", { name: "Inventory" }).click();
  assert.equal(await personal.getByRole("textbox", { name: "Search assets" }).isVisible(), true);
  await personal.getByRole("textbox", { name: "Search assets" }).fill("chair");
  assert.equal(await personal.locator(".inventory-asset").count(), 1);
  await personal.getByRole("button", { name: "Clear search" }).click();
  await page.screenshot({ path: `${output}/personal-inventory-desktop.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/personal-inventory-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  const inventoryResults = personal.locator(".player-inventory-view .asset-browser-results");
  const inventoryScroll = await inventoryResults.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight };
  });
  assert(inventoryScroll.height <= inventoryScroll.viewport || inventoryScroll.top > 0);
  await personal.getByRole("tab", { name: "Shop" }).click();
  await page.screenshot({ path: `${output}/personal-shop-mobile.png` });
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await page.screenshot({ path: `${output}/shared-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.getByRole("button", { name: "Use dark mode" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({ path: `${output}/shared-mobile-dark.png` });
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  await personal.getByRole("tab", { name: "Shop" }).click();
  await page.screenshot({ path: `${output}/personal-shop-mobile-dark.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", artifacts: output }));
} finally {
  await context.close();
  runtime.stop();
  await browser.close();
}
