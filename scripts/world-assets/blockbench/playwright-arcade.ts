import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_ROTATIONS, getPlacedAssetCells, getAssetRasterSize, requireAssetDefinition, type Position, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "../../artifacts/blockbench-refinement";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 608 });
const layout = fixture.store.getLayout("floor-studio")!;
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.tiles = [];
layout.objects = ["graphite", "white", "violet"].map<WorldObject>((variantId, index) => ({
  id: `review-arcade-${variantId}`, assetId: "equipment-arcade", floorId: layout.floorId,
  x: 480 + index * 288, y: 416, rotation: 0, variantId,
}));
const page = await context.newPage();
page.setDefaultTimeout(15_000);
await installWorldProbe(page);
const errors: string[] = [];
const checked: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (response.url().includes("/world-assets/") && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});

async function screenPoint(point: Position) {
  return page.evaluate(point => {
    const app = globalThis.avatarWorld as unknown as Application;
    const screen = app.stage.children[0]!.toGlobal(point);
    const bounds = app.canvas.getBoundingClientRect();
    return { x: bounds.x + screen.x, y: bounds.y + screen.y };
  }, point);
}

async function moveTo(point: Position) {
  const before = fixture.commands.length;
  const screen = await screenPoint(point);
  await page.mouse.click(screen.x, screen.y);
  const deadline = Date.now() + 10_000;
  while (Math.hypot(fixture.getPlayer("user-maya")!.x - point.x, fixture.getPlayer("user-maya")!.y - point.y) > 5) {
    assert(Date.now() < deadline, `Player did not reach ${JSON.stringify(point)}`);
    await page.waitForTimeout(50);
  }
  assert(fixture.commands.slice(before).some(command => command.type === "movement.set_destination"));
}

async function artworkReady() {
  await page.waitForFunction(async expected => {
    const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
    const app = globalThis.avatarWorld as unknown as Application;
    return expected.every(object => {
      const sprite = app?.stage.getChildByLabel(`world-asset:${object.id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
      return sprite?.visible && sprite.texture.frame.x === artwork[object.assetId].variants[object.variantId].frames[object.rotation / 90].x;
    });
  }, layout.objects);
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  for (const rotation of ASSET_ROTATIONS) {
    for (const object of layout.objects) object.rotation = rotation;
    layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    await artworkReady();
    await page.screenshot({ path: `${output}/arcade-materials-${rotation}.png` });
    const arcade = layout.objects[0]!;
    const raster = getAssetRasterSize(requireAssetDefinition(arcade.assetId), rotation);
    const width = raster.width * 16;
    const height = raster.height * 16;
    const cells = getPlacedAssetCells(arcade);
    assert.equal(cells.filter(cell => cell.solid).length, 24);
    assert(cells.every(cell => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
    for (const side of ["front", "left", "back", "right"] as const) {
      const point = side === "front" ? { x: arcade.x + width / 2, y: arcade.y + height + 48 }
        : side === "back" ? { x: arcade.x + width / 2, y: arcade.y - 48 }
        : side === "left" ? { x: arcade.x - 48, y: arcade.y + height / 2 }
        : { x: arcade.x + width + 48, y: arcade.y + height / 2 };
      await moveTo(point);
      const key = { front: "ArrowUp", back: "ArrowDown", left: "ArrowRight", right: "ArrowLeft" }[side];
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.keyboard.down(key);
      try { await page.waitForTimeout(600); } finally { await page.keyboard.up(key); }
      const stopped = fixture.getPlayer("user-maya")!;
      assert(Math.hypot(stopped.x - point.x, stopped.y - point.y) > 10, `${side}: player must move toward the cabinet`);
      const clearance = side === "front" ? stopped.y - arcade.y - height : side === "back" ? arcade.y - stopped.y
        : side === "left" ? arcade.x - stopped.x : stopped.x - arcade.x - width;
      assert(clearance >= 8 && clearance <= 24, `${rotation}/${side}: incorrect collision clearance ${clearance}`);
      checked.push({ rotation, side, clearance, solidCells: cells.length });
    }
    await moveTo({ x: 704, y: 608 });
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const hit = await page.evaluate(id => {
      const app = globalThis.avatarWorld as unknown as Application;
      const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
      const bounds = sprite.getBounds();
      const canvas = app.canvas.getBoundingClientRect();
      return { x: canvas.x + bounds.x + bounds.width / 2, y: canvas.y + bounds.y + bounds.height * 0.85 };
    }, arcade.id);
    await page.mouse.click(hit.x, hit.y);
    await page.getByRole("region", { name: "Selected Arcade cabinet", exact: true }).waitFor();
    await page.screenshot({ path: `${output}/arcade-selected-${rotation}.png` });
    await page.getByRole("button", { name: "Close build tools", exact: true }).click();
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await artworkReady();
  await page.screenshot({ path: `${output}/arcade-fixture-reloaded.png` });
  assert.deepEqual(errors, []);
  console.log("Verified three arcade materials, four rotations, selection, 16 movement collisions and reload.");
} finally {
  await writeFile(`${output}/arcade-interactions.json`, JSON.stringify({ checked, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
