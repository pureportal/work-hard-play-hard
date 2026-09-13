import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const [assetId] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const generation = manifest.generations.findLast((entry) => entry.assetId === assetId && entry.stage === "rotations" && entry.status === "accepted" && entry.sourceCrop);
if (!generation?.directions || !generation.variantId) throw new Error(`No reviewed rotations for ${assetId}`);
const directory = new URL(`./directions/${assetId}/${generation.variantId}/`, import.meta.url);
const sheetDirectory = new URL(`./sheets/${assetId}/`, import.meta.url);
await mkdir(directory, { recursive: true });
await mkdir(sheetDirectory, { recursive: true });
const directions = ["south", "west", "north", "east"];
const images = [];
for (const [index, direction] of directions.entries()) {
  const response = await fetch(generation.directions[direction]);
  if (!response.ok) throw new Error(`Cannot download ${assetId}/${direction}: ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(input).metadata();
  if (metadata.width !== 256 || metadata.height !== 256) throw new Error(`Unexpected native rotation size for ${assetId}/${direction}`);
  await writeFile(new URL(`${direction}.png`, directory), input);
  images.push({ input, left: index % 2 * 256, top: Math.floor(index / 2) * 256 });
}
await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(images).png().toFile(fileURLToPath(new URL(`${generation.variantId}.png`, sheetDirectory)));
console.log(`Downloaded four reviewed native views for ${assetId}`);
