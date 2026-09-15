import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const assetId = process.argv.find(argument => argument.startsWith("--asset="))?.slice(8) ?? "light-arc";
const catalog = JSON.parse(await readFile("packages/shared/src/asset-catalog.json", "utf8"));
const artwork = JSON.parse(await readFile("apps/client/src/world-asset-artwork.json", "utf8"));
const asset = catalog.assets.find(asset => asset.id === assetId);
assert(asset?.buildable, "A buildable catalog asset is required");
const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-audit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [];
const verified = [];
let placedId;
let supportId;
let originalIds;
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/(world-assets|world-architecture)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
await page.addInitScript(() => { globalThis.__PIXI_APP_INIT__ = app => { globalThis.auditWorld = app; }; });

async function layout() {
  const response = await context.request.get("http://127.0.0.1:3001/v1/bootstrap");
  assert.equal(response.status(), 200);
  return (await response.json()).layouts.find(layout => layout.floorId === "floor-studio");
}

async function ready() {
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.waitForFunction(() => {
    const queue = globalThis.auditWorld ? [globalThis.auditWorld.stage] : [];
    for (const node of queue) queue.push(...node.children ?? []);
    const sprites = queue.filter(node => node.label?.startsWith("/world-"));
    return sprites.length > 0 && sprites.every(sprite => sprite.visible);
  });
}

async function selectPlaced() {
  await selectObject(placedId, asset.name);
}

async function selectObject(id, name) {
  if (!await page.locator(".build-panel").isVisible()) await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await ready();
  const point = await page.evaluate(id => {
    const app = globalThis.auditWorld;
    const node = app.stage.getChildByLabel(`world-asset:${id}`, true);
    const sprite = node.getChildByLabel("artwork").children.at(-1);
    const frame = sprite.texture.frame;
    const bitmap = document.createElement("canvas");
    bitmap.width = frame.width;
    bitmap.height = frame.height;
    const context = bitmap.getContext("2d");
    context.drawImage(sprite.texture.source.resource, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
    const pixels = context.getImageData(0, 0, frame.width, frame.height).data;
    let hit;
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
      if (pixels[(y * frame.width + x) * 4 + 3] < 200) continue;
      const distance = (x - frame.width / 2) ** 2 + (y - frame.height * 0.7) ** 2;
      if (!hit || distance < hit.distance) hit = { x, y, distance };
    }
    if (!hit) throw new Error(`No visible artwork for ${id}`);
    const local = { x: sprite.x + (hit.x + 0.5) / frame.width * sprite.width, y: sprite.y + (hit.y + 0.5) / frame.height * sprite.height };
    const point = node.toGlobal(local);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + point.x * canvas.width / app.screen.width, y: canvas.y + point.y * canvas.height / app.screen.height };
  }, id);
  await page.mouse.click(point.x, point.y);
  await page.getByRole("region", { name: `Selected ${name}`, exact: true }).waitFor();
}

async function placeAsset(definition, point) {
  const before = new Set((await layout()).objects.map(object => object.id));
  await page.getByRole("tab", { name: catalog.categories.find(category => category.id === definition.category).name, exact: true }).click();
  await page.getByRole("button", { name: definition.name, exact: true }).click();
  if (!point) {
    const canvas = await page.locator(".world-canvas canvas").boundingBox();
    const panel = await page.locator(".build-panel").boundingBox();
    for (const y of [160, 210, 260, 310]) {
      for (let x = canvas.x + 80; x < panel.x - 80; x += 96) {
        await page.mouse.move(x, y);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (await page.locator(".placement-confirm").isEnabled()) { point = { x, y }; break; }
      }
      if (point) break;
    }
  }
  assert(point, "No visible placement site");
  await page.mouse.move(point.x, point.y);
  await page.locator(".placement-confirm:enabled").waitFor();
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => document.querySelector(".placement-confirm")?.matches(":disabled"));
  const added = (await layout()).objects.filter(object => !before.has(object.id));
  assert.equal(added.length, 1);
  assert.equal(added[0].assetId, definition.id);
  return added[0];
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await ready();
  originalIds = (await layout()).objects.map(object => object.id);
  await page.getByRole("button", { name: "Build", exact: true }).click();
  let point;
  if (asset.placement.layer === "surface") {
    const support = await placeAsset(catalog.assets.find(asset => asset.id === "table-chabudai"));
    supportId = support.id;
    await writeFile(`${output}/live-placement-journal.json`, JSON.stringify({ supportId, floorId: "floor-studio" }));
    await ready();
    point = await page.evaluate(id => {
      const app = globalThis.auditWorld;
      const node = app.stage.getChildByLabel(`world-asset:${id}`, true);
      const point = node.toGlobal({ x: 32, y: 24 - 14.65 / Math.SQRT2 });
      const canvas = app.canvas.getBoundingClientRect();
      return { x: canvas.x + point.x * canvas.width / app.screen.width, y: canvas.y + point.y * canvas.height / app.screen.height };
    }, supportId);
  }
  placedId = (await placeAsset(asset, point)).id;
  await writeFile(`${output}/live-placement-journal.json`, JSON.stringify({ objectId: placedId, supportId, floorId: "floor-studio" }));
  await selectPlaced();
  for (const rotation of [0, 90, 180, 270]) {
    if (rotation) {
      await page.getByRole("region", { name: `Selected ${asset.name}`, exact: true }).getByRole("button", { name: "Rotate", exact: true }).click();
    }
    let placed = (await layout()).objects.find(object => object.id === placedId);
    const deadline = Date.now() + 10_000;
    while (placed?.rotation !== rotation && Date.now() < deadline) {
      await page.waitForTimeout(50);
      placed = (await layout()).objects.find(object => object.id === placedId);
    }
    assert.equal(placed.rotation, rotation);
    assert(Number.isInteger(placed.x / 16));
    assert(Number.isInteger(placed.y / 16));
    await ready();
    await page.waitForFunction(({ id, frames }) => {
      const sprite = globalThis.auditWorld.stage.getChildByLabel(`world-asset:${id}`, true)?.getChildByLabel("artwork")?.children.at(-1);
      return sprite?.visible && frames.some(frame => sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y);
    }, { id: placedId, frames: artwork[assetId].variants[placed.variantId].frames.filter((_, index) => index % 4 === rotation / 90) });
    await page.screenshot({ path: `${output}/live-placed-${rotation}.png` });
    verified.push({ rotation, x: placed.x, y: placed.y, gridAligned: true });
  }
  const saved = (await layout()).objects.find(object => object.id === placedId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  assert.deepEqual((await layout()).objects.find(object => object.id === placedId), saved);
  await page.screenshot({ path: `${output}/live-placement-reloaded.png` });
  verified.push({ reloadedPlacement: true });
  assert.deepEqual(errors, []);
} finally {
  try {
    if (placedId) {
      await selectPlaced();
      await page.getByRole("region", { name: `Selected ${asset.name}`, exact: true }).getByRole("button", { name: "Remove", exact: true }).click();
      await page.getByRole("region", { name: `Selected ${asset.name}`, exact: true }).waitFor({ state: "hidden" });
      const after = await layout();
      assert(!after.objects.some(object => object.id === placedId), "Live review object must be removed");
      assert(originalIds.every(id => after.objects.some(object => object.id === id)), "Original objects must be preserved");
      await writeFile(`${output}/live-placement-journal.json`, JSON.stringify({ objectId: placedId, removed: true }));
      verified.push({ testObjectRemoved: true, originalObjectsPreserved: true });
    }
    if (supportId) {
      await selectObject(supportId, "Low tea table");
      const selected = page.getByRole("region", { name: "Selected Low tea table", exact: true });
      await selected.getByRole("button", { name: "Remove", exact: true }).click();
      await selected.waitFor({ state: "hidden" });
      assert(!(await layout()).objects.some(object => object.id === supportId));
      verified.push({ supportRemoved: true });
      await writeFile(`${output}/live-placement-journal.json`, JSON.stringify({ objectId: placedId, supportId, removed: true }));
    }
    await writeFile(`${output}/live-placement-report.json`, JSON.stringify({ verified, errors }, null, 2));
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ verified, errors }));
