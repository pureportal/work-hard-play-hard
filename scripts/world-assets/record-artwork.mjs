import { readFile, writeFile } from "node:fs/promises";
import { cachePixelLabImage } from "./source-images.mjs";

const file = new URL("./artwork-sources.json", import.meta.url);
const sources = JSON.parse(await readFile(file, "utf8"));
const updates = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
for (const { assetId, variantId, frames, review } of updates) {
  if (frames.length !== 4 || !review) throw new Error(`Four reviewed frames required for ${assetId}`);
  for (const frame of frames) {
    await cachePixelLabImage(frame.url);
    if (![frame.x, frame.y, frame.width, frame.height].every(Number.isInteger)) throw new Error(`Invalid native source for ${assetId}`);
  }
  sources[assetId] ??= {};
  sources[assetId][variantId] = { frames, review };
}
await writeFile(file, `${JSON.stringify(sources, null, 2)}\n`);
console.log(`Recorded ${updates.length} reviewed source sets`);
