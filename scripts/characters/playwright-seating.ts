import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Container, Sprite } from "../../apps/client/node_modules/pixi.js";
import {
  ASSET_CATALOG, ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getDefaultAssetVariantId,
  getPlacedAssetBounds, getPlacedAssetInteractions, type WorldObject, type WorldPlayer,
} from "../../packages/shared/src/index.js";
import { getSeatOcclusionArtwork } from "../../apps/client/src/world-seat-occlusion.js";
import { getCharacterSeatLayout } from "../../apps/client/src/character-seat.js";
import { installAssetFixture } from "../world-assets/playwright-fixture.js";
import { installWorldProbe } from "./playwright-animation.js";
import { sharp } from "./raster.mjs";

const output = process.env.CHARACTER_SEAT_SCREENSHOTS ?? fileURLToPath(new URL("../../artifacts/seating/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const userId = "user-maya";
const appearance = process.env.CHARACTER_SEAT_APPEARANCE === "ranger"
  ? { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "spiky" as const, upperBody: "ranger" as const, lowerBody: "ranger" as const, shoes: "ranger" as const }
  : { ...DEFAULT_CHARACTER_APPEARANCE };
const fixture = await installAssetFixture(context, userId, { x: 704, y: 600 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
layout.objects = [];
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.revision++;
fixture.store.updateMemberCharacter(userId, appearance);
const base: WorldPlayer = { userId, floorId: layout.floorId, x: 704, y: 600, facing: "down", availability: "available", connected: true };
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await installWorldProbe(page);
let tick = 1000;
const results: { name: string; occludedPixels: number; visiblePixels: number }[] = [];
const overview: { input: Buffer; left: number; top: number }[] = [];

async function updateScene(object: WorldObject, players: WorldPlayer[]) {
  layout.objects = [object];
  layout.revision++;
  fixture.publish({ type: "layout.updated", layout });
  fixture.publish({ type: "world.snapshot", floorId: layout.floorId, layoutRevision: layout.revision, tick: ++tick, players });
  const pose = getCharacterSeatLayout(object, players[0]?.seat?.interactionId).pose;
  await page.waitForFunction(({ objectId, players, pose }) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const furniture = app.stage.getChildByLabel(`world-asset:${objectId}`, true);
    if (!furniture?.getChildByLabel("artwork")?.children.every(child => child.visible)) return false;
    return players.every(player => {
      const view = app.stage.getChildByLabel(`world-player:${player.userId}`, true);
      const mask = view?.getChildByLabel<Sprite>("seat-occlusion");
      const avatar = view?.getChildByLabel<Sprite>(`character-pose:${pose}`, true);
      return view && avatar?.texture.source.width === 960 && Math.hypot(view.x - player.x, view.y - player.y) < 0.05 && (!mask || mask.visible);
    });
  }, { objectId: object.id, players, pose });
}

async function capture(object: WorldObject, name: string, seated: boolean, front = true) {
  const bounds = getPlacedAssetBounds(object);
  const rendered = await page.evaluate(({ objectId, bounds, seated, front, userId }) => {
    const app = globalThis.avatarWorld as unknown as Application;
    app.ticker.stop();
    const furniture = app.stage.getChildByLabel(`world-asset:${objectId}`, true)!;
    const player = app.stage.getChildByLabel(`world-player:${userId}`, true)!;
    const avatar = globalThis.findAvatar(userId === "user-maya" ? "You" : "Elena")!.parent as unknown as Container;
    const mask = avatar.mask;
    const depth = furniture.parent!;
    const order = [furniture.zIndex, player.zIndex];
    const point = depth.toGlobal({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 - 28 });
    const crop = document.createElement("canvas");
    crop.width = 280;
    crop.height = 240;
    const context = crop.getContext("2d")!;
    const captureCanvas = { read() {
      app.render();
      context.clearRect(0, 0, crop.width, crop.height);
      const ratio = app.canvas.width / app.screen.width;
      context.drawImage(app.canvas, (point.x - 140) * ratio, (point.y - 120) * ratio, 280 * ratio, 240 * ratio, 0, 0, 280, 240);
      return crop.toDataURL();
    } };
    try {
      const actual = captureCanvas.read();
      if (seated) {
        avatar.mask = null;
        const unmasked = captureCanvas.read();
        avatar.visible = false;
        const empty = captureCanvas.read();
        return { actual, unmasked, empty, order, hasMask: Boolean(mask), correctlySorted: order[0]! < order[1]! };
      }
      furniture.zIndex = front ? Math.min(...order) : Math.max(...order);
      player.zIndex = front ? Math.max(...order) : Math.min(...order);
      depth.sortChildren();
      const expected = captureCanvas.read();
      return { actual, unmasked: expected, empty: expected, order, hasMask: Boolean(mask), correctlySorted: front ? order[0]! < order[1]! : order[1]! < order[0]! };
    } finally {
      avatar.visible = true;
      avatar.mask = mask;
      [furniture.zIndex, player.zIndex] = order as [number, number];
      depth.sortChildren();
      app.ticker.start();
    }
  }, { objectId: object.id, bounds, seated, front, userId });
  assert(rendered.correctlySorted, `${name}: incorrect world draw order`);
  const decode = (data: string) => Buffer.from(data.split(",")[1]!, "base64");
  const actual = decode(rendered.actual);
  let occludedPixels = 0, visiblePixels = 0;
  if (seated) {
    const pixels = await Promise.all([actual, decode(rendered.unmasked), decode(rendered.empty)].map(input => sharp(input).ensureAlpha().raw().toBuffer()));
    for (let index = 0; index < pixels[0]!.length; index += 4) {
      if (pixels[0]!.subarray(index, index + 3).compare(pixels[1]!.subarray(index, index + 3))) occludedPixels++;
      if (pixels[0]!.subarray(index, index + 3).compare(pixels[2]!.subarray(index, index + 3))) visiblePixels++;
    }
    assert(visiblePixels > 100, `${name}: character disappeared into the seat`);
  } else {
    assert.equal(rendered.hasMask, false, `${name}: standing character retained a seat mask`);
    assert.equal(rendered.actual, rendered.unmasked, `${name}: incorrect walking pixels`);
  }
  results.push({ name, occludedPixels, visiblePixels });
  await writeFile(`${output}/${name}.png`, actual);
  const caption = Buffer.from(`<svg width="280" height="24"><text x="140" y="17" text-anchor="middle" font-family="Arial" font-size="11">${name}</text></svg>`);
  return sharp({ create: { width: 280, height: 264, channels: 4, background: "#eee9e2" } })
    .composite([{ input: actual, left: 0, top: 0 }, { input: caption, left: 0, top: 240 }]).png().toBuffer();
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  fixture.stop();
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  for (let zoom = 0; zoom < 5; zoom++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const assets = ASSET_CATALOG.assets.filter(asset => asset.interactions?.length);
  for (const [assetIndex, asset] of assets.entries()) {
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (const [column, rotation] of ASSET_ROTATIONS.entries()) {
      const object: WorldObject = { id: "seat", floorId: layout.floorId, assetId: asset.id, variantId: getDefaultAssetVariantId(asset), rotation, x: 688, y: 568 };
      const bounds = getPlacedAssetBounds(object);
      for (const [row, front] of [false, true].entries()) {
        await updateScene(object, [{ ...base, x: bounds.x + bounds.width / 2, y: front ? bounds.y + bounds.height + 5 : bounds.y - 2 }]);
        const name = `${asset.id}-${rotation}-${front ? "front" : "behind"}`;
        tiles.push({ input: await capture(object, name, false, front), left: column * 280, top: row * 264 });
      }
      const seats = getPlacedAssetInteractions(object);
      for (const [index, seat] of seats.entries()) {
        await updateScene(object, [{ ...base, ...seat.center, facing: seat.direction, seat: { objectId: object.id, interactionId: seat.id } }]);
        const name = `${asset.id}-${rotation}-${seat.id}`;
        const input = await capture(object, name, true);
        if (!getSeatOcclusionArtwork(asset.id, seat.id, rotation)) assert.equal(results.at(-1)!.occludedPixels, 0, `${name}: backless seat hid the character`);
        tiles.push({ input, left: column * 280, top: (index + 2) * 264 });
        if (!index) overview.push({ input, left: column * 280, top: assetIndex * 264 });
      }
      if (seats.length > 1) {
        const memberIds = [userId, ...fixture.store.getMembers().map(member => member.id).filter(id => id !== userId)];
        await updateScene(object, seats.map((seat, index) => ({ ...base, userId: memberIds[index]!, ...seat.center, facing: seat.direction, seat: { objectId: object.id, interactionId: seat.id } })));
        tiles.push({ input: await capture(object, `${asset.id}-${rotation}-occupied`, true), left: column * 280, top: (seats.length + 2) * 264 });
      }
    }
    await sharp({ create: { width: 1120, height: Math.max(...tiles.map(tile => tile.top)) + 264, channels: 4, background: "#eee9e2" } })
      .composite(tiles).png().toFile(`${output}/${asset.id}-sheet.png`);
    console.log(`${asset.id}: four orientations, ${asset.interactions!.length} seats, walking and occupancy verified`);
  }
  for (const rotation of [90, 180, 270]) {
    assert(results.find(result => result.name === `chair-office-${rotation}-seat`)!.occludedPixels > 30, `Office chair ${rotation}: no partial occlusion`);
  }
  assert.deepEqual(errors, []);
  await sharp({ create: { width: 1120, height: assets.length * 264, channels: 4, background: "#eee9e2" } })
    .composite(overview).png().toFile(`${output}/overview.png`);
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ scenarios: results.length, results, errors }, null, 2));
  fixture.stop();
  await browser.close();
}
