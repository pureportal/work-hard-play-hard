import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { recolorMaterial } from "./palette.mjs";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const manifestFile = new URL("../../apps/client/src/world-asset-artwork.json", import.meta.url);
const artwork = JSON.parse(await readFile(manifestFile, "utf8"));
const requested = process.argv.slice(2);
const ids = requested.length ? requested : Object.keys(JSON.parse(await readFile(new URL("./artwork-sources.json", import.meta.url), "utf8")));
const directions = ["south", "west", "north", "east"];

function cropBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Empty directional image");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

for (const assetId of ids) {
  const asset = catalog.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Unknown asset ${assetId}`);
  const theme = catalog.themeSets.find((entry) => entry.id === asset.themeSetId);
  const materialSheets = asset.kind === "floor-tile";
  const sourceVariants = materialSheets ? theme.variants : [theme.variants[0]];
  const variantFrames = new Map();
  for (const variant of sourceVariants) {
    const frames = await Promise.all(directions.map(async (direction) => {
      const input = new URL(`./directions/${assetId}/${variant.id}/${direction}.png`, import.meta.url);
      const { data, info } = await sharp(fileURLToPath(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const crop = cropBounds(data, info.width, info.height);
      const pixels = await sharp(data, { raw: info }).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).raw().toBuffer();
      return { data: pixels, width: crop.width, height: crop.height };
    }));
    variantFrames.set(variant.id, frames);
  }
  const output = new URL(`../../apps/client/public/world-assets/${assetId}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const variantArtwork = {};
  for (const [index, variant] of theme.variants.entries()) {
    const frames = variantFrames.get(materialSheets ? variant.id : theme.variants[0].id);
    const height = Math.max(...frames.map((frame) => frame.height)) + 4;
    let width = 0;
    const bounds = frames.map((frame) => {
      const bounds = { x: width + 2, y: Math.floor((height - frame.height) / 2), width: frame.width, height: frame.height };
      width += frame.width + 4;
      return bounds;
    });
    const inputs = frames.map((frame, directionIndex) => ({
      input: index === 0 || materialSheets ? frame.data : recolorMaterial(frame.data, theme.variants[0], variant, assetId),
      raw: { width: frame.width, height: frame.height, channels: 4 },
      left: bounds[directionIndex].x,
      top: bounds[directionIndex].y,
    }));
    await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(inputs).png({ compressionLevel: 9 }).toFile(fileURLToPath(new URL(`${variant.id}.png`, output)));
    variantArtwork[variant.id] = { path: `/world-assets/${assetId}/${variant.id}.png`, width, height, frames: bounds };
  }
  const elevation = artwork[assetId].elevation;
  if (!Number.isFinite(elevation) || elevation < 0) throw new Error(`Invalid display elevation: ${assetId}`);
  artwork[assetId] = { elevation, variants: variantArtwork };
  console.log(`Prepared ${assetId}: ${theme.variants.length} designs, four directions each`);
}
await writeFile(manifestFile, `${JSON.stringify(artwork, null, 2)}\n`);
