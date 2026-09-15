import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getAssetRasterSize, getPlacedAssetCells, getPlacedAssetInteractions, requireAssetDefinition, type Position, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "../../artifacts/asset-expansion/maps/gameplay";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 752 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.tiles = [];
const assets = ["sofa-reading-bench", "table-chabudai", "plant-bamboo", "light-stone-lantern", "decor-wind-chimes", "decor-pinwheel"];
const objects = assets.map<WorldObject>((assetId, index) => ({ id: `review-${assetId}`, assetId, floorId: layout.floorId, x: 480 + index % 3 * 240, y: 416 + Math.floor(index / 3) * 224, rotation: 0, variantId: ["sakura", "matcha", "indigo"][index % 3]! }));
const support: WorldObject = { id: "review-support", assetId: "table-chabudai", floorId: layout.floorId, x: 944, y: 624, rotation: 0, variantId: "indigo" };
layout.objects = [...objects, support];
fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "longbraid", upperBody: "traveler", lowerBody: "festival", shoes: "festival", headwear: "blossom" });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
await installWorldProbe(page);
const errors: string[] = [];
const checked: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/(world-assets|characters)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});

async function ready() {
  const expected = await page.evaluate(async objects => {
    const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
    return objects.map(object => ({
      id: object.id,
      frames: artwork[object.assetId].variants[object.variantId].frames.filter((_frame: unknown, index: number) => index % 4 === object.rotation / 90) as { x: number; y: number }[],
    }));
  }, layout.objects);
  await page.waitForFunction(expected => {
    const app = globalThis.avatarWorld as unknown as Application;
    return expected.every(object => {
      const sprite = app?.stage.getChildByLabel(`world-asset:${object.id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
      return sprite?.visible && object.frames.some(frame => sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y);
    });
  }, expected);
}

async function clickPoint(point: Position) {
  await settleWorld();
  const screen = await page.evaluate(point => {
    const app = globalThis.avatarWorld as unknown as Application;
    const screen = app.stage.children[0]!.toGlobal(point);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + screen.x, y: canvas.y + screen.y };
  }, point);
  await page.mouse.click(screen.x, screen.y);
}

async function moveTo(point: Position) {
  await clickPoint(point);
  const deadline = Date.now() + 10_000;
  while (Math.hypot(fixture.getPlayer("user-maya")!.x - point.x, fixture.getPlayer("user-maya")!.y - point.y) > 5) {
    assert(Date.now() < deadline, `Player did not reach ${JSON.stringify(point)}`);
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(point => {
    const player = globalThis.findAvatar("You")!.parent!.parent!;
    return Math.hypot(player.x - point.x, player.y - point.y) < 1;
  }, point);
}

async function settleWorld() {
  await page.evaluate(async () => {
    const app = globalThis.avatarWorld as unknown as Application;
    let previous = "", stable = 0;
    const deadline = performance.now() + 5000;
    while (stable < 4) {
      await new Promise(requestAnimationFrame);
      const transform = app.stage.children[0]!.worldTransform;
      const pose = [transform.tx, transform.ty, transform.a, transform.d].map(value => value.toFixed(3)).join(":");
      stable = pose === previous ? stable + 1 : 0;
      previous = pose;
      if (performance.now() > deadline) throw new Error("World camera did not settle");
    }
  });
}

async function selectObject(object: WorldObject) {
  await settleWorld();
  const point = await page.evaluate(id => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
    const frame = sprite.texture.frame;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(sprite.texture.source.resource as HTMLImageElement, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hit = { x: 0, y: 0, distance: Infinity };
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3]! < 200) continue;
      const distance = (x - canvas.width / 2) ** 2 + (y - canvas.height * 0.65) ** 2;
      if (distance < hit.distance) hit = { x, y, distance };
    }
    const bounds = sprite.getBounds();
    const screen = app.canvas.getBoundingClientRect();
    return { x: screen.x + bounds.x + (hit.x + 0.5) / canvas.width * bounds.width, y: screen.y + bounds.y + (hit.y + 0.5) / canvas.height * bounds.height };
  }, object.id);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("region", { name: `Selected ${requireAssetDefinition(object.assetId).name}`, exact: true }).waitFor();
}

async function animationSamples() {
  return page.evaluate(async ids => {
    const app = globalThis.avatarWorld as unknown as Application;
    const samples = ids.map(id => ({ id, frames: new Set<string>(), poses: new Set<string>(), shadowsMatch: true }));
    const start = performance.now();
    while (performance.now() - start < 1700) {
      for (const sample of samples) {
        const sprites = app.stage.getChildByLabel(`world-asset:${sample.id}`, true)!.getChildByLabel("artwork")!.children as Sprite[];
        const sprite = sprites.at(-1)!;
        sample.frames.add(`${sprite.texture.frame.x}:${sprite.texture.frame.y}`);
        sample.poses.add(`${sprite.x}:${sprite.y}:${sprite.width}:${sprite.height}`);
        sample.shadowsMatch &&= sprites[0]!.texture === sprite.texture;
      }
      await new Promise(requestAnimationFrame);
    }
    return samples.map(sample => ({ id: sample.id, frames: sample.frames.size, poses: sample.poses.size, shadowsMatch: sample.shadowsMatch }));
  }, objects.slice(4).map(object => object.id));
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  for (const rotation of ASSET_ROTATIONS) {
    for (const object of objects) object.rotation = rotation;
    layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    await ready();
    await page.screenshot({ path: `${output}/courtyard-${rotation}.png` });
    const animations = await animationSamples();
    assert(animations.every(sample => sample.frames >= 12 && sample.poses === 1 && sample.shadowsMatch));
    checked.push({ rotation, animations });
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    for (const object of objects) await selectObject(object);
    await page.screenshot({ path: `${output}/pinwheel-selected-${rotation}.png` });
    await page.getByRole("button", { name: "Close build tools", exact: true }).click();
    checked.push({ rotation, selected: assets });
    for (const object of objects.slice(0, 5)) {
      const size = getAssetRasterSize(requireAssetDefinition(object.assetId), rotation);
      const width = size.width * 16, height = size.height * 16;
      const cells = getPlacedAssetCells(object);
      assert.equal(cells.filter(cell => cell.solid).length, size.width * size.height);
      assert(cells.every(cell => cell.worldX % 16 === 0 && cell.worldY % 16 === 0));
      for (const side of ["front", "back", "left", "right"] as const) {
        const point = side === "front" ? { x: object.x + width / 2, y: object.y + height + 48 }
          : side === "back" ? { x: object.x + width / 2, y: object.y - 48 }
          : side === "left" ? { x: object.x - 48, y: object.y + height / 2 } : { x: object.x + width + 48, y: object.y + height / 2 };
        await moveTo(point);
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
        const key = { front: "ArrowUp", back: "ArrowDown", left: "ArrowRight", right: "ArrowLeft" }[side];
        await page.keyboard.down(key);
        try { await page.waitForTimeout(500); } finally { await page.keyboard.up(key); }
        const stopped = fixture.getPlayer("user-maya")!;
        const clearance = side === "front" ? stopped.y - object.y - height : side === "back" ? object.y - stopped.y : side === "left" ? object.x - stopped.x : stopped.x - object.x - width;
        assert(clearance >= 8 && clearance <= 24, `${object.assetId}/${rotation}/${side}: ${clearance}`);
        checked.push({ asset: object.assetId, rotation, side, clearance });
      }
    }
    const bench = objects[0]!;
    const seat = getPlacedAssetInteractions(bench)[0]!;
    await clickPoint(seat.center);
    await page.getByRole("button", { name: "Sit", exact: true }).first().click();
    const seatDeadline = Date.now() + 10_000;
    while (fixture.getPlayer("user-maya")?.seat?.objectId !== bench.id) {
      assert(Date.now() < seatDeadline, "Player did not reach the bench seat");
      await page.waitForTimeout(50);
    }
    await page.waitForFunction(() => {
      const frame = globalThis.findAvatar("You")?.texture?.frame;
      return frame && frame.y < 480 && frame.x >= 480;
    });
    await page.waitForFunction(center => {
      const sprite = globalThis.findAvatar("You")!;
      const player = sprite.parent!.parent!;
      return Math.hypot(player.x - center.x, player.y - center.y) < 0.1 && sprite.anchor?.y === 0.65;
    }, seat.center);
    await settleWorld();
    assert.equal(fixture.getPlayer("user-maya")?.seat?.objectId, bench.id);
    await page.screenshot({ path: `${output}/bench-seated-${rotation}.png` });
    await clickPoint(seat.center);
    await page.getByRole("button", { name: "Stand", exact: true }).click();
    checked.push({ rotation, seatDirection: seat.direction, seated: true });
    await moveTo({ x: 704, y: 752 });
    console.log(`Courtyard verified: ${rotation} degrees`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  assert((await animationSamples()).every(sample => sample.frames === 1 && sample.poses === 1 && sample.shadowsMatch));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const expected = structuredClone(layout.objects);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await ready();
  assert.deepEqual(fixture.store.getLayout(layout.floorId)!.objects, expected);
  assert((await animationSamples()).every(sample => sample.frames >= 12));
  checked.push({ reducedMotion: true, resumedAfterReload: true });
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: `${output}/final-state.png` });
  await writeFile(`${output}/courtyard-review.json`, JSON.stringify({ checked, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
