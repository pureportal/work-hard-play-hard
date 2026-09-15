import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../../apps/client/node_modules/pixi.js";
import { CHARACTER_ANIMATIONS, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, DEFAULT_CHARACTER_APPEARANCE, getPlacedAssetInteractions, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../../world-assets/playwright-fixture.js";
import { installWorldProbe, verifyWorldMovement, worldReady } from "../playwright-animation.js";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? fileURLToPath(new URL("../../../artifacts/blockbench-migration", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 704, y: 600 });
const layout = fixture.store.getLayout("floor-studio")!;
layout.walls = [];
layout.openings = [];
layout.rooms = [];
const chair: WorldObject = { id: "review-chair", assetId: "sofa-reading-bench", variantId: "indigo", floorId: layout.floorId, x: 688, y: 528, rotation: 0 };
const water: WorldObject[] = [
  { id: "review-pool", assetId: "outdoor-pool", variantId: "coastal", floorId: layout.floorId, x: 448, y: 680, rotation: 0 },
  { id: "review-pond", assetId: "outdoor-koi-pond", variantId: "coastal", floorId: layout.floorId, x: 720, y: 680, rotation: 0 },
  { id: "review-fountain", assetId: "outdoor-fountain", variantId: "coastal", floorId: layout.floorId, x: 960, y: 680, rotation: 0 },
];
layout.objects = [chair, ...water];
layout.revision++;
fixture.store.updateMemberCharacter("user-maya", { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "longbraid", upperBody: "traveler", lowerBody: "festival", shoes: "festival", headwear: "goggles" });
const errors: string[] = [];
const checked: unknown[] = [];
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
await installWorldProbe(page);

async function expectMotion(motion: keyof typeof CHARACTER_ANIMATIONS) {
  await page.waitForFunction(({ row, column }) => {
    const frame = globalThis.findAvatar("You")?.texture?.frame;
    return frame && frame.y >= row && frame.y < row + 480 && frame.x >= column && (column > 0 || frame.x < 480 || row >= 480);
  }, { row: CHARACTER_ANIMATIONS[motion].row * CHARACTER_CANVAS_SIZE, column: CHARACTER_ANIMATIONS[motion].column * CHARACTER_CANVAS_SIZE });
}

async function clickSeat() {
  const center = getPlacedAssetInteractions(chair)[0]!.center;
  const point = await page.evaluate(center => {
    const app = globalThis.avatarWorld as unknown as Application;
    const seat = app.stage.getChildByLabel("world-asset:review-chair", true)!;
    const point = seat.parent!.toGlobal(center);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: point.x * canvas.width / app.screen.width + canvas.x, y: point.y * canvas.height / app.screen.height + canvas.y };
  }, center);
  await page.mouse.click(point.x, point.y);
}

async function waterFrame(id: string) {
  return page.evaluate(async ({ id, layout }) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const { getPlacedWorldAssetArtwork } = await import("/src/world-asset-placement.ts" as string);
    const object = layout.objects.find(object => object.id === id)!;
    const artwork = getPlacedWorldAssetArtwork(layout, object);
    const node = app.stage.getChildByLabel(`world-asset:${id}`, true)!;
    const start = node.toGlobal({ x: artwork.bounds.x, y: artwork.bounds.y });
    const end = node.toGlobal({ x: artwork.bounds.x + artwork.bounds.width, y: artwork.bounds.y + artwork.bounds.height });
    app.render();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(end.x - start.x);
    canvas.height = Math.ceil(end.y - start.y);
    canvas.getContext("2d")!.drawImage(app.canvas, start.x, start.y, end.x - start.x, end.y - start.y, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  }, { id, layout });
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await worldReady(page);
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  checked.push({ walking: await verifyWorldMovement(page) });
  await clickSeat();
  await page.getByRole("button", { name: "Sit", exact: true }).first().click();
  await expectMotion("sit");
  assert.equal(fixture.getPlayer("user-maya")?.seat?.objectId, chair.id);
  fixture.publish({ type: "spotify.activity", serverTime: Date.now(), userId: "user-maya", activity: { userId: "user-maya", trackId: "review", title: "Animation review", artist: "Review", album: "Review", artworkUrl: null, trackUrl: "https://open.spotify.com/track/review", expiresAt: Date.now() + 60_000, jamUrl: null } });
  await expectMotion("sit-listen");
  await page.screenshot({ path: `${output}/world-sit-listen.png` });
  await clickSeat();
  await page.getByRole("button", { name: "Stand", exact: true }).click();
  await expectMotion("listen");
  await page.screenshot({ path: `${output}/world-listen.png` });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.down("ArrowRight");
  try { await expectMotion("walk"); } finally { await page.keyboard.up("ArrowRight"); }
  await expectMotion("listen");
  fixture.publish({ type: "spotify.activity", serverTime: Date.now(), userId: "user-maya", activity: null });
  await expectMotion("idle");
  checked.push({ sit: true, seatedListening: true, standingListening: true, walkingPriority: true, stoppedMusic: true });
  for (const rotation of [0, 90, 180, 270] as const) {
    for (const object of water) object.rotation = rotation;
    layout.revision++;
    fixture.publish({ type: "layout.updated", layout });
    await page.waitForFunction(() => {
      const app = globalThis.avatarWorld as unknown as Application;
      return ["review-pool", "review-pond", "review-fountain"].every(id => app.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.filter(child => child.label.startsWith("/world-assets/")).every(child => child.visible));
    });
    const first = await Promise.all(water.map(object => waterFrame(object.id)));
    await page.waitForTimeout(350);
    const second = await Promise.all(water.map(object => waterFrame(object.id)));
    assert(first.every((frame, index) => frame !== second[index]), `Water must move at ${rotation}`);
    await page.screenshot({ path: `${output}/world-water-${rotation}.png` });
    checked.push({ waterRotation: rotation, assets: water.map(object => object.assetId) });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  const first = await waterFrame(water[0]!.id);
  await page.waitForTimeout(350);
  assert.equal(await waterFrame(water[0]!.id), first, "Reduced motion must freeze water");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checked, errors, directions: CHARACTER_DIRECTIONS }));
} finally {
  fixture.stop();
  await writeFile(`${output}/world-animation-review.json`, JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
}
