import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp");
const workspace = new URL("../../../", import.meta.url);
const architecture = process.argv.includes("--architecture");
const manifest = JSON.parse(await readFile(new URL(`${architecture ? "architecture/" : ""}renders/manifest.json`, import.meta.url), "utf8"));
const catalog = architecture ? createRequire(import.meta.url)("./architecture.cjs").architectureCatalog
  : JSON.parse(await readFile(new URL("packages/shared/src/asset-catalog.json", workspace), "utf8"));
const artworkFile = new URL(`apps/client/src/${architecture ? "world-architecture" : "world-asset"}-artwork.json`, workspace);
const sourcesFile = new URL(architecture ? "architecture/artwork-sources.json" : "../artwork-sources.json", import.meta.url);
const publicDirectory = architecture ? "world-architecture" : "world-assets";
const artwork = JSON.parse(await readFile(artworkFile, "utf8"));
const sources = JSON.parse(await readFile(sourcesFile, "utf8"));

function visibleBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  assert(right >= left && bottom >= top, "Empty Blockbench render");
  assert(left > 1 && top > 1 && right < width - 2 && bottom < height - 2, "Clipped Blockbench render");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export async function importBlockbenchArtwork(assetIds = manifest.results.map((entry) => entry.assetId)) {
  const report = [];
  for (const assetId of assetIds) assert(manifest.results.some((entry) => entry.assetId === assetId), `Missing Blockbench render: ${assetId}`);
  for (const rendered of manifest.results.filter((entry) => assetIds.includes(entry.assetId))) {
    const asset = catalog.assets.find((entry) => entry.id === rendered.assetId);
    assert(asset, `Missing catalog definition: ${rendered.assetId}`);
    const footprintCells = asset.footprint.flatMap((region) => region.cells ?? [
      { x: region.range.x + region.range.width - 1, y: region.range.y + region.range.height - 1 },
    ]);
    const footprint = {
      width: (Math.max(...footprintCells.map((cell) => cell.x)) + 1) * catalog.rasterSize,
      height: (Math.max(...footprintCells.map((cell) => cell.y)) + 1) * catalog.rasterSize,
    };
    const theme = catalog.themeSets.find((entry) => entry.id === asset.themeSetId);
    assert.deepEqual(Object.keys(rendered.variants), theme.variants.map((variant) => variant.id));
    const directory = new URL(`apps/client/public/${publicDirectory}/${asset.id}/`, workspace);
    await mkdir(directory, { recursive: true });
    const variants = {};
    const reviewed = {};
    for (const [variantId, variant] of Object.entries(rendered.variants)) {
      assert.deepEqual(variant.footprint, footprint, `${asset.id}/${variantId}: model footprint differs from catalog`);
      const directions = ["south", "west", "north", "east"];
      assert.deepEqual(variant.frames.map((frame) => frame.direction), Array.from({ length: variant.animation?.frames ?? 1 }, () => directions).flat());
      const inputs = [];
      for (const frame of variant.frames) {
        const input = await readFile(new URL(frame.path, workspace));
        const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.width, frame.width);
        assert.equal(info.height, frame.height);
        let visible;
        try { visible = visibleBounds(data, info.width, info.height); }
        catch (error) { throw new Error(`${asset.id}/${variantId}/${frame.direction}: ${error.message}`, { cause: error }); }
        inputs.push({ input, frame, visible });
      }
      const directionalBounds = directions.map(direction => {
        const bounds = inputs.filter(input => input.frame.direction === direction).map(input => input.visible);
        const x = Math.min(...bounds.map(bound => bound.x)), y = Math.min(...bounds.map(bound => bound.y));
        return { x, y, width: Math.max(...bounds.map(bound => bound.x + bound.width)) - x, height: Math.max(...bounds.map(bound => bound.y + bound.height)) - y };
      });
      const crops = [];
      const bleed = asset.placement.layer === "ground" ? 16 : 0;
      for (const { input, frame } of inputs) {
        const crop = asset.placement.layer === "ground" ? { x: Math.round(frame.groundFootprint.x), y: Math.round(frame.groundFootprint.y), width: Math.round(frame.groundFootprint.width), height: Math.round(frame.groundFootprint.height) } : directionalBounds[directions.indexOf(frame.direction)];
        const extracted = sharp(input).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height });
        if (bleed) extracted.extend({ top: bleed, bottom: bleed, left: bleed, right: bleed, extendWith: "copy" });
        const pixels = await extracted.png().toBuffer();
        const sideways = frame.direction === "west" || frame.direction === "east";
        const footprintWidth = sideways ? footprint.height : footprint.width;
        const footprintHeight = sideways ? footprint.width : footprint.height;
        const ground = frame.groundFootprint;
        assert(ground && Object.values(ground).every(Number.isFinite), `${asset.id}: missing projected footprint`);
        assert(Math.abs(ground.width / rendered.pixelsPerUnit - footprintWidth) < 0.000001, `${asset.id}/${frame.direction}: projected floor width differs from raster`);
        assert(Math.abs(ground.height / rendered.pixelsPerUnit - footprintHeight) < 0.000001, `${asset.id}/${frame.direction}: projected floor depth differs from raster`);
        crops.push({ input: pixels, crop, bounds: {
          x: asset.placement.layer === "ground" ? 0 : (crop.x - ground.x) / rendered.pixelsPerUnit,
          y: asset.placement.layer === "ground" ? 0 : (crop.y - ground.y) / rendered.pixelsPerUnit,
          width: crop.width / rendered.pixelsPerUnit,
          height: crop.height / rendered.pixelsPerUnit,
        } });
      }
      const cellHeight = Math.max(...crops.map(({ crop }) => crop.height)) + 4 + bleed * 2;
      const cellWidth = Math.max(...crops.map(({ crop }) => crop.width)) + 4 + bleed * 2;
      const columns = variant.animation ? 8 : 4;
      const width = cellWidth * columns;
      const height = cellHeight * Math.ceil(crops.length / columns);
      const frames = crops.map(({ crop }, index) => ({ x: index % columns * cellWidth + 2 + bleed, y: Math.floor(index / columns) * cellHeight + 2 + bleed, width: crop.width, height: crop.height }));
      const textureLimit = variant.animation ? 4096 : 8192;
      assert(width <= textureLimit && height <= textureLimit, `${asset.id}: atlas exceeds texture limits`);
      await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
        .composite(crops.map(({ input }, index) => ({ input, left: frames[index].x - bleed, top: frames[index].y - bleed })))
        .png().toFile(fileURLToPath(new URL(`${variantId}.png`, directory)));
      variants[variantId] = { path: `/${publicDirectory}/${asset.id}/${variantId}.png`, width, height, frames, bounds: crops.map(({ bounds }) => bounds) };
      reviewed[variantId] = {
        generator: "blockbench",
        model: variant.model,
        frames: variant.frames.map((frame) => ({ path: frame.path, x: 0, y: 0, width: frame.width, height: frame.height })),
        review: "One editable model, four cardinal rotations, fixed scale and raster-aligned floor projection; transparent cel-shaded render.",
      };
      report.push({ assetId: asset.id, variantId, frames: frames.length, parts: variant.parts });
    }
    const { seatHeight, seatHasBack, surfaceHeight, animation } = Object.values(rendered.variants)[0];
    artwork[asset.id] = { elevation: Math.max(0, ...Object.values(variants).flatMap((variant) => variant.bounds.map((bounds) => -bounds.y))), seatHeight, seatHasBack, surfaceHeight, animation, variants };
    sources[asset.id] = reviewed;
    console.log(`Imported ${asset.id}`);
  }

  await writeFile(artworkFile, `${JSON.stringify(artwork, null, 2)}\n`);
  await writeFile(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const requested = process.argv.slice(2).filter(argument => argument !== "--architecture");
  const imported = await importBlockbenchArtwork(requested.length ? requested : undefined);
  console.log(`Imported ${imported.length} designs, ${imported.reduce((sum, design) => sum + design.frames, 0)} directional frames.`);
}
