import { createTestData } from "../../apps/server/src/testing/workspace-data.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type WebSocketRoute } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../../apps/client/node_modules/pixi.js";
import { WorkspaceStore } from "../../apps/server/src/store.js";
import { ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getPlacedAssetBounds, getPlacedAssetInteractions, type ServerEvent, type WorldObject, type WorldPlayer } from "../../packages/shared/src/index.js";
import { installWorldProbe } from "./playwright-animation.js";
import { sharp } from "./raster.mjs";

const output = fileURLToPath(new URL("../../artifacts/render-depth/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const store = new WorkspaceStore(createTestData());
const userId = "user-maya";
const layout = store.getLayout("floor-studio")!;
layout.objects = [];
layout.walls = [];
layout.openings = [];
layout.rooms = [];
layout.revision++;
store.updateMemberCharacter(userId, { ...DEFAULT_CHARACTER_APPEARANCE });
const base: WorldPlayer = { userId, floorId: layout.floorId, x: 704, y: 600, facing: "up", availability: "available", connected: true };
let players = [base, { ...base, userId: "user-elena", y: 574 }];
let socket: WebSocketRoute | undefined;
let tick = 0;
const send = (event: ServerEvent) => socket!.send(JSON.stringify(event));
const snapshot = () => send({ type: "world.snapshot", floorId: layout.floorId, layoutRevision: layout.revision, tick: ++tick, players });
const errors: string[] = [];
const results: { name: string; changedPixels: number }[] = [];
const tiles: { input: Buffer; left: number; top: number }[] = [];

await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
  } else if (path === "/v1/auth/session") {
    await route.fulfill({ json: { user: { id: userId, username: "depth-review", email: "depth-review@example.test" }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() }, headers });
  } else if (path === "/v1/bootstrap") {
    await route.fulfill({ json: store.getBootstrap(userId), headers });
  } else {
    await route.fulfill({ status: 404, json: { error: "Unexpected depth review request" }, headers });
  }
});
await context.routeWebSocket(/\/v1\//, (connection) => {
  socket = connection;
  send({ type: "session.ready", userId, floorId: layout.floorId });
  send({ type: "workspace.snapshot", data: store.getBootstrap(userId) });
  snapshot();
  send({ type: "session.synced" });
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await installWorldProbe(page);

async function updateScene(objects: WorldObject[], nextPlayers: WorldPlayer[]) {
  layout.objects = objects;
  layout.revision++;
  players = nextPlayers;
  send({ type: "layout.updated", layout });
  snapshot();
  await page.waitForFunction((expected) => {
    const app = globalThis.avatarWorld as unknown as Application;
    return expected.every((player) => {
      const view = app?.stage.getChildByLabel(`world-player:${player.userId}`, true);
      return view && Math.hypot(view.x - player.x, view.y - player.y) < 0.1;
    });
  }, players);
  await page.waitForFunction((ids) => {
    const app = globalThis.avatarWorld as unknown as Application;
    return ids.every((id) => {
      const view = app.stage.getChildByLabel(`world-asset:${id}`, true)!;
      return view?.getChildByLabel("artwork")?.children.every((child) => child.visible);
    });
  }, objects.map((object) => object.id));
}

async function verifyOverlap(name: string, back: string, front: string, center = { x: 704, y: 590 }) {
  const capture = await page.evaluate(({ back, front, center }) => {
    const app = globalThis.avatarWorld as unknown as Application;
    app.ticker.stop();
    const backView = app.stage.getChildByLabel(back, true)!;
    const frontView = app.stage.getChildByLabel(front, true)!;
    if (backView.parent !== frontView.parent) throw new Error("Overlapping objects must share a depth layer");
    const depth = backView.parent!;
    const before = [backView.zIndex, frontView.zIndex];
    const screen = depth.toGlobal(center);
    try {
      app.render();
      const actual = app.canvas.toDataURL();
      backView.zIndex = Math.min(...before);
      frontView.zIndex = Math.max(...before);
      depth.sortChildren();
      app.render();
      const expected = app.canvas.toDataURL();
      backView.zIndex = Math.max(...before);
      frontView.zIndex = Math.min(...before);
      depth.sortChildren();
      app.render();
      const reversed = app.canvas.toDataURL();
      return { actual, expected, reversed, screen: { x: screen.x, y: screen.y }, before };
    } finally {
      [backView.zIndex, frontView.zIndex] = before as [number, number];
      depth.sortChildren();
      app.ticker.start();
    }
  }, { back, front, center });
  assert(capture.before[0]! < capture.before[1]!, `${name}: incorrect draw order`);
  assert.equal(capture.actual, capture.expected, `${name}: rendered pixels differ from expected order`);
  const actual = Buffer.from(capture.actual.split(",")[1]!, "base64");
  const reversed = Buffer.from(capture.reversed.split(",")[1]!, "base64");
  const actualPixels: Buffer = await sharp(actual).ensureAlpha().raw().toBuffer();
  const reversedPixels: Buffer = await sharp(reversed).ensureAlpha().raw().toBuffer();
  let changedPixels = 0;
  for (let index = 0; index < actualPixels.length; index += 4) {
    if (actualPixels[index] !== reversedPixels[index] || actualPixels[index + 1] !== reversedPixels[index + 1] || actualPixels[index + 2] !== reversedPixels[index + 2]) changedPixels++;
  }
  assert(changedPixels > 10, `${name}: scenario must contain visible overlap`);
  const crop = await sharp(actual).extract({ left: Math.round(capture.screen.x) - 110, top: Math.round(capture.screen.y) - 150, width: 220, height: 220 }).png().toBuffer();
  await writeFile(`${output}/${name}.png`, crop);
  const index = results.length;
  tiles.push({ input: crop, left: index % 4 * 220, top: Math.floor(index / 4) * 245 });
  tiles.push({ input: Buffer.from(`<svg width="220" height="25"><text x="110" y="17" text-anchor="middle" font-family="Arial" font-size="11">${name}</text></svg>`), left: index % 4 * 220, top: Math.floor(index / 4) * 245 + 220 });
  results.push({ name, changedPixels });
  console.log(`${name}: ${changedPixels} overlap pixels verified`);
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You") && globalThis.findAvatar("Elena")));
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  for (let zoom = 0; zoom < 5; zoom++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await verifyOverlap("avatars-front", "world-player:user-elena", "world-player:user-maya");
  await updateScene([], [{ ...base, y: 548 }, { ...base, userId: "user-elena", y: 574 }]);
  await verifyOverlap("avatars-crossed", "world-player:user-maya", "world-player:user-elena");
  for (const rotation of ASSET_ROTATIONS) {
    const chair: WorldObject = { id: "chair", floorId: layout.floorId, assetId: "chair-office", variantId: "white", rotation, x: 688, y: 568 };
    const interaction = getPlacedAssetInteractions(chair)[0]!;
    await updateScene([chair], [{ ...base, y: chair.y - 12 }]);
    await verifyOverlap(`chair-${rotation}-behind`, "world-player:user-maya", "world-asset:chair");
    await updateScene([chair], [{ ...base, y: chair.y + 44 }]);
    await verifyOverlap(`chair-${rotation}-front`, "world-asset:chair", "world-player:user-maya");
    await updateScene([chair], [{ ...base, ...interaction.center, facing: interaction.direction, seat: { objectId: chair.id, interactionId: interaction.id } }]);
    await verifyOverlap(`chair-${rotation}-seated`, rotation === 180 ? "world-player:user-maya" : "world-asset:chair", rotation === 180 ? "world-asset:chair" : "world-player:user-maya");
  }
  for (const assetId of ["chair-stool", "chair-ottoman"]) {
    const seat: WorldObject = { id: "backless-seat", floorId: layout.floorId, assetId, variantId: "white", rotation: 180, x: 688, y: 568 };
    const interaction = getPlacedAssetInteractions(seat)[0]!;
    await updateScene([seat], [{ ...base, ...interaction.center, facing: interaction.direction, seat: { objectId: seat.id, interactionId: interaction.id } }]);
    await verifyOverlap(`${assetId}-backless`, "world-asset:backless-seat", "world-player:user-maya", interaction.center);
  }
  for (const rotation of ASSET_ROTATIONS) {
    const desk: WorldObject = { id: "desk", floorId: layout.floorId, assetId: "desk-straight", variantId: "sage", rotation, x: 672, y: 552 };
    const bounds = getPlacedAssetBounds(desk);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await updateScene([desk], [{ ...base, x: center.x, y: bounds.y - 12 }]);
    await verifyOverlap(`desk-${rotation}-behind`, "world-player:user-maya", "world-asset:desk", center);
    await updateScene([desk], [{ ...base, x: center.x, y: bounds.y + bounds.height + 12 }]);
    await verifyOverlap(`desk-${rotation}-front`, "world-asset:desk", "world-player:user-maya", center);
  }
  assert.deepEqual(errors, []);
} finally {
  if (tiles.length) await sharp({ create: { width: 880, height: Math.ceil(results.length / 4) * 245, channels: 4, background: "#ede9e3" } }).composite(tiles).png().toFile(`${output}/contact-sheet.png`);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
