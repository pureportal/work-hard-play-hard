import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { removeMagenta } from "./palette.mjs";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const [assetId, jobId, requestedVariantId] = process.argv.slice(2);
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const asset = catalog.assets.find((entry) => entry.id === assetId);
if (!asset) throw new Error(`Unknown asset ${assetId}`);
const variants = catalog.themeSets.find((entry) => entry.id === asset.themeSetId).variants;
const variantId = requestedVariantId ?? variants[0].id;
if (!variants.some((entry) => entry.id === variantId)) throw new Error(`Unknown design ${variantId}`);
const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const generation = manifest.generations.find((entry) => entry.jobId === jobId && entry.assetId === assetId && entry.stage === "direction-sheet" && entry.status === "accepted");
if (!generation) throw new Error(`Sheet has not passed review: ${assetId}/${jobId}`);
if (generation.frames?.length !== 4) throw new Error(`Four source rectangles are required: ${assetId}`);
const response = await fetch(`https://api.pixellab.ai/mcp/images/${jobId}/download`);
if (!response.ok) throw new Error(`PixelLab download failed: ${response.status}`);
const input = Buffer.from(await response.arrayBuffer());
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== 512 || info.height !== 512) throw new Error(`Expected a native 512px sheet: ${assetId}`);
const sourceDirectory = new URL(`./sheets/${assetId}/`, import.meta.url);
const directionDirectory = new URL(`./directions/${assetId}/${variantId}/`, import.meta.url);
await mkdir(sourceDirectory, { recursive: true });
await mkdir(directionDirectory, { recursive: true });
await writeFile(new URL(`${variantId}.png`, sourceDirectory), input);
removeMagenta(data);
for (const [index, direction] of ["south", "west", "north", "east"].entries()) {
  const { x, y, width, height } = generation.frames[index];
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > 512 || y + height > 512) throw new Error(`Invalid source rectangle: ${assetId}/${direction}`);
  const frame = await sharp(data, { raw: info })
    .extract({ left: x, top: y, width, height }).png().toBuffer();
  await writeFile(new URL(`${direction}.png`, directionDirectory), frame);
}
console.log(`Prepared four Pro views: ${assetId}/${variantId}`);
