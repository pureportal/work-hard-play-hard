import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../apps/client/node_modules/pixi.js";
import { createOrganisation, createPublicEconomy, DEFAULT_CHARACTER_APPEARANCE, getDefaultAssetVariantId, requireAssetDefinition, type ClientCommand, type WorldObject } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { installBuiltAssetClient } from "./world-assets/built-client.js";
import { installWorldProbe } from "./characters/playwright-animation.js";

const output = fileURLToPath(new URL("../artifacts/personal-assets/", import.meta.url));
await mkdir(output, { recursive: true });
const data = createTestData("user-jonas");
data.organisation = createOrganisation();
data.publicEconomy = createPublicEconomy();
data.gameSettings.roomBuild = { mode: "open", assignedPersonIds: [] };
data.layouts = data.floors.map((floor) => ({ floorId: floor.id, revision: 1, walls: [], openings: [], tiles: [], objects: [], rooms: [{
  id: `room-${floor.id}`, floorId: floor.id, name: floor.id === "floor-studio" ? "Lounge" : "Garden", color: "#fff", capacity: 20,
  bounds: { x: 0, y: 0, width: floor.width, height: floor.height }, footprint: [{ x: 0, y: 0, width: floor.width, height: floor.height }],
  boundary: [], doorIds: [], windowIds: [], privateEligible: false,
  access: { mode: "open", assignedPersonIds: [], knockable: false }, build: { mode: "open", assignedPersonIds: [] },
}] }));
data.members = data.members.filter((member) => ["user-jonas", "user-priya"].includes(member.id));
for (const member of data.members) {
  member.floorId = "floor-studio";
  member.position = { x: 200, y: 200 };
  member.character = { ...DEFAULT_CHARACTER_APPEARANCE };
}
const store = new WorkspaceStore(data);
store.claimDailyReward("user-jonas", "fixture-daily");
const placements = [
  { id: randomUUID(), floorId: "floor-studio", assetId: "plant-floor", x: 640, y: 480 },
  { id: randomUUID(), floorId: "floor-studio", assetId: "rug-woven", x: 448, y: 480 },
  { id: randomUUID(), floorId: "floor-rooftop", assetId: "plant-floor", x: 384, y: 320 },
];
for (const placement of placements) {
  const purchase = store.purchaseAsset("user-jonas", placement.assetId, `buy-${placement.id}`);
  const layout = structuredClone(store.getLayout(placement.floorId)!);
  layout.objects.push({ ...placement, rotation: 0, variantId: getDefaultAssetVariantId(requireAssetDefinition(placement.assetId)),
    ownerUserId: "user-jonas", ownedAssetId: purchase.transaction.ownedAssetId! });
  layout.revision += 1;
  store.replaceLayout(layout);
}
store.purchaseAsset("user-jonas", "decor-coffee", "buy-coffee");
const otherPurchase = store.purchaseAsset("user-priya", "chair-office", "buy-other-chair");
const studio = structuredClone(store.getLayout("floor-studio")!);
studio.objects.push({ id: "their-chair", floorId: studio.floorId, assetId: "chair-office", x: 720, y: 480, rotation: 0,
  variantId: "white", ownerUserId: "user-priya", ownedAssetId: otherPurchase.transaction.ownedAssetId! });
studio.objects.push({ id: "shared-chair", floorId: studio.floorId, assetId: "chair-office", x: 800, y: 480, rotation: 0, variantId: "white" });
studio.revision += 1;
store.replaceLayout(studio);

const runtime = new WorldRuntime(store);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
await installBuiltAssetClient(context, "artifacts/personal-assets/client");
const errors: string[] = [];
const commands: ClientCommand[] = [];
const checks: string[] = [];
await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/v1/auth/session") await route.fulfill({ json: { user: { id: "user-jonas", username: "jonas", email: "jonas@example.test" },
    setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
  else if (path === "/v1/bootstrap") await route.fulfill({ json: store.getBootstrap("user-jonas") });
  else await route.fulfill({ status: 404, json: { error: "Unexpected test request" } });
});
await context.routeWebSocket(/\/v1\//, (socket) => {
  const peer = runtime.connect("user-jonas", "floor-studio", (event) => {
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
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await installWorldProbe(page);
runtime.start();

async function focusItem(object: Pick<WorldObject, "id" | "assetId" | "floorId">) {
  const name = requireAssetDefinition(object.assetId).name;
  const floor = data.floors.find((candidate) => candidate.id === object.floorId)!;
  const room = data.layouts.find((candidate) => candidate.floorId === floor.id)!.rooms[0]!;
  const button = page.getByRole("button", { name: `Focus ${name} in ${room.name}, ${floor.name}`, exact: true });
  await button.click();
  await page.waitForFunction((id) => {
    const app = globalThis.avatarWorld as unknown as Application;
    return (app.stage.getChildByLabel(`world-asset:${id}`, true)?.scale.x ?? 0) > 1.02;
  }, object.id);
  const geometry = await page.evaluate((id) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const view = app.stage.getChildByLabel(`world-asset:${id}`, true)!;
    const bounds = view.getBounds();
    const canvas = app.canvas.getBoundingClientRect();
    const x = canvas.x + (bounds.x + bounds.width / 2) * canvas.width / app.screen.width;
    const y = canvas.y + (bounds.y + bounds.height / 2) * canvas.height / app.screen.height;
    return { x, y, canvas: { x: canvas.x, y: canvas.y, right: canvas.right, bottom: canvas.bottom },
      visible: document.elementFromPoint(x, y) === app.canvas };
  }, object.id);
  assert(geometry.visible, `Focused item is obscured: ${JSON.stringify(geometry)}`);
  assert(Math.abs(geometry.x - (geometry.canvas.x + geometry.canvas.right) / 2) < 20);
  assert(Math.abs(geometry.y - (geometry.canvas.y + geometry.canvas.bottom) / 2) < 20);
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction((id) => {
    const app = globalThis.avatarWorld as unknown as Application | undefined;
    return Boolean(app?.stage.getChildByLabel(`world-asset:${id}`, true));
  }, placements[0]!.id);
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).waitFor();
  await page.screenshot({ path: `${output}/inventory-dark.png` });
  await page.getByRole("tab", { name: "Placed", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^Focus / }).count(), 3);
  checks.push("Every personal placement appears across floors; shared and other players' items are excluded.");
  await focusItem(placements[0]!);
  await page.screenshot({ path: `${output}/focus-dark.png` });
  await page.waitForFunction(() => {
    const app = globalThis.avatarWorld as unknown as Application;
    return app.stage.getChildByLabel("asset-focus", true)!.width === 0;
  });
  await focusItem(placements[0]!);
  await focusItem(placements[1]!);
  checks.push("Camera focus centers plants and rugs; the pulse expires and repeats on subsequent clicks.");
  await page.getByRole("button", { name: "Focus Floor plant in Garden, Rooftop" }).click();
  await page.getByRole("application", { name: /Rooftop build canvas/ }).waitFor();
  assert(await page.getByRole("button", { name: "Store", exact: true }).isDisabled());
  assert.equal(store.getMember("user-jonas")!.floorId, "floor-studio");
  assert(!commands.some((command) => command.type === "movement.set_destination"));
  checks.push("Focusing another floor leaves the player in place and prevents edits on that floor.");
  await focusItem(placements[0]!);
  for (const viewport of [{ width: 820, height: 900 }, { width: 390, height: 844 }, { width: 390, height: 568 }]) {
    await page.setViewportSize(viewport);
    await focusItem(placements[2]!);
    await focusItem(placements[0]!);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: `${output}/focus-${viewport.width}-${viewport.height}.png` });
  }
  checks.push("Tablet and mobile keep the focused item visible beside or above the scrollable panel.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Use light mode", exact: true }).click();
  await page.screenshot({ path: `${output}/placed-light.png` });
  await page.getByRole("button", { name: "Store", exact: true }).click();
  await page.getByRole("button", { name: "Focus Floor plant in Lounge, Studio" }).waitFor({ state: "hidden" });
  assert.equal(store.getObject(placements[0]!.id), undefined);
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page.screenshot({ path: `${output}/inventory-light.png` });
  const balance = store.getPlayerEconomy("user-jonas").coinBalance;
  const coffee = store.getPlayerEconomy("user-jonas").inventory.find((item) => item.assetId === "decor-coffee")!;
  await page.getByRole("button", { name: /^Sell Coffee cup for/ }).click();
  await page.getByRole("button", { name: "Sell item", exact: true }).click();
  await page.getByRole("button", { name: /^Sell Coffee cup for/ }).waitFor({ state: "hidden" });
  assert.equal(store.getPlayerEconomy("user-jonas").coinBalance, balance + Math.floor(coffee.purchasePrice / 3));
  checks.push("Store returns the selected item to inventory and Sell credits the displayed coin amount.");
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + "\n");
  runtime.stop();
  await browser.close();
}
console.log(`Verified ${checks.length} personal asset browser checks.`);
