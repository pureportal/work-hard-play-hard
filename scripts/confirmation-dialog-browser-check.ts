import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { createOrganisation, createPublicEconomy, type ClientCommand } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { installBuiltAssetClient } from "./world-assets/built-client.js";

const output = fileURLToPath(new URL("../artifacts/confirmation-dialog/", import.meta.url));
await mkdir(output, { recursive: true });
const data = createTestData();
data.organisation = { ...createOrganisation(), ceoIds: ["user-maya"] };
data.publicEconomy = createPublicEconomy("hierarchical");
const store = new WorkspaceStore(data);
store.purchaseAsset("user-maya", "chair-office", "confirmation-chair");
store.purchaseAsset("user-maya", "plant-floor", "confirmation-plant");
const salePrice = Math.floor(store.getPlayerEconomy("user-maya").inventory.find((asset) => asset.assetId === "chair-office")!.purchasePrice / 3);
const runtime = new WorldRuntime(store);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
const commands: ClientCommand[] = [];
const errors: string[] = [];
const checks: string[] = [];
await installBuiltAssetClient(context, "artifacts/confirmation-dialog/client");
await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/v1/auth/session") await route.fulfill({ json: {
    user: { id: "user-maya", username: "maya", email: "maya@example.test" }, setupRequired: false,
    registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity(),
  } });
  else if (path === "/v1/bootstrap") await route.fulfill({ json: store.getBootstrap("user-maya") });
  else await route.fulfill({ status: 404, json: { error: "Unexpected confirmation test request" } });
});
await context.routeWebSocket(/\/v1\//, (socket) => {
  const peer = runtime.connect("user-maya", "floor-studio", (event) => {
    if (event.type === "command.error") errors.push(event.message);
    socket.send(JSON.stringify(event));
  });
  socket.onMessage((message) => {
    const command = clientCommandSchema.parse(JSON.parse(String(message)));
    commands.push(command);
    runtime.handleCommand(peer, command);
  });
  socket.onClose(() => runtime.disconnect(peer));
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("dialog", async (dialog) => { errors.push(`Browser dialog: ${dialog.message()}`); await dialog.dismiss(); });
runtime.start();

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Personal", exact: true }).click();
  const saleTrigger = page.getByRole("button", { name: `Sell Office chair for ${salePrice} coins`, exact: true });
  await saleTrigger.click();
  const sale = page.getByRole("dialog", { name: "Sell Office chair?" });
  await sale.waitFor();
  assert(await sale.evaluate((dialog) => dialog.matches(":modal")));
  assert(await sale.getByRole("button", { name: "Cancel", exact: true }).evaluate((button) => document.activeElement === button));
  for (const key of ["Tab", "Tab", "Shift+Tab", "Shift+Tab", "Tab", "Tab"]) {
    await page.keyboard.press(key);
    assert(await sale.evaluate((dialog) => dialog.contains(document.activeElement)));
  }
  await page.keyboard.press("Escape");
  await sale.waitFor({ state: "hidden" });
  assert(await saleTrigger.evaluate((button) => document.activeElement === button));
  assert(!commands.some((command) => command.type === "economy.sell_asset"));
  await saleTrigger.click();
  await sale.getByRole("button", { name: "Cancel", exact: true }).click();
  assert(!commands.some((command) => command.type === "economy.sell_asset"));
  await saleTrigger.click();
  const balance = store.getPlayerEconomy("user-maya").coinBalance;
  await sale.getByRole("button", { name: "Sell item", exact: true }).click();
  await sale.waitFor({ state: "hidden" });
  assert.equal(store.getPlayerEconomy("user-maya").coinBalance, balance + salePrice);
  assert.equal(commands.filter((command) => command.type === "economy.sell_asset").length, 1);
  checks.push("Sale waits for confirmation; Cancel and Escape preserve inventory, Tab stays in the dialog, and focus returns to the trigger.");

  const donateTrigger = page.getByRole("button", { name: "Donate", exact: true });
  const donation = page.getByRole("dialog", { name: "Donate Floor plant?" });
  await donateTrigger.click();
  await page.keyboard.press("Enter");
  await donation.waitFor({ state: "hidden" });
  assert.equal(store.getPublicEconomy().inventory.length, 0);
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 640, height: 320 }]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await donateTrigger.click();
      await page.setViewportSize(viewport);
      const measurements = await donation.evaluate((dialog) => {
        const box = dialog.getBoundingClientRect();
        const style = getComputedStyle(dialog);
        return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, overflow: dialog.scrollWidth > dialog.clientWidth,
          color: style.color, background: style.backgroundColor, panel: getComputedStyle(document.documentElement).getPropertyValue("--panel").trim() };
      });
      assert(measurements.x >= 0 && measurements.y >= 0 && measurements.right <= viewport.width && measurements.bottom <= viewport.height);
      assert(!measurements.overflow);
      assert.notEqual(measurements.color, measurements.background);
      await page.screenshot({ path: `${output}/donate-${theme}-${viewport.width}.png` });
      await page.mouse.click(2, 2);
      assert(await donation.isVisible());
      await page.keyboard.press("Escape");
      await donation.waitFor({ state: "hidden" });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await donateTrigger.click();
  await donation.getByRole("button", { name: "Donate item", exact: true }).click();
  await donation.waitFor({ state: "hidden" });
  assert.equal(store.getPublicEconomy().inventory.length, 1);
  assert.equal(commands.filter((command) => command.type === "economy.donate_asset").length, 1);
  checks.push("Asset donation uses the same modal in both themes on desktop, mobile and short screens; Enter defaults to Cancel and backdrop clicks cannot confirm.");

  await page.getByRole("button", { name: "Funds & votes", exact: true }).click();
  await page.getByRole("tab", { name: "Donate", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Donation", exact: true }).fill("25");
  await page.getByRole("button", { name: "Review donation", exact: true }).click();
  const coinDonation = page.getByRole("dialog", { name: "Donate 25 coins to Workspace?" });
  await coinDonation.waitFor();
  await page.keyboard.press("Escape");
  await coinDonation.waitFor({ state: "hidden" });
  assert(await page.getByRole("dialog", { name: "Funds & votes", exact: true }).isVisible());
  assert(!commands.some((command) => command.type === "economy.donate"));
  await page.getByRole("button", { name: "Review donation", exact: true }).click();
  await coinDonation.getByRole("button", { name: "Donate coins", exact: true }).click();
  await coinDonation.waitFor({ state: "hidden" });
  assert.equal(store.getPublicEconomy().funds[0]!.balance, 25);
  await page.getByRole("button", { name: "Close funds & votes", exact: true }).click();
  checks.push("Coin donation confirms above its parent dialog; Escape dismisses only the confirmation.");

  await page.getByRole("button", { name: "Organisation", exact: true }).click();
  await page.getByRole("button", { name: "Leo Martins", exact: true }).click();
  await page.getByRole("button", { name: "Promote to CEO", exact: true }).click();
  const promotion = page.getByRole("dialog", { name: "Promote Leo Martins to CEO?" });
  await promotion.waitFor();
  const commandCount = commands.length;
  await page.keyboard.press("1");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("r");
  assert.equal(commands.length, commandCount);
  await page.keyboard.press("Escape");
  await promotion.waitFor({ state: "hidden" });
  assert(!store.getOrganisation().ceoIds.includes("user-leo"));
  assert(await page.getByRole("complementary", { name: "Organisation", exact: true }).isVisible());
  await page.getByRole("button", { name: "Promote to CEO", exact: true }).click();
  await promotion.getByRole("button", { name: "Promote to CEO", exact: true }).click();
  await promotion.waitFor({ state: "hidden" });
  await page.getByRole("region", { name: "CEOs", exact: true }).getByText("Leo Martins", { exact: true }).waitFor();
  assert(store.getOrganisation().ceoIds.includes("user-leo"));
  checks.push("CEO promotion requires explicit confirmation, preserves the panel on cancellation, and blocks background game shortcuts.");
  await writeFile(`${output}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(checks.join("\n"));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile(`${output}/failure.txt`, `${String(error)}\n${await page.locator("body").innerText()}\n${JSON.stringify(errors)}`);
  throw error;
} finally {
  runtime.stop();
  await browser.close();
}
