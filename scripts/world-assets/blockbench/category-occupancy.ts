import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getAssetCollisionRects, getDefaultAssetVariantId, getPlacedAssetBounds, getPlacedAssetInteractions, type Position, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = `${root}/${process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/category-expansion-2026-09-15/occupancy"}`;
const requested = process.argv.find(value => value.startsWith("--assets="))?.slice(9).split(",");
const seats = ASSET_CATALOG.assets.filter(asset => asset.category === "seating" && (!requested || requested.includes(asset.id)));
assert(!requested || seats.length === requested.length);
const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 640 }, { currentPlayerOnly: true });
fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], rooms: [], tiles: [], walls: [], openings: [], revision: layout.revision + 1 });
const page = await context.newPage();
await installWorldProbe(page);
const errors: string[] = [];
const checks: unknown[] = [];
page.on("pageerror", error => errors.push(error.message));

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    assert(Date.now() < deadline, `Occupancy did not settle: ${JSON.stringify(fixture.getPlayer("user-maya"))}`);
    await page.waitForTimeout(50);
  }
}

async function clickPoint(point: Position) {
  await page.waitForTimeout(180);
  const screen = await page.evaluate(point => {
    const app = globalThis.avatarWorld as unknown as Application;
    const position = app.stage.children[0]!.toGlobal(point);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + position.x * canvas.width / app.screen.width, y: canvas.y + position.y * canvas.height / app.screen.height };
  }, point);
  await page.mouse.click(screen.x, screen.y);
}

async function capture(name: string, object: WorldObject) {
  await page.waitForTimeout(180);
  const clip = await page.evaluate(object => {
    const app = globalThis.avatarWorld as unknown as Application;
    const canvas = app.canvas.getBoundingClientRect();
    const start = app.stage.children[0]!.toGlobal({ x: object.x - 48, y: object.y - 112 });
    const end = app.stage.children[0]!.toGlobal({ x: object.x + 176, y: object.y + 144 });
    return { x: Math.floor(canvas.x + start.x), y: Math.floor(canvas.y + start.y), width: Math.ceil(end.x - start.x), height: Math.ceil(end.y - start.y) };
  }, object);
  assert(clip.width >= 174 && clip.width <= 176);
  return page.screenshot({ path: `${output}/${name}.png`, clip });
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  for (const asset of seats) {
    const images: { input: Buffer; left: number; top: number }[] = [];
    for (const [column, rotation] of ASSET_ROTATIONS.entries()) {
      const object: WorldObject = { id: "review-seat", floorId: layout.floorId, assetId: asset.id, variantId: getDefaultAssetVariantId(asset), rotation, x: 512, y: 480 };
      layout.objects = [object];
      layout.revision++;
      fixture.publish({ type: "layout.updated", layout });
      await page.waitForFunction(() => Boolean((globalThis.avatarWorld as unknown as Application).stage.getChildByLabel("world-asset:review-seat", true)));
      for (const [index, interaction] of getPlacedAssetInteractions(object).entries()) {
        await clickPoint(interaction.center);
        await page.getByRole("button", { name: "Sit", exact: true }).first().click();
        await waitFor(() => fixture.getPlayer("user-maya")?.seat?.objectId === object.id);
        const player = fixture.getPlayer("user-maya")!;
        assert.equal(player.facing, interaction.direction);
        assert(Math.hypot(player.x - interaction.center.x, player.y - interaction.center.y) < 1);
        const picture = await capture(`${asset.id}-${rotation}-${index}`, object);
        if (index === 0) images.push({ input: picture, left: 12 + column * 188, top: 30 });
        checks.push({ assetId: asset.id, rotation, interactionId: interaction.id, seatedAtInteraction: true });
        await clickPoint(interaction.center);
        await page.getByRole("button", { name: "Stand", exact: true }).click();
        await waitFor(() => !fixture.getPlayer("user-maya")?.seat);
      }
      await clickPoint({ x: 704, y: 640 });
      await waitFor(() => Math.hypot(fixture.getPlayer("user-maya")!.x - 704, fixture.getPlayer("user-maya")!.y - 640) < 4);
    }
    images.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="764" height="24"><text x="12" y="18" font-family="Arial" font-size="12">${asset.name}: 0 / 90 / 180 / 270 degrees</text></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 764, height: 240, channels: 4, background: "#eee8df" } }).composite(images).png().toFile(`${output}/${asset.id}.png`);
    await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
    console.log(`Verified seated alignment: ${asset.id}`);
  }
  for (const rotation of ASSET_ROTATIONS) {
    const pergola: WorldObject = { id: "review-pergola", floorId: layout.floorId, assetId: "outdoor-pergola", variantId: "sand", rotation, x: 480, y: 480 };
    layout.objects = [pergola];
    layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    const bounds = getPlacedAssetBounds(pergola);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await clickPoint(center);
    await waitFor(() => Math.hypot(fixture.getPlayer("user-maya")!.x - center.x, fixture.getPlayer("user-maya")!.y - center.y) < 4);
    assert(getAssetCollisionRects(layout).every(rect => center.x < rect.x || center.x > rect.x + rect.width || center.y < rect.y || center.y > rect.y + rect.height));
    await capture(`pergola-${rotation}`, pergola);
    checks.push({ assetId: pergola.assetId, rotation, walkedUnderRoof: true, solidPosts: getAssetCollisionRects(layout).length });
    await clickPoint({ x: 704, y: 640 });
    await waitFor(() => Math.hypot(fixture.getPlayer("user-maya")!.x - 704, fixture.getPlayer("user-maya")!.y - 640) < 4);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
