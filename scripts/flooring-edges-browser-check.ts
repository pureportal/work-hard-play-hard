import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import type { Application, Sprite } from "../apps/client/node_modules/pixi.js";
import { getAssetPlacementError, getDefaultAssetVariantId, requireAssetDefinition, type Position, type WorldObject } from "../packages/shared/src/index.js";
import { installWorldProbe } from "./characters/playwright-animation.js";
import { installAssetFixture } from "./world-assets/playwright-fixture.js";

const output = fileURLToPath(new URL("../artifacts/flooring-edges/", import.meta.url));
const origin = process.env.WORLD_ASSET_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const fixture = await installAssetFixture(context, "user-maya", { x: 416, y: 288 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
layout.walls = [
  { id: "vertical", start: { x: 384, y: 192 }, end: { x: 384, y: 576 } },
  { id: "horizontal", start: { x: 192, y: 384 }, end: { x: 576, y: 384 } },
];
layout.openings = [
  { id: "door", wallId: "vertical", type: "door", offset: 224, width: 64 },
  { id: "window", wallId: "horizontal", type: "window", offset: 32, width: 96, light: { color: "#fff4cf", intensity: 0.2, depth: 112 } },
];
layout.rooms = [];
layout.objects = [];
layout.tiles = [];
layout.revision++;
const page = await context.newPage();
const errors: string[] = [];
const checks: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.setDefaultTimeout(30_000);
await installWorldProbe(page);
await mkdir(output, { recursive: true });

async function pointAt(position: Position): Promise<void> {
  const screen = await page.evaluate(async (point) => {
    const app = globalThis.avatarWorld as unknown as Application;
    let previous = "", stable = 0;
    const deadline = performance.now() + 5000;
    while (stable < 4) {
      if (performance.now() > deadline) throw new Error("The world camera did not settle");
      await new Promise(requestAnimationFrame);
      const matrix = app.stage.children[0]!.worldTransform;
      const next = [matrix.tx, matrix.ty, matrix.a, matrix.d].map((value) => value.toFixed(2)).join(":");
      stable = next === previous ? stable + 1 : 0;
      previous = next;
    }
    const position = app.stage.children[0]!.toGlobal(point);
    const rect = app.canvas.getBoundingClientRect();
    return { x: rect.x + position.x * rect.width / app.screen.width, y: rect.y + position.y * rect.height / app.screen.height };
  }, position);
  await page.mouse.move(screen.x, screen.y);
}

async function objectPixels(id: string): Promise<{ width: number; height: number; pixels: number[] }> {
  await page.waitForFunction((id) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const object = app.stage.getChildByLabel(`world-asset:${id}`, true);
    return (object?.getChildByLabel("artwork")?.children[0] as Sprite | undefined)?.visible;
  }, id);
  return page.evaluate((id) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const object = app.stage.getChildByLabel(`world-asset:${id}`, true)!;
    const alpha = object.alpha;
    object.alpha = 1;
    const result = app.renderer.extract.pixels({ target: object, resolution: 1 });
    object.alpha = alpha;
    return { width: result.width, height: result.height, pixels: [...result.pixels] };
  }, id);
}

async function waitForStore(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    assert(Date.now() < deadline, "The runtime did not apply the floor edit");
    await page.waitForTimeout(30);
  }
}

function objects() { return fixture.store.getLayout(layout.floorId)!.objects; }

try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Floor types", exact: true }).click();
  await page.getByRole("button", { name: "Parquet", exact: true }).click();

  await pointAt({ x: 384, y: 320 });
  assert(await page.locator(".placement-confirm").isDisabled());
  await pointAt({ x: 272, y: 384 });
  assert(await page.locator(".placement-confirm").isDisabled());
  checks.push("Crossing solid walls and windows is blocked in the preview");

  await pointAt({ x: 416, y: 288 });
  await page.locator(".placement-confirm:enabled").waitFor();
  const rightPreview = await objectPixels("preview");
  await pointAt({ x: 352, y: 288 });
  const leftPreview = await objectPixels("preview");
  assert.notDeepEqual(leftPreview, rightPreview);
  await pointAt({ x: 416, y: 288 });
  assert.deepEqual(await objectPixels("preview"), rightPreview);
  checks.push("Moving between wall sides refreshes the clipping mask");

  for (const [index, position] of [
    { x: 384, y: 256 }, { x: 320, y: 256 }, { x: 384, y: 320 }, { x: 320, y: 320 },
    { x: 384, y: 384 }, { x: 320, y: 384 }, { x: 352, y: 480 },
  ].entries()) {
    if (index === 6) {
      const current = fixture.store.getLayout(layout.floorId)!;
      current.openings[0]!.offset = 288;
      current.revision++;
      fixture.publish({ type: "layout.updated", layout: current });
    }
    const before = new Set(objects().map((object) => object.id));
    await pointAt({ x: position.x + 32, y: position.y + 32 });
    await page.locator(".placement-confirm:enabled").waitFor();
    const preview = await objectPixels("preview");
    assert(preview.pixels.some((value, index) => index % 4 === 3 && value > 0));
    await page.screenshot({ path: `${output}/preview-${index}.png` });
    await page.mouse.down();
    await page.mouse.up();
    await waitForStore(() => objects().some((object) => !before.has(object.id)));
    const placed = objects().find((object) => !before.has(object.id))!;
    assert.deepEqual({ x: placed.x, y: placed.y }, position);
    assert.deepEqual(await objectPixels(placed.id), preview);
    checks.push(`Preview pixels match the placed tile at ${position.x}, ${position.y}`);
  }

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await pointAt({ x: 386, y: 288 });
  await page.mouse.down();
  await page.mouse.up();
  await page.getByRole("region", { name: "Selected Wall", exact: true }).waitFor();
  checks.push("Clicking the wall face selects the wall beside flooring");

  const current = fixture.store.getLayout(layout.floorId)!;
  const gallery: WorldObject[] = [];
  for (let y = 192; y < 576; y += 64) for (let x = 192; x < 576; x += 64) {
    const assetId = x < 384 ? y < 384 ? "floor-parquet" : "floor-ceramic" : y < 384 ? "floor-stone-tiles" : "floor-wood";
    gallery.push({ id: `gallery:${x}:${y}`, floorId: layout.floorId, x, y, assetId, rotation: 0, variantId: getDefaultAssetVariantId(requireAssetDefinition(assetId)) });
  }
  current.objects = gallery;
  current.revision++;
  fixture.publish({ type: "layout.updated", layout: current });
  for (const object of gallery) {
    assert.equal(getAssetPlacementError(current, { width: 1600, height: 1200 }, object), undefined);
    await objectPixels(object.id);
  }
  await page.getByRole("button", { name: "Close build tools", exact: true }).click();
  await page.screenshot({ path: `${output}/finished-light.png` });
  await page.getByRole("button", { name: "Use dark mode", exact: true }).click();
  await page.screenshot({ path: `${output}/finished-dark.png` });
  await page.getByRole("button", { name: "Use light mode", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.screenshot({ path: `${output}/finished-zoomed.png` });
  checks.push("Rendered adjacent materials, wall intersections, endpoints, doors, and windows in light and dark themes and at increased zoom");
  assert.equal(await page.locator(".world-artwork-error").count(), 0);
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  await page.screenshot({ path: `${output}/failure.png`, timeout: 10_000 }).catch((captureError: unknown) => console.error(captureError));
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  fixture.stop();
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ checks, errors, output }, null, 2));
