import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { DEFAULT_CHARACTER_APPEARANCE, getCharacterLayerPaths, CHARACTER_CANVAS_SIZE, CHARACTER_ATLAS_HEIGHT } from "../../packages/shared/src/index.js";

const require = createRequire(new URL("../../apps/server/package.json", import.meta.url));
const sharp: typeof import("../../apps/server/node_modules/sharp/lib/index.js") = require("sharp");
const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, process.argv[2] ?? "artifacts/performance-investigation-2026-09-17", "portrait-experiment");
await mkdir(output, { recursive: true });
const manifest: Record<string, string[]> = JSON.parse(await readFile(resolve(root, "apps/client/src/optimized-images.json"), "utf8"));
const results = [];
for (const [index, path] of getCharacterLayerPaths(DEFAULT_CHARACTER_APPEARANCE).entries()) {
  const original = await readFile(resolve(root, "apps/client/public", path.slice(1)));
  const existing = await readFile(resolve(root, "apps/client/public/optimized-images", `${manifest[path]![0]}.webp`));
  const tiles = [];
  for (let plane = 0; plane < 2; plane++) {
    for (let direction = 0; direction < 4; direction++) tiles.push(await sharp(original).extract({
      left: 0, top: plane * CHARACTER_ATLAS_HEIGHT + direction * CHARACTER_CANVAS_SIZE,
      width: CHARACTER_CANVAS_SIZE, height: CHARACTER_CANVAS_SIZE,
    }).png().toBuffer());
  }
  const packed = await sharp({ create: { width: CHARACTER_CANVAS_SIZE, height: CHARACTER_CANVAS_SIZE * 8, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles.map((input, tile) => ({ input, left: 0, top: tile * CHARACTER_CANVAS_SIZE })))
    .webp({ lossless: true, effort: 6 }).toBuffer();
  for (const [tile, input] of tiles.entries()) {
    const expected = await sharp(input).ensureAlpha().raw().toBuffer();
    const actual = await sharp(packed).extract({ left: 0, top: tile * CHARACTER_CANVAS_SIZE, width: CHARACTER_CANVAS_SIZE, height: CHARACTER_CANVAS_SIZE })
      .ensureAlpha().raw().toBuffer();
    assert.equal(actual.length, expected.length);
    for (let offset = 0; offset < actual.length; offset += 4) {
      assert.equal(actual[offset + 3], expected[offset + 3]);
      if (expected[offset + 3]) assert.deepEqual(actual.subarray(offset, offset + 3), expected.subarray(offset, offset + 3));
    }
  }
  await writeFile(resolve(output, `layer-${index}.webp`), packed);
  results.push({ source: path, currentWebpBytes: existing.length, packedWebpBytes: packed.length, verifiedTiles: tiles.length });
}
const result = { note: "Offline experiment only. Four idle directions, color and depth, without resizing; no runtime changes. Visible pixels and alpha compared to original PNG tiles.",
  originalLayerPixels: 960 * 3840, packedLayerPixels: 120 * 960, results };
await writeFile(resolve(output, "measurements.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
