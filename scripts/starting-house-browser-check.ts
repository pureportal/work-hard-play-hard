import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { createStartingHouse } from "../apps/server/src/world/starting-house.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { synchronizeRoomMeetings } from "../apps/server/src/meetings/room-meetings.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(root, "apps/client/dist");
const output = resolve(root, "artifacts/starting-house");
const userId = "user-maya";
const house = createStartingHouse();
const data = createTestData();
data.floors = [house.floor];
data.layouts = [house.layout];
data.members = data.members.filter(member => member.id === userId);
data.members[0]!.floorId = house.floor.id;
data.members[0]!.position = house.floor.spawn;
data.meetings = [];
synchronizeRoomMeetings([], house.layout.rooms, data.meetings, data.conversations);
const store = new WorkspaceStore(data);
store.claimDailyReward(userId, "starting-house-review");
const runtime = new WorldRuntime(store);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const mime: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".webp": "image/webp", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
};
await mkdir(output, { recursive: true });
runtime.start();
try {
  for (const scenario of [
    { name: "desktop-light", width: 1440, height: 1100, theme: "light" },
    { name: "desktop-dark", width: 1440, height: 1100, theme: "dark" },
    { name: "mobile", width: 390, height: 844, theme: "light" },
  ]) {
    const context = await browser.newContext({ viewport: scenario });
    await context.addInitScript(theme => localStorage.setItem("northstar-color-theme", theme), scenario.theme);
    await context.route("**/*", async route => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, PUT" } });
      } else if (path === "/v1/auth/session") {
        await route.fulfill({ headers, json: { user: { id: userId, username: userId, email: "review@example.test" }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
      } else if (path === "/v1/bootstrap") {
        await route.fulfill({ headers, json: store.getBootstrap(userId) });
      } else if (path === "/v1/me/game-guide") {
        await route.fulfill({ headers, json: { status: "completed" } });
      } else if (path.startsWith("/v1/")) {
        errors.push(`Unexpected request: ${path}`);
        await route.fulfill({ status: 404, headers, json: { error: "Unexpected review request" } });
      } else {
        const file = resolve(distribution, path === "/" ? "index.html" : path.slice(1));
        assert(file.startsWith(`${distribution}${sep}`));
        await route.fulfill({ contentType: mime[extname(file)] ?? "application/octet-stream", body: await readFile(file) });
      }
    });
    await context.routeWebSocket(/\/v1\//, socket => {
      const peer = runtime.connect(userId, house.floor.id, event => socket.send(JSON.stringify(event)));
      socket.onMessage(message => runtime.handleCommand(peer, clientCommandSchema.parse(JSON.parse(String(message)))));
      socket.onClose(() => runtime.disconnect(peer));
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("http://localhost/", { waitUntil: "networkidle" });
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await page.locator(".world-canvas canvas").waitFor();
    const closePeople = page.getByRole("button", { name: "Close people", exact: true });
    if (await closePeople.isVisible()) await closePeople.click();
    if (scenario.name === "mobile") {
      for (let step = 0; step < 4; step++) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    }
    await page.waitForTimeout(1200);
    assert.equal(await page.locator(".world-artwork-error").count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `${scenario.name}.png`) });
    await page.locator(".world-canvas canvas").screenshot({ path: resolve(output, `${scenario.name}-world.png`) });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`Starter house rendered in desktop light, desktop dark, and mobile views: ${output}`);
} finally {
  runtime.stop();
  await browser.close();
}
