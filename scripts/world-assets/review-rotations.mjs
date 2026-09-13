import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const inputs = [];
const ids = process.argv.slice(2);
for (const [row, id] of ids.entries()) {
  const job = manifest.generations.findLast((entry) => entry.assetId === id && entry.stage === "rotations" && entry.sourceCrop && entry.directions);
  if (!job) throw new Error(`No native rotations for ${id}`);
  for (const [index, direction] of ["south", "west", "north", "east"].entries()) {
    const response = await fetch(job.directions[direction]);
    if (!response.ok) throw new Error(`Could not download ${id}/${direction}`);
    inputs.push({ input: Buffer.from(await response.arrayBuffer()), left: index * 256, top: row * 256 });
  }
}
const directory = new URL("../../artifacts/world-assets/", import.meta.url);
await mkdir(directory, { recursive: true });
const path = fileURLToPath(new URL(`native-${ids.join("_")}.png`, directory));
await sharp({ create: { width: 1024, height: ids.length * 256, channels: 4, background: "#dcdcd7" } }).composite(inputs).png().toFile(path);
console.log(path);
