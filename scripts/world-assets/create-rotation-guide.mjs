import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const assetId = process.argv[2];
const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const job = manifest.generations.findLast((entry) => entry.assetId === assetId && entry.sourceCrop && entry.directions);
if (!job) throw new Error(`No native rotations for ${assetId}`);
const frames = await Promise.all(["south", "west", "north", "east"].map(async (direction, index) => {
  const response = await fetch(job.directions[direction]);
  if (!response.ok) throw new Error(`Could not download ${assetId}/${direction}: ${response.status}`);
  const input = await sharp(Buffer.from(await response.arrayBuffer())).flatten({ background: "#ff00ff" }).png().toBuffer();
  return { input, left: index % 2 * 256, top: Math.floor(index / 2) * 256 };
}));
const guide = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#ff00ff" } }).composite(frames).png().toBuffer();
const directory = new URL(`./sources/${assetId}/`, import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("repair-guide.png", directory), guide);
process.stdout.write(guide.toString("base64"));
