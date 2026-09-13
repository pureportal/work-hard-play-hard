import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { ASSET_CATALOG, ASSET_ROTATIONS, getPlacedAssetBounds, getPlacedAssetCells, getAssetVariants, requireAssetDefinition } from "../../packages/shared/src/index.js";
import { installAssetFixture } from "./playwright-fixture.js";

const assets = process.argv.slice(2).map(requireAssetDefinition);
assert(assets.length > 0, "Pass the asset IDs to verify");
const output = fileURLToPath(new URL("../../artifacts/world-assets/additions/ui/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const issues: string[] = [];
const verified: string[] = [];
const playerPosition = { x: 720, y: 650 };

async function artworkReady(page: Page) {
  await page.locator(".asset-shape").evaluateAll(async (elements) => {
    const paths = new Set(elements.map((element) => element.querySelector("image")!.getAttribute("href")!));
    await Promise.all([...paths].map(async (path) => {
      const image = new Image();
      image.src = path;
      await image.decode();
    }));
    for (const element of elements) {
      const bounds = element.getBoundingClientRect();
      if (bounds.width !== 38 || bounds.height !== 38) throw new Error("Unexpected preview size");
    }
  });
  assert.equal(await page.locator(".world-artwork-error").count(), 0);
}

async function screenPoint(page: Page, position: { x: number; y: number }) {
  const canvas = await page.locator(".world-canvas canvas").boundingBox();
  assert(canvas);
  return {
    x: canvas.x + canvas.width / 2 + (position.x - playerPosition.x) * 0.78,
    y: canvas.y + canvas.height / 2 + (position.y - playerPosition.y) * 0.78,
  };
}

async function waitForSeat(page: Page, fixture: Awaited<ReturnType<typeof installAssetFixture>>, objectId?: string) {
  const deadline = Date.now() + 15_000;
  while (fixture.getPlayer("user-jonas")?.seat?.objectId !== objectId) {
    assert(Date.now() < deadline, "Player seating state did not update");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const touch = viewport.width !== 1440;
    const buildContext = await browser.newContext({ viewport });
    const buildFixture = await installAssetFixture(buildContext);
    try {
      const page = await buildContext.newPage();
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.locator(".world-canvas canvas").waitFor();
      await page.getByRole("button", { name: "Build", exact: true }).click();
      for (const asset of assets) {
        const category = ASSET_CATALOG.categories.find((entry) => entry.id === asset.category)!;
        await page.getByRole("tab", { name: category.name, exact: true }).click();
        await page.locator(".asset-rarity-filter select").selectOption(asset.rarity);
        await page.getByRole("button", { name: asset.name, exact: true }).click();
        await artworkReady(page);
        for (const variant of getAssetVariants(asset)) {
          await page.getByRole("radio", { name: variant.name, exact: true }).click();
          assert.equal(await page.locator('.asset-variants [aria-checked="true"] image').getAttribute("href"), `/world-assets/${asset.id}/${variant.id}.png`);
        }
        await page.screenshot({ path: `${output}/${asset.id}-${viewport.width}-build.png` });
      }
      verified.push(`Build at ${viewport.width}x${viewport.height}: new asset selection, rarity and material previews`);
    } finally {
      await buildContext.close();
      buildFixture.stop();
    }
    for (const asset of assets) {
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const fixture = await installAssetFixture(context, "user-jonas", playerPosition);
      try {
        const layout = fixture.store.getLayout("floor-studio")!;
        layout.objects = asset.placement.layer === "surface"
          ? [{ id: "review-table", floorId: "floor-studio", assetId: "table-workbench", variantId: "walnut", rotation: 0, x: 560, y: 528 }]
          : [];
        layout.revision++;
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        page.on("pageerror", (error) => issues.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
        page.on("response", (response) => {
          if (response.url().includes("/world-assets/") && response.status() >= 400) issues.push(`${response.status()} ${response.url()}`);
        });
        await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
        await page.locator(".world-canvas canvas").waitFor();
        await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
        await page.getByRole("button", { name: "Build", exact: true }).click();
        await page.getByRole("tab", { name: "Shop", exact: true }).click();
        const category = ASSET_CATALOG.categories.find((entry) => entry.id === asset.category)!;
        await page.getByRole("tab", { name: category.name, exact: true }).click();
        await page.locator(".asset-rarity-filter select").selectOption(asset.rarity);
        await artworkReady(page);
        await page.getByRole("button", { name: `Buy ${asset.name}`, exact: true }).click();
        await page.getByRole("tab", { name: "Inventory", exact: true }).click();
        const inventory = page.locator(".inventory-asset").filter({ hasText: asset.name });
        const variants = getAssetVariants(asset);
        for (const [index, rotation] of ASSET_ROTATIONS.entries()) {
          await inventory.getByRole("button", { name: "Place", exact: true }).click();
          const variant = variants[index % variants.length]!;
          await page.getByRole("radio", { name: variant.name, exact: true }).click();
          for (let turn = 0; turn < index; turn++) {
            await page.getByRole("button", { name: /Rotate asset clockwise, currently facing/ }).click();
          }
          await artworkReady(page);
          const point = await screenPoint(page, { x: 624, y: 560 });
          if (touch) await page.touchscreen.tap(point.x, point.y);
          else await page.mouse.move(point.x, point.y);
          await page.waitForFunction(() => document.querySelector(".placement-confirm")?.matches(":enabled"));
          await page.screenshot({ path: `${output}/${asset.id}-${viewport.width}-${rotation}-preview.png` });
          if (touch) await page.locator(".placement-confirm").tap();
          else await page.mouse.click(point.x, point.y);
          await page.locator(".placement-confirm").waitFor({ state: "hidden" });
          const placed = fixture.store.getLayout("floor-studio")!.objects.find((object) => object.assetId === asset.id)!;
          assert(placed, `Placement missing for ${asset.id}`);
          assert.equal(placed.rotation, rotation);
          assert.equal(placed.variantId, variant.id);
          assert(getPlacedAssetCells(placed).every((cell) => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
          assert.equal(placed.ownerUserId, "user-jonas");
          assert.equal(fixture.store.getBootstrap("user-jonas").economy.inventory.find((owned) => owned.assetId === asset.id)!.placement!.objectId, placed.id);
          await page.screenshot({ path: `${output}/${asset.id}-${viewport.width}-${rotation}-placed.png` });
          if (touch) await page.touchscreen.tap(point.x, point.y);
          else await page.mouse.click(point.x, point.y);
          const selected = page.locator(".build-selection");
          await selected.waitFor();
          if (index === 3 && asset.interactions?.some((interaction) => interaction.type === "seat")) {
            await page.getByRole("button", { name: "Close build tools", exact: true }).click();
            await page.evaluate(async () => {
              for (let frame = 0; frame < 50; frame++) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              }
            });
            const bounds = getPlacedAssetBounds(placed);
            const seatPoint = await screenPoint(page, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
            if (touch) await page.touchscreen.tap(seatPoint.x, seatPoint.y);
            else await page.mouse.click(seatPoint.x, seatPoint.y);
            await page.getByRole("button", { name: "Sit", exact: true }).click();
            await waitForSeat(page, fixture, placed.id);
            await page.evaluate(async () => {
              for (let frame = 0; frame < 50; frame++) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              }
            });
            await page.screenshot({ path: `${output}/${asset.id}-${viewport.width}-seated.png` });
            const canvas = await page.locator(".world-canvas canvas").boundingBox();
            assert(canvas);
            const seatedPoint = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 + 8 };
            if (touch) await page.touchscreen.tap(seatedPoint.x, seatedPoint.y);
            else await page.mouse.click(seatedPoint.x, seatedPoint.y);
            await page.getByRole("button", { name: "Stand", exact: true }).click();
            await waitForSeat(page, fixture);
            assert(fixture.commands.some((command) => command.type === "asset.interact" && command.objectId === placed.id));
            assert(fixture.commands.some((command) => command.type === "seat.leave"));
            verified.push(`${asset.id} at ${viewport.width}x${viewport.height}: walk to seat, sit and stand`);
            break;
          }
          await selected.getByRole("button", { name: "Remove", exact: true }).click();
          await selected.waitFor({ state: "hidden" });
          assert(!fixture.store.getLayout("floor-studio")!.objects.some((object) => object.id === placed.id));
          if (index === 1) await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(fixture.commands.filter((command) => command.type === "economy.purchase_asset" && command.assetId === asset.id).length, 1);
        verified.push(`${asset.id} at ${viewport.width}x${viewport.height}: rarity, purchase, inventory, three variants, four rotations, placement, selection, removal, both themes`);
      } catch (error) {
        const page = context.pages()[0];
        if (page) await page.screenshot({ path: `${output}/${asset.id}-${viewport.width}-failed.png` });
        throw error;
      } finally {
        await context.close();
        fixture.stop();
      }
    }
  }
  assert.deepEqual(issues, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ url: "http://127.0.0.1:5173", transport: "Isolated DemoStore and WorldRuntime; existing running client", verified, issues }, null, 2));
  console.log(verified.join("\n"));
} finally {
  await browser.close();
}
