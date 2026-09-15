import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { getAssetFootprintCells, getAssetRasterSize } from "../../packages/shared/src/assets.ts";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const workspace = new URL("../../", import.meta.url);
const architecture = process.argv.includes("--architecture");
const catalog = architecture ? createRequire(import.meta.url)("./blockbench/architecture.cjs").architectureCatalog
  : JSON.parse(await readFile(new URL("packages/shared/src/asset-catalog.json", workspace), "utf8"));
const artwork = JSON.parse(await readFile(new URL(`apps/client/src/${architecture ? "world-architecture" : "world-asset"}-artwork.json`, workspace), "utf8"));
const sources = JSON.parse(await readFile(new URL(architecture ? "blockbench/architecture/artwork-sources.json" : "artwork-sources.json", import.meta.url), "utf8"));
const renders = JSON.parse(await readFile(new URL(`blockbench/${architecture ? "architecture/" : ""}renders/manifest.json`, import.meta.url), "utf8"));
const ids = catalog.assets.map(asset => asset.id).sort();
assert.deepEqual(Object.keys(artwork).sort(), ids);
assert.deepEqual(Object.keys(sources).sort(), ids);
assert.deepEqual(renders.results.map(result => result.assetId).sort(), ids);
let designs = 0;
let frames = 0;
for (const asset of catalog.assets) {
  const entry = artwork[asset.id];
  const rendered = renders.results.find(result => result.assetId === asset.id);
  const variants = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants;
  assert(Number.isFinite(entry.elevation) && entry.elevation >= 0, `${asset.id}: elevation`);
  if (asset.placement.layer === "ground") assert.equal(entry.elevation, 0);
  if (asset.footprint.some(region => region.allows?.includes("decoration"))) assert(entry.surfaceHeight > 0, `${asset.id}: modeled surface height`);
  if (asset.interactions?.some(interaction => interaction.type === "seat")) {
    assert(entry.seatHeight > 0, `${asset.id}: cushion height`);
    assert.equal(typeof entry.seatHasBack, "boolean", `${asset.id}: seat back`);
  }
  assert.deepEqual(Object.keys(entry.variants).sort(), variants.map(variant => variant.id).sort());
  assert.deepEqual(Object.keys(sources[asset.id]).sort(), variants.map(variant => variant.id).sort());
  const hashes = new Set();
  let basePixels;
  let baseFrames;
  let baseWidth;
  for (const variant of variants) {
    const source = sources[asset.id][variant.id];
    const design = entry.variants[variant.id];
    assert.equal(source.generator, "blockbench");
    const model = JSON.parse(await readFile(new URL(source.model, workspace), "utf8"));
    assert(model.elements.length && model.textures.length, `${asset.id}/${variant.id}: editable model`);
    for (const element of model.elements) for (const face of Object.values(element.faces ?? {})) {
      assert(Number.isInteger(face.texture) && model.textures[face.texture], `${asset.id}/${variant.id}/${element.name}: untextured face`);
    }
    const frameCount = (entry.animation?.frames ?? 1) * 4;
    assert.equal(source.frames.length, frameCount);
    if (entry.animation) {
      assert.equal(model.animations.length, 1);
      assert.equal(model.animations[0].loop, "loop");
      assert.equal(model.animations[0].length * 1000, entry.animation.frames * entry.animation.frameDuration);
      assert.deepEqual(rendered.variants[variant.id].animation, entry.animation);
    }
    const png = await readFile(new URL(`apps/client/public${design.path}`, workspace));
    hashes.add(createHash("sha256").update(png).digest("hex"));
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [design.width, design.height]);
    assert.equal(design.frames.length, frameCount);
    assert.equal(design.bounds.length, frameCount);
    const animationHashes = [new Set(), new Set(), new Set(), new Set()];
    for (const [index, frame] of design.frames.entries()) {
      const bounds = design.bounds[index];
      if (entry.animation) {
        assert.deepEqual(bounds, design.bounds[index % 4], `${asset.id}: moving anchor`);
        const pixels = await sharp(png).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).raw().toBuffer();
        animationHashes[index % 4].add(createHash("sha256").update(pixels).digest("hex"));
      }
      const projection = rendered.variants[variant.id].frames[index].groundFootprint;
      const footprint = rendered.variants[variant.id].footprint;
      const sideways = index % 2 === 1;
      assert(Math.abs(projection.width / rendered.pixelsPerUnit - (sideways ? footprint.height : footprint.width)) < 0.000001);
      assert(Math.abs(projection.height / rendered.pixelsPerUnit - (sideways ? footprint.width : footprint.height)) < 0.000001);
      assert(Math.abs(bounds.width / frame.width - 1 / rendered.pixelsPerUnit) < 0.000001);
      assert(Math.abs(bounds.height / frame.height - 1 / rendered.pixelsPerUnit) < 0.000001);
      assert(Object.values(frame).every(Number.isInteger));
      assert(frame.x >= 2 && frame.y >= 2 && frame.x + frame.width <= info.width - 2 && frame.y + frame.height <= info.height - 2);
      let visible = 0;
      for (let y = frame.y; y < frame.y + frame.height; y++) for (let x = frame.x; x < frame.x + frame.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) visible++;
      assert(visible > 30, `${asset.id}/${variant.id}/${index}: empty frame`);
      if (asset.kind === "floor-tile" || ["rug-woven", "rug-tatami"].includes(asset.id)) {
        for (let y = frame.y; y < frame.y + frame.height; y++) for (let x = frame.x; x < frame.x + frame.width; x++) {
          assert.equal(data[(y * info.width + x) * 4 + 3], 255, `${asset.id}/${variant.id}/${index}: transparent floor pixel at ${x},${y}`);
        }
        for (const offset of [1, 8, 16]) for (const [x, y] of [[-offset, -offset], [frame.width - 1 + offset, -offset], [-offset, frame.height - 1 + offset], [frame.width - 1 + offset, frame.height - 1 + offset], [-offset, Math.floor(frame.height / 2)], [frame.width - 1 + offset, Math.floor(frame.height / 2)], [Math.floor(frame.width / 2), -offset], [Math.floor(frame.width / 2), frame.height - 1 + offset]]) {
          const source = ((frame.y + Math.max(0, Math.min(frame.height - 1, y))) * info.width + frame.x + Math.max(0, Math.min(frame.width - 1, x))) * 4;
          const gutter = ((frame.y + y) * info.width + frame.x + x) * 4;
          assert.deepEqual(data.subarray(gutter, gutter + 4), data.subarray(source, source + 4), `${asset.id}/${variant.id}/${index}: floor texture gutter`);
        }
      }
      if (["desk-corner", "sofa-corner", "light-arc"].includes(asset.id)) {
        const rotation = index * 90;
        const cells = getAssetFootprintCells(asset, rotation);
        const size = getAssetRasterSize(asset, rotation);
        const height = asset.id === "light-arc" ? 1 : entry.surfaceHeight ?? entry.seatHeight;
        for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
          const expected = cells.some(cell => cell.x === x && cell.y === y && (asset.id !== "light-arc" || cell.solid));
          const pixelX = frame.x + Math.floor((x * 16 + 8 - bounds.x) * rendered.pixelsPerUnit);
          const pixelY = frame.y + Math.floor((y * 16 + 8 - height / Math.SQRT2 - bounds.y) * rendered.pixelsPerUnit);
          const inFrame = pixelX >= frame.x && pixelX < frame.x + frame.width && pixelY >= frame.y && pixelY < frame.y + frame.height;
          const opaque = inFrame && data[(pixelY * info.width + pixelX) * 4 + 3] >= 32;
          assert.equal(opaque, expected, `${asset.id}/${variant.id}/${rotation}: artwork disagrees with footprint at ${x},${y}`);
        }
      }
      if (basePixels) {
        const base = baseFrames[index];
        assert.equal(frame.width, base.width);
        assert.equal(frame.height, base.height);
        let changed = 0;
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
          const pixel = ((frame.y + y) * info.width + frame.x + x) * 4;
          const previous = ((base.y + y) * baseWidth + base.x + x) * 4;
          if (data[pixel + 3] && Math.max(
            Math.abs(data[pixel] - basePixels[previous]),
            Math.abs(data[pixel + 1] - basePixels[previous + 1]),
            Math.abs(data[pixel + 2] - basePixels[previous + 2]),
          ) >= 12) changed++;
        }
        assert(changed / visible >= 0.02, `${asset.id}/${variant.id}/${index}: material changes less than 2% of the visible artwork`);
      }
      const native = await sharp(await readFile(new URL(source.frames[index].path, workspace))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let x = 0; x < native.info.width; x++) {
        assert.equal(native.data[x * 4 + 3], 0, `${asset.id}: clipped top`);
        assert.equal(native.data[((native.info.height - 1) * native.info.width + x) * 4 + 3], 0, `${asset.id}: clipped bottom`);
      }
      for (let y = 0; y < native.info.height; y++) {
        assert.equal(native.data[y * native.info.width * 4 + 3], 0, `${asset.id}: clipped left`);
        assert.equal(native.data[(y * native.info.width + native.info.width - 1) * 4 + 3], 0, `${asset.id}: clipped right`);
      }
    }
    if (entry.animation) assert(animationHashes.every(hashes => hashes.size >= 4), `${asset.id}: animation does not move in every direction`);
    if (!basePixels) { basePixels = data; baseFrames = design.frames; baseWidth = info.width; }
    designs++;
    frames += frameCount;
  }
  assert.equal(hashes.size, variants.length, `${asset.id}: duplicate materials`);
}
console.log(`Verified ${ids.length} Blockbench assets, ${designs} materials, ${frames} frames, calibrated footprints and transparent borders.`);
