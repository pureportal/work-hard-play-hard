import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, getPlacedAssetCells, type Position } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = `${root}/${process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/category-expansion-2026-09-15/interactions"}`;
const requested = process.argv.find(value => value.startsWith("--assets="))?.slice(9).split(",");
const assets = ASSET_CATALOG.assets.filter(asset => asset.buildable && (!requested || requested.includes(asset.id)));
assert(!requested || assets.length === requested.length);
const artwork = JSON.parse(await readFile(`${root}/apps/client/src/world-asset-artwork.json`, "utf8"));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 576 }, { currentPlayerOnly: true });
const initial = fixture.store.getLayout("floor-studio")!;
Object.assign(initial, { objects: [], tiles: [], walls: [], openings: [], rooms: [], revision: initial.revision + 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
await installWorldProbe(page);
const errors: string[] = [];
const checks: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/world-assets\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
const objects = () => fixture.store.getLayout(initial.floorId)!.objects;

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    assert(Date.now() < deadline, "The runtime did not apply the asset operation");
    await page.waitForTimeout(40);
  }
}

async function clickWorld(point: Position) {
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
  await page.locator(".placement-confirm:enabled").waitFor();
  await page.mouse.click(screen.x, screen.y);
}

async function selectObject(page: Page, id: string, name: string) {
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const point = await page.evaluate(id => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
    const frame = sprite.texture.frame;
    const bitmap = document.createElement("canvas");
    bitmap.width = frame.width;
    bitmap.height = frame.height;
    const bitmapContext = bitmap.getContext("2d")!;
    bitmapContext.drawImage(sprite.texture.source.resource as CanvasImageSource, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const pixels = bitmapContext.getImageData(0, 0, frame.width, frame.height).data;
    let hit: { x: number; y: number; distance: number } | undefined;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      if (pixels[(y * frame.width + x) * 4 + 3]! < 200) continue;
      const distance = (x - frame.width / 2) ** 2 + (y - frame.height * 0.6) ** 2;
      if (!hit || distance < hit.distance) hit = { x, y, distance };
    }
    if (!hit) throw new Error(`No visible artwork for ${id}`);
    const position = sprite.toGlobal({ x: hit.x + 0.5, y: hit.y + 0.5 });
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + position.x * canvas.width / app.screen.width, y: canvas.y + position.y * canvas.height / app.screen.height };
  }, id);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("region", { name: `Selected ${name}`, exact: true }).waitFor();
}

async function waitForArtwork(id: string, assetId: string, variantId: string, rotation: number) {
  const variant = artwork[assetId].variants[variantId];
  await page.waitForFunction(({ id, path, frames }) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
    return sprite?.visible && sprite.label === path && frames.some((frame: { x: number; y: number }) => sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y);
  }, { id, path: variant.path, frames: variant.frames.filter((_: unknown, index: number) => index % 4 === rotation / 90) });
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  for (const [index, asset] of assets.entries()) {
    const layout = fixture.store.getLayout(initial.floorId)!;
    layout.objects = asset.placement.layer === "surface" ? [{ id: "support", floorId: layout.floorId, assetId: "table-workbench", variantId: "oak", rotation: 0, x: 416, y: 416 }] : [];
    layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    await page.getByRole("tab", { name: ASSET_CATALOG.categories.find(category => category.id === asset.category)!.name, exact: true }).click();
    await page.getByRole("button", { name: asset.name, exact: true }).click();
    for (const variant of getAssetVariants(asset)) {
      const radio = page.getByRole("radio", { name: variant.name, exact: true });
      await radio.click();
      assert.equal(await radio.getAttribute("aria-checked"), "true");
      assert.equal(await radio.locator("image").getAttribute("href"), artwork[asset.id].variants[variant.id].path);
    }
    const variant = getAssetVariants(asset)[index % getAssetVariants(asset).length]!;
    await page.getByRole("radio", { name: variant.name, exact: true }).click();
    const offset = asset.placement.layer === "surface" ? artwork["table-workbench"].surfaceHeight / Math.SQRT2 : 0;
    const previous = new Set(objects().map(object => object.id));
    await clickWorld({ x: 480, y: 448 - offset });
    await waitFor(() => objects().some(object => !previous.has(object.id)));
    const placed = objects().find(object => !previous.has(object.id))!;
    assert.equal(placed.assetId, asset.id);
    assert.equal(placed.variantId, variant.id);
    assert(getPlacedAssetCells(placed).every(cell => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
    await waitForArtwork(placed.id, asset.id, variant.id, placed.rotation);
    await selectObject(page, placed.id, asset.name);
    const selected = page.getByRole("region", { name: `Selected ${asset.name}`, exact: true });
    for (const rotation of ASSET_ROTATIONS) {
      await selected.getByRole("button", { name: "Rotate", exact: true }).click();
      const expected = (placed.rotation + rotation + 90) % 360;
      await waitFor(() => objects().find(object => object.id === placed.id)?.rotation === expected);
      await waitForArtwork(placed.id, asset.id, variant.id, expected);
    }
    assert.deepEqual({ x: objects().find(object => object.id === placed.id)!.x, y: objects().find(object => object.id === placed.id)!.y }, { x: placed.x, y: placed.y });
    await page.screenshot({ path: `${output}/${asset.id}.png` });
    await selected.getByRole("button", { name: "Move", exact: true }).click();
    await clickWorld({ x: asset.placement.layer === "surface" ? 512 : 624, y: 448 - offset });
    await waitFor(() => objects().find(object => object.id === placed.id)?.x !== placed.x);
    await selected.getByRole("button", { name: "Remove", exact: true }).click();
    await waitFor(() => !objects().some(object => object.id === placed.id));
    checks.push({ assetId: asset.id, selectedDesigns: getAssetVariants(asset).map(design => design.id), placedDesign: variant.id, rotations: [...ASSET_ROTATIONS], gridAligned: true, moved: true, removed: true });
    await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + "\n");
    console.log(`Verified Build interactions: ${asset.id}`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  await writeFile(`${output}/failure.json`, JSON.stringify({ objects: objects(), commands: fixture.commands.slice(-12), error: String(error) }, null, 2));
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + "\n");
  fixture.stop();
  await browser.close();
}
