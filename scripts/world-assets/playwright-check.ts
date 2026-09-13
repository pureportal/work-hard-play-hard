import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { ASSET_CATALOG, getPlacedAssetCells } from "../../packages/shared/src/index.js";
import { installAssetFixture } from "./playwright-fixture.js";

const output = process.env.WORLD_ASSET_SCREENSHOTS ? resolve(process.env.WORLD_ASSET_SCREENSHOTS) : fileURLToPath(new URL("../../artifacts/world-assets/polish/", import.meta.url));
const url = process.env.WORLD_ASSET_URL ?? "http://127.0.0.1:5173";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const issues: string[] = [];
const verified: string[] = [];

async function ready(page: Page) {
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => issues.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/world-assets/") && response.status() >= 400) issues.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const game = page.getByRole("button", { name: "Close game", exact: true });
  if (await game.isVisible()) {
    await game.click();
    const leave = page.getByRole("button", { name: "Leave game", exact: true });
    if (await leave.isVisible()) await leave.click();
  }
  assert.equal(await game.count(), 0);
}

async function checkThumbnails(page: Page) {
  const shapes = page.locator(".asset-shape");
  assert(await shapes.count() > 0);
  await shapes.evaluateAll(async (elements) => {
    const paths = new Set(elements.map((element) => element.querySelector("image")!.getAttribute("href")!));
    await Promise.all([...paths].map(async (path) => {
      const image = new Image();
      image.src = path;
      await image.decode();
    }));
    for (const shape of elements) {
      const bounds = shape.getBoundingClientRect();
      if (bounds.width !== 38 || bounds.height !== 38) throw new Error("Asset thumbnail dimensions changed");
    }
  });
  assert.equal(await page.locator(".world-artwork-error").count(), 0);
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${name}.png`, animations: "disabled" });
}

async function findPlacement(page: Page, avoid?: { x: number; y: number }) {
  const canvas = await page.locator(".world-canvas canvas").boundingBox();
  const panel = await page.locator(".build-panel").boundingBox();
  assert(canvas && panel);
  const right = Math.min(canvas.x + canvas.width, panel.x) - 70;
  for (const y of [0.58, 0.68, 0.8, 0.4, 0.3]) {
    for (let x = canvas.x + 100; x < right; x += 82) {
      const point = { x, y: canvas.y + canvas.height * y };
      if (avoid && Math.hypot(point.x - avoid.x, point.y - avoid.y) < 100) continue;
      await page.mouse.move(point.x, point.y);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      if (await page.locator(".placement-confirm").isEnabled()) return point;
    }
  }
  throw new Error("No valid placement point found in the visible world");
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fixture = await installAssetFixture(context);
  try {
    const page = await context.newPage();
    await ready(page);
    await capture(page, "desktop-after");
    await page.getByRole("button", { name: "Build", exact: true }).click();
    for (const category of ASSET_CATALOG.categories.filter((category) => category.buildable)) {
      await page.getByRole("tab", { name: category.name, exact: true }).click();
      await checkThumbnails(page);
    }
    await page.getByRole("tab", { name: "Desks", exact: true }).click();
    await page.getByRole("button", { name: "Gaming desk", exact: true }).click();
    await page.getByRole("radio", { name: "Sage", exact: true }).focus();
    await page.keyboard.press("End");
    assert.equal(await page.getByRole("radio", { name: "Navy", exact: true }).getAttribute("aria-checked"), "true");
    await checkThumbnails(page);
    await capture(page, "build-after");
    const crops = new Set<string>();
    let firstPlacement: { id: string; x: number; y: number } | undefined;
    for (const [index, direction] of ["South", "West", "North", "East"].entries()) {
      const rotate = page.getByRole("button", { name: `Rotate asset clockwise, currently facing ${direction}`, exact: true });
      await rotate.waitFor();
      crops.add((await page.locator('.asset-variants [aria-checked="true"] .asset-shape-artwork').getAttribute("viewBox"))!);
      const point = await findPlacement(page);
      await capture(page, `preview-${direction.toLowerCase()}`);
      const layout = fixture.store.getLayout("floor-studio")!;
      const previousCount = layout.objects.length;
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => document.querySelector(".placement-confirm")?.hasAttribute("disabled"));
      assert.equal(fixture.store.getLayout("floor-studio")!.objects.length, previousCount + 1);
      const placed = fixture.store.getLayout("floor-studio")!.objects.at(-1)!;
      firstPlacement ??= { id: placed.id, ...point };
      assert.equal(placed.variantId, "navy");
      assert.equal(placed.rotation, index * 90);
      assert(getPlacedAssetCells(placed).every((cell) => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
      await page.mouse.click(point.x, point.y);
      assert.equal(fixture.store.getLayout("floor-studio")!.objects.length, previousCount + 1);
      await capture(page, `placed-${direction.toLowerCase()}`);
      await rotate.click();
    }
    assert.equal(crops.size, 4);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    assert(firstPlacement);
    await page.mouse.click(firstPlacement.x, firstPlacement.y);
    await page.locator(".build-selection").getByRole("button", { name: "Rotate", exact: true }).click();
    assert.equal(fixture.store.getLayout("floor-studio")!.objects.find((object) => object.id === firstPlacement!.id)!.rotation, 90);
    await page.locator(".build-selection").getByRole("button", { name: "Move", exact: true }).click();
    const destination = await findPlacement(page, firstPlacement);
    await page.mouse.click(destination.x, destination.y);
    await page.locator(".build-selection").getByRole("button", { name: "Remove", exact: true }).click();
    await page.locator(".build-selection").waitFor({ state: "hidden" });
    assert(!fixture.store.getLayout("floor-studio")!.objects.some((object) => object.id === firstPlacement!.id));
    await page.getByRole("tab", { name: "Storage", exact: true }).click();
    await page.locator(".asset-rarity-filter select").selectOption("epic");
    assert.equal(await page.locator(".asset-grid > button").count(), 1);
    await page.getByRole("button", { name: "Display cabinet", exact: true }).click();
    await page.getByRole("radio", { name: "Sage", exact: true }).click();
    await checkThumbnails(page);
    await capture(page, "desktop-cabinet");
    await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
    await capture(page, "desktop-dark");
    await page.locator(".asset-rarity-filter select").selectOption("all");
    await page.getByRole("tab", { name: "Decor", exact: true }).click();
    await page.getByRole("button", { name: "Desktop monitor", exact: true }).click();
    for (const material of ["Graphite", "Ivory", "Coral"]) {
      await page.getByRole("radio", { name: material, exact: true }).click();
      await checkThumbnails(page);
    }
    await capture(page, "desktop-monitor-designs");
    verified.push("desktop: every build category, four rotations, keyboard and pointer variants, exact raster placement, collision rejection, rotate/move/remove, rarity filtering, both themes");
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.getByRole("tab", { name: "Desks", exact: true }).click();
      await page.getByRole("button", { name: "Gaming desk", exact: true }).click();
      await checkThumbnails(page);
      await capture(page, `build-${viewport.width}-catalog`);
      await page.getByRole("radio", { name: "Navy", exact: true }).click();
      await capture(page, `build-${viewport.width}-designs`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    verified.push("compact Build: catalog names, 38px artwork, selection and designs at all three mobile sizes");
  } finally {
    await context.close();
    fixture.stop();
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const fixture = await installAssetFixture(context, "user-jonas");
    try {
      const page = await context.newPage();
      await ready(page);
      await page.getByRole("button", { name: "Build", exact: true }).tap();
      await page.getByRole("tab", { name: "Shop", exact: true }).tap();
      for (const category of ASSET_CATALOG.categories.filter((category) => ASSET_CATALOG.assets.some((asset) => asset.category === category.id && asset.shop))) {
        const tab = page.getByRole("tab", { name: category.name, exact: true });
        await tab.tap();
        const visible = await tab.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const list = element.parentElement!.getBoundingClientRect();
          return box.left >= list.left - 1 && box.right <= list.right + 1;
        });
        assert(visible, `${category.name} must scroll fully into view`);
        await checkThumbnails(page);
      }
      await page.getByRole("tab", { name: "Desks", exact: true }).tap();
      await checkThumbnails(page);
      const firstAssetVisible = await page.locator(".shop-asset").first().evaluate((element) => {
        const box = element.getBoundingClientRect();
        const panel = element.closest(".build-panel")!.getBoundingClientRect();
        return box.top >= panel.top && box.bottom <= panel.bottom;
      });
      assert(firstAssetVisible, "The first shop object must be fully visible after choosing a category");
      await capture(page, `mobile-${viewport.width}-shop`);
      await page.getByRole("button", { name: "Buy Standing desk", exact: true }).tap();
      await page.getByRole("tab", { name: "Inventory", exact: true }).tap();
      const row = page.locator(".inventory-asset").filter({ hasText: "Standing desk" });
      await row.getByRole("button", { name: "Place", exact: true }).tap();
      await page.getByRole("radio", { name: "Oak", exact: true }).tap();
      for (const direction of ["South", "West", "North", "East"]) {
        await page.getByRole("button", { name: `Rotate asset clockwise, currently facing ${direction}`, exact: true }).tap();
      }
      await checkThumbnails(page);
      await capture(page, `mobile-${viewport.width}-designs`);
      const metrics = await page.locator(".asset-variants").evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, targets: [...element.querySelectorAll("button")].map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })) }));
      assert(metrics.scroll <= metrics.width + 1);
      assert(metrics.targets.every((target) => target.width >= 40 && target.height >= 40));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(fixture.store.getBootstrap("user-jonas").economy.inventory.filter((asset) => asset.assetId === "desk-standing").length, 1);
      const panel = await page.locator(".build-panel").boundingBox();
      assert(panel);
      let placed = false;
      for (const y of [150, 190, 230, 300, 340]) {
        for (const x of [110, 150, 210, 270, 330]) {
          if ((y >= panel.y && x >= panel.x) || x > viewport.width - 20) continue;
          await page.touchscreen.tap(x, y);
          await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          if (await page.locator(".placement-confirm").isEnabled()) {
            await capture(page, `mobile-${viewport.width}-preview`);
            await page.locator(".placement-confirm").tap();
            await page.locator(".placement-confirm").waitFor({ state: "hidden" });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) await capture(page, `mobile-${viewport.width}-blocked`);
      assert(placed, `No touch placement completed at ${viewport.width}px`);
      const owned = fixture.store.getBootstrap("user-jonas").economy.inventory.find((asset) => asset.assetId === "desk-standing")!;
      assert(owned.placement);
      await capture(page, `mobile-${viewport.width}-placed`);
      await page.getByRole("button", { name: "Use dark mode", exact: true }).tap();
      await checkThumbnails(page);
      await capture(page, `mobile-${viewport.width}-dark`);
      await page.getByRole("tab", { name: "Shop", exact: true }).tap();
      const previousBalance = fixture.store.getBootstrap("user-jonas").economy.coinBalance;
      await page.getByRole("button", { name: "Claim 50", exact: true }).tap();
      assert.equal(fixture.store.getBootstrap("user-jonas").economy.coinBalance, previousBalance + 50);
      assert.equal(await page.locator(".build-panel-actions .coin-balance").innerText(), String(previousBalance + 50));
      verified.push(`${viewport.width}x${viewport.height}: every scrollable shop category, touch purchase, inventory, material selection, four rotations, confirmed placement, unclipped controls, 40px touch targets and both themes`);
    } finally {
      await context.close();
      fixture.stop();
    }
  }
  assert.deepEqual(issues, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ url, transport: "Isolated DemoStore and WorldRuntime; existing running client", verified, issues }, null, 2));
  console.log(verified.join("\n"));
} finally {
  await browser.close();
}
