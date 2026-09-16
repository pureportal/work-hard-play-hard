import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_ROTATIONS, SPECIAL_PROPS, requireAssetDefinition, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installBuiltAssetClient } from "../built-client.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = `${root}/artifacts/garden-food-2026-09-16/specials`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await installBuiltAssetClient(context);
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 704 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], walls: [], openings: [], tiles: [], rooms: [], revision: layout.revision + 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
await installWorldProbe(page);
const errors: string[] = [], checks: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));
const artwork = JSON.parse(await readFile(`${root}/apps/client/src/world-asset-artwork.json`, "utf8"));

async function waitForObject(object: WorldObject) {
  await page.waitForFunction(id => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app?.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
    return Boolean(sprite?.visible && sprite.texture.width > 1);
  }, object.id);
}

async function selectObject(object: WorldObject) {
  await waitForObject(object);
  await page.waitForTimeout(200);
  const point = await page.evaluate(id => {
    const app = globalThis.avatarWorld as unknown as Application;
    const sprite = app.stage.getChildByLabel(`world-asset:${id}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
    const frame = sprite.texture.frame;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width; canvas.height = frame.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(sprite.texture.source.resource as CanvasImageSource, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const data = context.getImageData(0, 0, frame.width, frame.height).data;
    let best = { x: 0, y: 0, distance: Infinity };
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      const distance = (x - frame.width / 2) ** 2 + (y - frame.height / 2) ** 2;
      if (data[(y * frame.width + x) * 4 + 3]! > 200 && distance < best.distance) best = { x, y, distance };
    }
    if (!Number.isFinite(best.distance)) throw new Error("No opaque toy pixels");
    const point = sprite.toGlobal(best), rect = app.canvas.getBoundingClientRect();
    return { x: rect.x + point.x * rect.width / app.screen.width, y: rect.y + point.y * rect.height / app.screen.height };
  }, object.id);
  await page.mouse.click(point.x, point.y);
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  for (const [assetId, prop] of Object.entries(SPECIAL_PROPS)) for (const rotation of ASSET_ROTATIONS) {
    const object: WorldObject = { id: `${assetId}-${rotation}`, assetId, variantId: "mint", rotation, x: 720, y: 640, floorId: layout.floorId };
    layout.objects = [object]; layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    await selectObject(object);
    await page.getByRole("button", { name: prop.action, exact: true }).click();
    await page.waitForFunction(id => Boolean((globalThis.avatarWorld as unknown as Application).stage.getChildByLabel(`special-effect:${id}`, true)?.visible), object.id);
    assert(fixture.commands.some(command => command.type === "interaction.use_prop" && command.objectId === object.id));
    if (prop.effect === "fortune" || prop.effect === "wheel") await page.waitForFunction(id => Boolean((globalThis.avatarWorld as unknown as Application).stage.getChildByLabel(`special-effect:${id}`, true)?.getChildByLabel("special-result")?.visible), object.id);
    if (rotation === 0) {
      if (prop.effect === "confetti" || prop.effect === "bubbles") await page.waitForTimeout(650);
      await page.screenshot({ path: `${output}/${assetId}.png` });
    }
    await selectObject(object);
    assert(await page.getByRole("button", { name: /^Ready in \ds$/ }).isDisabled());
    await page.keyboard.press("Escape");
    checks.push({ assetId, rotation, action: prop.action, effect: true, cooldown: true });
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const bubble: WorldObject = { id: "reduced-bubbles", assetId: "special-bubbles", variantId: "sakura", rotation: 0, x: 720, y: 640, floorId: layout.floorId };
  layout.objects = [bubble]; layout.revision++;
  fixture.publish({ type: "layout.updated", layout });
  await selectObject(bubble);
  await page.getByRole("button", { name: "Blow bubbles", exact: true }).click();
  await page.waitForFunction(() => Boolean((globalThis.avatarWorld as unknown as Application).stage.getChildByLabel("special-effect:reduced-bubbles", true)));
  const reduced = await page.evaluate(async () => {
    const node = (globalThis.avatarWorld as unknown as Application).stage.getChildByLabel("special-effect:reduced-bubbles", true)!;
    const before = node.children.map(child => [child.x, child.y, child.rotation]);
    await new Promise(resolve => setTimeout(resolve, 250));
    return JSON.stringify(before) === JSON.stringify(node.children.map(child => [child.x, child.y, child.rotation]));
  });
  assert(reduced);
  checks.push({ reducedMotionEffects: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const animated = ["decor-kinetic-mobile", "decor-jellyfish-lamp", "decor-rocking-bird", "outdoor-mini-windmill"];
  for (const assetId of animated) {
    const definition = requireAssetDefinition(assetId);
    layout.objects = ASSET_ROTATIONS.flatMap((rotation, index) => {
      const object: WorldObject = { id: `animation-${index}`, assetId, variantId: "mint", rotation, x: 400 + index * 192, y: 576, floorId: layout.floorId };
      return definition.placement.layer === "surface" ? [{ ...object, id: `support-${index}`, assetId: "table-workbench", variantId: "oak", rotation: 0 as const, x: object.x - 32 }, object] : [object];
    });
    layout.revision++; fixture.publish({ type: "layout.updated", layout });
    for (const object of layout.objects) await waitForObject(object);
    const sample = () => page.evaluate(() => Array.from({ length: 4 }, (_, index) => {
      const app = globalThis.avatarWorld as unknown as Application;
      const sprite = app.stage.getChildByLabel(`world-asset:animation-${index}`, true)!.getChildByLabel("artwork")!.children.at(-1) as Sprite;
      return `${sprite.texture.frame.x}:${sprite.texture.frame.y}`;
    }));
    const before = await sample(); await page.waitForTimeout(320); const after = await sample();
    assert(before.every((frame, index) => frame !== after[index]));
    await page.screenshot({ path: `${output}/${assetId}-animated.png` });
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.waitForTimeout(120);
    const still = await sample(); await page.waitForTimeout(320); assert.deepEqual(await sample(), still);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    checks.push({ assetId, rotations: [...ASSET_ROTATIONS], animated: true, reducedMotion: true, frames: artwork[assetId].animation.frames });
  }

  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2) + "\n");
  fixture.stop(); await browser.close();
}
console.log(`Verified ${checks.length} toy and animation checks.`);
