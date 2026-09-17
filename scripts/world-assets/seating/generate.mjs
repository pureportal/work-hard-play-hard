import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const root = new URL("../../../", import.meta.url);
const sharp = createRequire(new URL("apps/server/package.json", root))("sharp");
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const catalog = await readJson("packages/shared/src/asset-catalog.json");
const artwork = await readJson("apps/client/src/world-asset-artwork.json");
const rendered = await readJson("scripts/world-assets/blockbench/renders/manifest.json");
const manifestPath = new URL("apps/client/src/world-seat-occlusion.json", root);
const requested = process.argv.slice(2);
const assets = catalog.assets.filter(asset => asset.interactions?.some(interaction => interaction.type === "seat"));
assert(requested.every(id => assets.some(asset => asset.id === id)), "Unknown seating asset");
const manifest = requested.length ? await readJson("apps/client/src/world-seat-occlusion.json") : {};
const hash = input => createHash("sha256").update(input).digest("hex");
const sourceHashes = {};
for (const asset of assets) for (const variant of Object.values(artwork[asset.id].variants)) {
  sourceHashes[variant.path] = hash(await readFile(new URL(`apps/client/public${variant.path}`, root)));
}
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.Codecs?.project?.parse === "function");
  const renderer = (await readFile(new URL("render.cjs", import.meta.url), "utf8")).replace(/^module\.exports = .*;\s*$/m, "");
  await page.evaluate(`(() => { ${renderer}\nwindow.renderSeatOcclusion = renderSeatOcclusion; })()`);
  for (const asset of assets.filter(asset => !requested.length || requested.includes(asset.id))) {
    const reference = rendered.results.find(entry => entry.assetId === asset.id);
    const [variantId, variant] = Object.entries(reference.variants)[0];
    const original = artwork[asset.id].variants[variantId];
    const source = await readJson(variant.model);
    const seats = asset.interactions.filter(interaction => interaction.type === "seat").map(interaction => ({
      id: interaction.id,
      x: (interaction.range.x + interaction.range.width / 2) * catalog.rasterSize - variant.footprint.width / 2,
      z: (interaction.range.y + interaction.range.height / 2) * catalog.rasterSize - variant.footprint.height / 2,
    }));
    const masks = await page.evaluate(async ({ source, seats, settings }) => window.renderSeatOcclusion({
      THREE, Codecs, Canvas, newProject, Formats, get Project() { return Project; },
    }, source, seats, settings), { source, seats, settings: {
      size: variant.frames[0].width, pixelsPerUnit: reference.pixelsPerUnit, seatHeight: variant.seatHeight,
    } });
    const originals = await Promise.all(original.frames.map(frame => sharp(fileURLToPath(new URL(`apps/client/public${original.path}`, root)))
      .extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).ensureAlpha().raw().toBuffer()));
    const crops = [];
    const regions = new Map();
    const interactions = Object.fromEntries(seats.map(seat => [seat.id, [null, null, null, null]]));
    for (const mask of masks) {
      const direction = mask.direction;
      const bounds = original.bounds[direction];
      const frame = original.frames[direction];
      const ground = variant.frames[direction].groundFootprint;
      const data = await sharp(Buffer.from(mask.png, "base64")).extract({
        left: Math.round(ground.x + bounds.x * reference.pixelsPerUnit),
        top: Math.round(ground.y + bounds.y * reference.pixelsPerUnit), width: frame.width, height: frame.height,
      }).ensureAlpha().raw().toBuffer();
      let left = frame.width, top = frame.height, right = -1, bottom = -1, opaquePixels = 0;
      for (let pixel = 0; pixel < data.length; pixel += 4) {
        data[pixel] = data[pixel + 1] = data[pixel + 2] = 255;
        data[pixel + 3] = Math.min(data[pixel + 3], originals[direction][pixel + 3]);
        if (data[pixel + 3] >= 192) opaquePixels++;
        if (data[pixel + 3]) {
          const x = pixel / 4 % frame.width, y = Math.floor(pixel / 4 / frame.width);
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      if (!opaquePixels) continue;
      const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
      const input = await sharp(data, { raw: { width: frame.width, height: frame.height, channels: 4 } }).extract(crop).png().toBuffer();
      const maskBounds = { x: bounds.x + left / reference.pixelsPerUnit, y: bounds.y + top / reference.pixelsPerUnit,
        width: crop.width / reference.pixelsPerUnit, height: crop.height / reference.pixelsPerUnit };
      const key = hash(input) + JSON.stringify(maskBounds);
      let region = regions.get(key);
      if (!region) {
        region = { frame: { x: 0, y: 0, width: crop.width, height: crop.height }, bounds: maskBounds };
        regions.set(key, region);
        crops.push({ input, width: crop.width, height: crop.height, region });
      }
      interactions[mask.seat][direction] = region;
    }
    if (!crops.length) {
      manifest[asset.id] = { seats: interactions };
      await unlink(new URL(`apps/client/public/world-assets/seat-occlusion/${asset.id}.png`, root))
        .catch(error => { if (error.code !== "ENOENT") throw error; });
      continue;
    }
    const cellWidth = Math.max(...crops.map(crop => crop.width)) + 4;
    const cellHeight = Math.max(...crops.map(crop => crop.height)) + 4;
    const columns = Math.min(4, crops.length);
    const width = cellWidth * columns, height = cellHeight * Math.ceil(crops.length / columns);
    assert(width <= 4096 && height <= 4096, `${asset.id}: mask atlas exceeds texture limit`);
    const composite = crops.map((crop, index) => {
      const x = index % columns * cellWidth + 2, y = Math.floor(index / columns) * cellHeight + 2;
      crop.region.frame.x = x;
      crop.region.frame.y = y;
      return { input: crop.input, left: x, top: y };
    });
    const path = `/world-assets/seat-occlusion/${asset.id}.png`;
    await mkdir(new URL("apps/client/public/world-assets/seat-occlusion/", root), { recursive: true });
    await sharp({ create: { width, height, channels: 4, background: "#00000000" } }).composite(composite).png()
      .toFile(fileURLToPath(new URL(`apps/client/public${path}`, root)));
    manifest[asset.id] = { path, width, height, seats: interactions };
    console.log(`${asset.id}: ${crops.length} occlusion masks`);
  }
  assert.deepEqual(errors, []);
  for (const [path, expected] of Object.entries(sourceHashes)) {
    assert.equal(hash(await readFile(new URL(`apps/client/public${path}`, root))), expected, `Original changed: ${path}`);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Generated seating masks; ${Object.keys(sourceHashes).length} original atlases unchanged.`);
} finally {
  await browser.close();
}
