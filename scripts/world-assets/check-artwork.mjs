import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isBackdropColor } from "./palette.mjs";
import { pixelLabImagePath } from "./source-images.mjs";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const artwork = JSON.parse(await readFile(new URL("../../apps/client/src/world-asset-artwork.json", import.meta.url), "utf8"));
const sources = JSON.parse(await readFile(new URL("./artwork-sources.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(artwork).sort(), catalog.assets.map((asset) => asset.id).sort(), "Every catalog asset needs artwork");
let designs = 0;
for (const asset of catalog.assets) {
  const entry = artwork[asset.id];
  assert(Number.isFinite(entry.elevation) && entry.elevation >= 0, `${asset.id}: invalid display elevation`);
  if (asset.placement.layer === "ground") assert.equal(entry.elevation, 0, `${asset.id}: ground artwork cannot overhang`);
  const variants = catalog.themeSets.find((theme) => theme.id === asset.themeSetId).variants;
  assert.deepEqual(Object.keys(entry.variants).sort(), variants.map((variant) => variant.id).sort(), `${asset.id}: every design needs artwork`);
  const reviewed = sources[asset.id];
  assert(reviewed && Object.values(reviewed).every((source) => source.review && source.frames.length === 4), `${asset.id}: missing artwork review`);
  assert.deepEqual(Object.keys(reviewed).sort(), (asset.kind === "floor-tile" ? variants : [variants[0]]).map((variant) => variant.id).sort(), `${asset.id}: missing native source design`);
  for (const source of Object.values(reviewed)) {
    for (const frame of source.frames) {
      const { url, x, y, width, height } = frame;
      assert([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0, `${asset.id}: invalid source crop`);
      const raw = pixelLabImagePath(url);
      const metadata = await sharp(await readFile(raw)).metadata();
      assert(x + width <= metadata.width && y + height <= metadata.height, `${asset.id}: source crop exceeds native canvas`);
    }
  }
  const hashes = new Set();
  let baseFrames;
  for (const variant of variants) {
    const design = entry.variants[variant.id];
    assert.equal(design.path, `/world-assets/${asset.id}/${variant.id}.png`);
    const file = fileURLToPath(new URL(`../../apps/client/public${design.path}`, import.meta.url));
    const png = await readFile(file);
    hashes.add(createHash("sha256").update(png).digest("hex"));
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, design.width, `${asset.id}/${variant.id}: atlas width`);
    assert.equal(info.height, design.height, `${asset.id}/${variant.id}: atlas height`);
    assert.equal(design.frames.length, 4, `${asset.id}/${variant.id}: four directions required`);
    const framePixels = [];
    for (const [index, frame] of design.frames.entries()) {
      assert(Object.values(frame).every(Number.isInteger), `${asset.id}: native pixel coordinates required`);
      assert(frame.x >= 2 && frame.y >= 2 && frame.width > 0 && frame.height > 0);
      assert(frame.x + frame.width <= info.width - 2 && frame.y + frame.height <= info.height - 2);
      if (index > 0) assert(frame.x >= design.frames[index - 1].x + design.frames[index - 1].width + 4, `${asset.id}: frames need transparent gutters`);
      const pixels = await sharp(png).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).ensureAlpha().raw().toBuffer();
      framePixels.push(pixels);
      let visible = 0;
      let changed = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] < 16) continue;
        assert(!isBackdropColor(pixels[offset], pixels[offset + 1], pixels[offset + 2]), `${asset.id}: opaque key-color pixel`);
        if (baseFrames && Math.abs(pixels[offset] - baseFrames[index][offset]) + Math.abs(pixels[offset + 1] - baseFrames[index][offset + 1]) + Math.abs(pixels[offset + 2] - baseFrames[index][offset + 2]) > 24) changed++;
        visible++;
      }
      assert(visible > 30, `${asset.id}/${variant.id}/${index}: empty artwork`);
      if (baseFrames) {
        assert(!pixels.equals(baseFrames[index]), `${asset.id}/${variant.id}/${index}: duplicate directional design`);
        if (asset.kind !== "floor-tile") assert(changed / visible >= 0.02, `${asset.id}/${variant.id}/${index}: material must differ visibly from the base design`);
      }
    }
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 16) continue;
        assert(design.frames.some((frame) => x >= frame.x && x < frame.x + frame.width && y >= frame.y && y < frame.y + frame.height), `${asset.id}: visible pixels outside frames`);
      }
    }
    baseFrames ??= framePixels;
    designs++;
  }
  assert.equal(hashes.size, variants.length, `${asset.id}: color designs must be visually distinct`);
}
console.log(`Verified ${catalog.assets.length} assets, ${designs} designs, ${designs * 4} directional frames.`);
