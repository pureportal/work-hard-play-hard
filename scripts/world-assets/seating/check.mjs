import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const root = new URL("../../../", import.meta.url);
const sharp = createRequire(new URL("apps/server/package.json", root))("sharp");
const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const catalog = await readJson("packages/shared/src/asset-catalog.json");
const artwork = await readJson("apps/client/src/world-asset-artwork.json");
const masks = await readJson("apps/client/src/world-seat-occlusion.json");
const assets = catalog.assets.filter(asset => asset.interactions?.some(interaction => interaction.type === "seat"));
assert.deepEqual(Object.keys(masks).sort(), assets.map(asset => asset.id).sort(), "Seating mask inventory is stale");
let seats = 0, variants = 0, visibleMasks = 0;
for (const asset of assets) {
  const entry = masks[asset.id];
  assert.deepEqual(Object.keys(entry.seats).sort(), asset.interactions.map(seat => seat.id).sort(), `${asset.id}: seat inventory`);
  const regions = Object.values(entry.seats).flat();
  for (const directions of Object.values(entry.seats)) assert.equal(directions.length, 4, `${asset.id}: missing rotation`);
  seats += regions.length;
  if (!entry.path) {
    assert(regions.every(region => region === null), `${asset.id}: missing mask atlas`);
    continue;
  }
  assert.equal(entry.path, `/world-assets/seat-occlusion/${asset.id}.png`);
  const mask = await sharp(await readFile(new URL(`apps/client/public${entry.path}`, root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(mask.info.width, entry.width);
  assert.equal(mask.info.height, entry.height);
  assert(entry.width <= 4096 && entry.height <= 4096);
  visibleMasks += regions.filter(Boolean).length;
  for (const [variantId, variant] of Object.entries(artwork[asset.id].variants)) {
    variants++;
    const original = await sharp(await readFile(new URL(`apps/client/public${variant.path}`, root))).ensureAlpha().raw().toBuffer();
    for (const directions of Object.values(entry.seats)) for (const [direction, region] of directions.entries()) {
      if (!region) continue;
      const label = `${asset.id}/${variantId}/${direction * 90}`;
      const { frame, bounds } = region;
      assert.equal(bounds.width * 6, frame.width, `${label}: mask scale`);
      assert.equal(bounds.height * 6, frame.height, `${label}: mask scale`);
      assert(frame.x >= 2 && frame.y >= 2 && frame.x + frame.width <= entry.width - 2 && frame.y + frame.height <= entry.height - 2, `${label}: mask padding`);
      const offsetX = (bounds.x - variant.bounds[direction].x) * 6;
      const offsetY = (bounds.y - variant.bounds[direction].y) * 6;
      assert(Math.abs(offsetX - Math.round(offsetX)) < 0.000001 && Math.abs(offsetY - Math.round(offsetY)) < 0.000001, `${label}: pixel alignment`);
      let opaquePixels = 0;
      for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const alpha = mask.data[((frame.y + y) * entry.width + frame.x + x) * 4 + 3];
        if (!alpha) continue;
        if (alpha >= 192) opaquePixels++;
        const sourceX = Math.round(offsetX) + x, sourceY = Math.round(offsetY) + y;
        const sourceFrame = variant.frames[direction];
        assert(sourceX >= 0 && sourceX < sourceFrame.width && sourceY >= 0 && sourceY < sourceFrame.height, `${label}: mask outside furniture`);
        const sourceAlpha = original[((sourceFrame.y + sourceY) * variant.width + sourceFrame.x + sourceX) * 4 + 3];
        assert(alpha <= sourceAlpha, `${label}: mask covers transparent furniture at ${sourceX},${sourceY}`);
      }
      assert(opaquePixels > 0, `${label}: empty foreground`);
    }
  }
}
console.log(`Verified ${assets.length} seating designs, ${seats} seat orientations, ${visibleMasks} foreground regions and ${variants} material atlases.`);
