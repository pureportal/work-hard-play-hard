import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, getAssetVariants, requireAssetDefinition, type Position, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = fileURLToPath(new URL(`../../../${process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/floor-types-2026-09-15/interactions/"}`, import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const checks: unknown[] = [];
const floors = ASSET_CATALOG.assets.filter(asset => asset.kind === "floor-tile");

async function clickWorld(page: Page, point: Position, place = false) {
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  const screen = await page.evaluate(async point => {
    const app = globalThis.avatarWorld as unknown as Application;
    let previous = "", stable = 0;
    const deadline = performance.now() + 5000;
    while (stable < 4) {
      if (performance.now() > deadline) throw new Error("The gameplay camera did not settle");
      await new Promise(requestAnimationFrame);
      const matrix = app.stage.children[0]!.worldTransform;
      const next = [matrix.tx, matrix.ty, matrix.a, matrix.d].map(value => value.toFixed(2)).join(":");
      stable = next === previous ? stable + 1 : 0;
      previous = next;
    }
    const position = app.stage.children[0]!.toGlobal(point);
    const rect = app.canvas.getBoundingClientRect();
    return { x: rect.x + position.x * rect.width / app.screen.width, y: rect.y + position.y * rect.height / app.screen.height };
  }, point);
  await page.mouse.move(screen.x, screen.y);
  if (place) await page.locator(".placement-confirm:enabled").waitFor();
  await page.mouse.click(screen.x, screen.y);
}

async function waitFor(page: Page, condition: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    assert(Date.now() < deadline, "Runtime did not apply the expected floor operation");
    await page.waitForTimeout(40);
  }
}

async function run(userId: string, shop: boolean) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fixture = await installAssetFixture(context, userId, { x: 704, y: 576 }, { currentPlayerOnly: true });
  const layout = fixture.store.getLayout("floor-studio")!;
  const room = { ...layout.rooms[0]!, bounds: { x: 256, y: 256, width: 768, height: 512 }, footprint: [{ x: 256, y: 256, width: 768, height: 512 }],
    access: { mode: "open" as const, assignedPersonIds: [], knockable: false }, build: { mode: "open" as const, assignedPersonIds: [] } };
  Object.assign(layout, { objects: [], tiles: [], walls: [], openings: [], rooms: shop ? [room] : [], revision: layout.revision + 1 });
  const page = await context.newPage();
  await installWorldProbe(page);
  page.on("pageerror", error => errors.push(error.message));
  const objects = () => fixture.store.getLayout(layout.floorId)!.objects;
  try {
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    const people = page.getByRole("button", { name: "Close people", exact: true });
    if (await people.isVisible()) await people.click();
    await page.getByRole("button", { name: "Build", exact: true }).click();
    if (shop) {
      await page.getByRole("tab", { name: "Shop", exact: true }).click();
      await page.getByRole("tab", { name: "Floor types", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: /^Buy / }).count(), floors.length);
      assert.equal(await page.getByRole("button", { name: "Buy Woven rug", exact: true }).count(), 0);
      await page.screenshot({ path: `${output}/shop.png` });
      await page.getByRole("tab", { name: "Floor types", exact: true }).press("ArrowRight");
      assert.equal(await page.getByRole("tab", { name: "Floor decor" }).getAttribute("aria-selected"), "true");
      assert.equal(await page.getByRole("button", { name: "Buy Parquet", exact: true }).count(), 0);
      await page.getByRole("textbox", { name: "Search shop" }).fill("Parquet");
      assert.equal(await page.locator(".shop-asset").count(), 1);
      const before = fixture.store.getBootstrap(userId).economy.coinBalance;
      await page.getByRole("button", { name: "Buy Parquet", exact: true }).click();
      await waitFor(page, () => fixture.store.getBootstrap(userId).economy.inventory.some(owned => owned.assetId === "floor-parquet"));
      const owned = fixture.store.getBootstrap(userId).economy.inventory.find(owned => owned.assetId === "floor-parquet")!;
      assert.equal(fixture.store.getBootstrap(userId).economy.coinBalance, before - requireAssetDefinition("floor-parquet").shop!.price);
      await page.getByRole("tab", { name: "Inventory", exact: true }).click();
      await page.locator(".inventory-asset").filter({ hasText: "Parquet" }).getByRole("button", { name: "Place", exact: true }).click();
      await page.getByRole("radio", { name: "Chevron", exact: true }).click();
      await clickWorld(page, { x: 448, y: 448 }, true);
      await waitFor(page, () => objects().some(object => object.ownedAssetId === owned.id));
      const placed = objects().find(object => object.ownedAssetId === owned.id)!;
      assert.equal(placed.variantId, "chevron");
      assert.equal(placed.ownerUserId, userId);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await clickWorld(page, { x: placed.x + 32, y: placed.y + 32 });
      const selected = page.getByRole("region", { name: "Selected Parquet", exact: true });
      await selected.getByRole("button", { name: "Rotate", exact: true }).click();
      await waitFor(page, () => objects().find(object => object.id === placed.id)?.rotation === 90);
      await selected.getByRole("button", { name: "Remove", exact: true }).click();
      await waitFor(page, () => !objects().some(object => object.id === placed.id));
      assert.equal(fixture.store.getBootstrap(userId).economy.inventory.find(asset => asset.id === owned.id)!.placement, undefined);
      checks.push({ shop: { materials: floors.length, categoryKeyboard: true, search: true, purchase: true, design: "chevron", ownership: true, reload: true, rotation: true, returnedToInventory: true } });
    } else {
      await page.getByRole("tab", { name: "Floor types", exact: true }).click();
      assert.equal(await page.locator(".asset-grid > button").count(), floors.length);
      assert.equal(await page.getByRole("button", { name: "Woven rug", exact: true }).count(), 0);
      for (const [index, asset] of floors.entries()) {
        await page.getByRole("button", { name: asset.name, exact: true }).click();
        for (const variant of getAssetVariants(asset)) {
          await page.getByRole("radio", { name: variant.name, exact: true }).click();
          assert.equal(await page.getByRole("radio", { name: variant.name, exact: true }).getAttribute("aria-checked"), "true");
        }
        const variant = getAssetVariants(asset)[index % 3]!;
        await page.getByRole("radio", { name: variant.name, exact: true }).click();
        if (asset.id === "floor-parquet") await page.screenshot({ path: `${output}/build-designs.png` });
        const before = new Set(objects().map(object => object.id));
        await clickWorld(page, { x: 448, y: 448 }, true);
        await waitFor(page, () => objects().some(object => !before.has(object.id)));
        const placed = objects().find(object => !before.has(object.id))!;
        assert.equal(placed.assetId, asset.id);
        assert.equal(placed.variantId, variant.id);
        assert.equal(placed.x % 16, 0);
        assert.equal(placed.y % 16, 0);
        await page.getByRole("button", { name: "Select", exact: true }).click();
        await clickWorld(page, { x: placed.x + 32, y: placed.y + 32 });
        const selected = page.getByRole("region", { name: `Selected ${asset.name}`, exact: true });
        for (let turn = 1; turn <= (asset.id === "floor-parquet" ? 4 : 1); turn++) {
          await selected.getByRole("button", { name: "Rotate", exact: true }).click();
          await waitFor(page, () => objects().find(object => object.id === placed.id)?.rotation === (placed.rotation + turn * 90) % 360);
        }
        await selected.getByRole("button", { name: "Move", exact: true }).click();
        await clickWorld(page, { x: 544, y: 448 }, true);
        await waitFor(page, () => objects().find(object => object.id === placed.id)?.x !== placed.x);
        await selected.getByRole("button", { name: "Remove", exact: true }).click();
        await waitFor(page, () => !objects().some(object => object.id === placed.id));
        checks.push({ assetId: asset.id, selectedDesigns: getAssetVariants(asset).map(variant => variant.id), placedDesign: variant.id, rotated: true, moved: true, removed: true });
      }
      const floor: WorldObject = { id: "layer-floor", floorId: layout.floorId, assetId: "floor-wood", variantId: "oak", rotation: 0, x: 416, y: 416 };
      const rug: WorldObject = { ...floor, id: "layer-rug", assetId: "rug-woven" };
      const current = fixture.store.getLayout(layout.floorId)!;
      current.objects = [rug, floor, { ...floor, id: "layer-floor-right", x: 480 }];
      current.revision++;
      fixture.publish({ type: "layout.updated", layout: current });
      await page.getByRole("button", { name: "Select", exact: true }).click();
      await clickWorld(page, { x: 448, y: 448 });
      await page.getByRole("region", { name: "Selected Woven rug", exact: true }).waitFor();
      assert(await page.evaluate(() => {
        const app = globalThis.avatarWorld as unknown as Application;
        const rug = app.stage.getChildByLabel("world-asset:layer-rug", true)!;
        const floor = app.stage.getChildByLabel("world-asset:layer-floor", true)!;
        return rug.parent === floor.parent && rug.parent.children.indexOf(rug) > rug.parent.children.indexOf(floor);
      }));
      await page.getByRole("button", { name: "Close build tools", exact: true }).click();
      await clickWorld(page, { x: 448, y: 464 });
      await waitFor(page, () => Math.hypot(fixture.getPlayer(userId)!.x - 448, fixture.getPlayer(userId)!.y - 464) < 4);
      await page.screenshot({ path: `${output}/rug-layering.png` });
      await page.getByRole("button", { name: "Build", exact: true }).click();
      await page.getByRole("tab", { name: "Floor types", exact: true }).click();
      await page.getByRole("button", { name: "Parquet", exact: true }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("radio", { name: "Chevron", exact: true }).click();
      const picker = await page.locator(".asset-placement-options").boundingBox();
      assert(picker && picker.y >= 0 && picker.y + picker.height <= 844);
      await page.waitForFunction(() => {
        const selected = document.querySelector('.asset-category-tabs [aria-selected="true"]')!.getBoundingClientRect();
        return selected.left >= 55 && selected.right <= 390;
      });
      await page.screenshot({ path: `${output}/build-mobile.png` });
      checks.push({ rugAboveFloorRegardlessOfInsertionOrder: true, rugSelectedFirst: true, walkable: true, mobileDesignControls: true });
    }
  } catch (error) {
    await page.screenshot({ path: `${output}/${shop ? "shop" : "build"}-failure.png` });
    throw error;
  } finally {
    fixture.stop();
    await context.close();
  }
}

try {
  await run("user-maya", false);
  await run("user-jonas", true);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
console.log(`Verified ${checks.length} floor interaction checks`);
