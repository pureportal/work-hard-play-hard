import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import type { ClientCommand } from "../packages/shared/src/index.js";

const output = fileURLToPath(new URL("../artifacts/room-permissions/", import.meta.url));
await mkdir(output, { recursive: true });
const application = await createTestApplication({ fixture: true, spotifyConfig: null, githubConfig: null,
  clientUrl: "http://127.0.0.1:5173", clientOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:3001"] });
await application.app.ready();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];

try {
  const session = await application.auth.authenticate("maya", "northstar");
  assert(session);
  const user = application.auth.getUserFromSession(session.sessionToken)!;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
  await context.addCookies([{ name: "whph_session", value: session.sessionToken, url: "http://127.0.0.1", httpOnly: true }]);
  await context.addInitScript(() => localStorage.setItem("northstar.colorTheme", "dark"));
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/v1/me/game-guide" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "skipped" }) });
      return;
    }
    const response = await application.app.inject({ method: request.method() as "GET" | "PUT" | "POST" | "DELETE" | "OPTIONS", url: url.pathname + url.search,
      headers: request.headers(), payload: request.postDataBuffer() ?? undefined });
    await route.fulfill({ status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)])), body: response.rawPayload });
  });
  await context.routeWebSocket(/\/v1\/realtime/, (socket) => {
    const peer = application.runtime.connect(user.id, "floor-studio", (event) => socket.send(JSON.stringify(event)));
    socket.onMessage((message) => application.runtime.handleCommand(peer, clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand));
    socket.onClose(() => application.runtime.disconnect(peer));
  });

  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const dailyBonus = page.getByRole("dialog", { name: "Daily bonus" });
  if (await dailyBonus.count()) await dailyBonus.getByRole("button", { name: "Close daily bonus" }).click();
  const roomButton = page.getByRole("button", { name: "Room settings", exact: true });
  if (!await roomButton.isVisible()) await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Build", exact: true }).click();
  await roomButton.click();
  const dialog = page.getByRole("dialog", { name: "Room settings", exact: true });
  await dialog.getByRole("button", { name: "Product Studio", exact: true }).click();
  const access = dialog.getByRole("group", { name: "Access" });
  const build = dialog.getByRole("group", { name: "Build" });
  await access.getByRole("combobox", { name: "Access" }).selectOption("assigned");
  await access.getByText("People", { exact: true }).click();
  await access.getByRole("checkbox", { name: "Jonas Berg" }).check();
  await build.getByText("People", { exact: true }).click();
  assert.equal(await build.getByRole("checkbox", { name: "Jonas Berg" }).count(), 1);
  assert.equal(await build.getByRole("checkbox", { name: "Priya Nair" }).count(), 0);
  await page.screenshot({ path: `${output}/builder-filter.png` });

  await dialog.getByRole("combobox", { name: "Room owner" }).selectOption("user-jonas");
  const ownerBuilds = dialog.getByRole("combobox", { name: "Owner's builds" });
  await ownerBuilds.selectOption("direct");
  await dialog.getByText("The owner can furnish this room using its fund without a vote.").waitFor();
  await ownerBuilds.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/owner-direct.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await ownerBuilds.scrollIntoViewIfNeeded();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Room settings overflow the mobile viewport");
  const save = dialog.getByRole("button", { name: "Propose changes" });
  const saveBox = await save.boundingBox();
  assert(saveBox && saveBox.y >= 0 && saveBox.y + saveBox.height <= 844, "Save action is outside the mobile viewport");
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ checks: ["Builders limited to people with access", "Owner can choose direct furnishing", "Mobile dialog fits and save stays visible"], errors }, null, 2));
  console.log("Room permission Playwright checks passed.");
} finally {
  await browser.close();
  await application.app.close();
}
