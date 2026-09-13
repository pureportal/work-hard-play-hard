import { readFile, writeFile } from "node:fs/promises";
import { cachePixelLabImage } from "./source-images.mjs";

const [review, ...ids] = process.argv.slice(2);
if (!review || ids.length === 0) throw new Error("A review and asset IDs are required");
const manifestFile = new URL("./generations.json", import.meta.url);
const sourcesFile = new URL("./artwork-sources.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const sources = JSON.parse(await readFile(sourcesFile, "utf8"));
for (const assetId of ids) {
  const job = manifest.generations.findLast((entry) => entry.assetId === assetId && entry.stage === "rotations" && entry.sourceCrop && entry.directions);
  if (!job) throw new Error(`No native rotation result for ${assetId}`);
  const frames = await Promise.all(["south", "west", "north", "east"].map(async (direction) => {
    if (!job.directions[direction]) throw new Error(`Missing ${assetId}/${direction}`);
    await cachePixelLabImage(job.directions[direction]);
    return { url: job.directions[direction], x: 0, y: 0, width: 256, height: 256 };
  }));
  job.status = "accepted";
  job.review = review;
  sources[assetId] ??= {};
  sources[assetId][job.variantId] = { frames, review };
}
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`);
console.log(`Accepted ${ids.length} reviewed rotation sets`);
