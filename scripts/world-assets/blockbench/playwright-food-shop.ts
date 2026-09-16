import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, getAssetVariants, requireAssetDefinition } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installBuiltAssetClient } from "../built-client.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = fileURLToPath(new URL(`../../../${process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/garden-food-2026-09-16/shop"}/`, import.meta.url));
const purchase = requireAssetDefinition(process.argv.find(value => value.startsWith("--asset="))?.slice(8) ?? "food-ramen");
assert(purchase.shop?.available);
const design = getAssetVariants(purchase)[1]!;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
if (process.argv.includes("--built")) await installBuiltAssetClient(context);
const fixture = await installAssetFixture(context, "user-jonas", { x: 704, y: 576 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
const room = { ...layout.rooms[0]!, bounds: { x: 256, y: 256, width: 768, height: 512 }, footprint: [{ x: 256, y: 256, width: 768, height: 512 }],
  access: { mode: "open" as const, assignedPersonIds: [], knockable: false }, build: { mode: "open" as const, assignedPersonIds: [] } };
Object.assign(layout, { objects: [{ id: "table", assetId: "table-workbench", variantId: "oak", floorId: layout.floorId, x: 416, y: 416, rotation: 0 }], walls: [], openings: [], tiles: [], rooms: [room], revision: layout.revision + 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
await installWorldProbe(page);
const errors: string[] = [], checks: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Shop", exact: true }).click();
  const additions = ASSET_CATALOG.assets.filter(asset => ["indoor-planters", "garden-seasons", "tableware", "playful"].includes(asset.themeSetId));
  for (const category of ASSET_CATALOG.categories.filter(category => additions.some(asset => asset.category === category.id))) {
    await page.getByRole("tab", { name: category.name, exact: true }).click();
    for (const asset of additions.filter(asset => asset.category === category.id)) {
      const card = page.locator(".shop-asset").filter({ hasText: asset.name });
      assert.equal(await card.count(), 1);
      assert(await card.locator("image").getAttribute("href"));
    }
    checks.push({ category: category.id, assets: additions.filter(asset => asset.category === category.id).map(asset => asset.id) });
  }
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^Buy / }).count(), ASSET_CATALOG.assets.filter(asset => asset.category === "food" && asset.shop?.available).length);
  await page.screenshot({ path: `${output}/food-shop.png` });
  await page.getByRole("tab", { name: ASSET_CATALOG.categories.find(category => category.id === purchase.category)!.name, exact: true }).click();
  const before = fixture.store.getBootstrap("user-jonas").economy.coinBalance;
  await page.getByRole("button", { name: `Buy ${purchase.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await page.locator(".inventory-asset").filter({ hasText: purchase.name }).getByRole("button", { name: "Place", exact: true }).click();
  assert.equal(fixture.store.getBootstrap("user-jonas").economy.coinBalance, before - purchase.shop!.price);
  await page.getByRole("radio", { name: design.name, exact: true }).click();
  const screen = await page.evaluate(async surface => {
    const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
    const app = globalThis.avatarWorld as unknown as Application;
    const point = app.stage.children[0]!.toGlobal({ x: surface ? 480 : 640, y: 448 - (surface ? artwork["table-workbench"].surfaceHeight / Math.SQRT2 : 0) });
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + point.x * canvas.width / app.screen.width, y: canvas.y + point.y * canvas.height / app.screen.height };
  }, purchase.placement.layer === "surface");
  await page.mouse.move(screen.x, screen.y);
  await page.locator(".placement-confirm:enabled").waitFor();
  await page.mouse.click(screen.x, screen.y);
  await page.waitForFunction(({ id, variantId }) => Boolean((globalThis.avatarWorld as unknown as Application).stage.getChildByLabel(`/world-assets/${id}/${variantId}.png`, true)), { id: purchase.id, variantId: design.id });
  const placed = fixture.store.getLayout(layout.floorId)!.objects.find(object => object.assetId === purchase.id)!;
  assert.equal(placed.ownerUserId, "user-jonas"); assert.equal(placed.variantId, design.id); assert(placed.ownedAssetId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(id => Boolean((globalThis.avatarWorld as unknown as Application | undefined)?.stage.getChildByLabel(`world-asset:${id}`, true)), placed.id);
  checks.push({ purchase: purchase.id, design: design.id, placement: purchase.placement.layer, ownership: true, reload: true });
  await page.screenshot({ path: `${output}/owned-food.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await people.isVisible()) await people.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Shop", exact: true }).click();
  await page.getByRole("tab", { name: "Food", exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "Food", exact: true }).getAttribute("aria-selected"), "true");
  await page.screenshot({ path: `${output}/food-shop-mobile.png` });
  checks.push({ mobile: { width: 390, height: 844, foodNavigation: true } });
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + "\n");
  fixture.stop(); await browser.close();
}
console.log(`Verified ${checks.length} Shop, ownership and mobile checks.`);
