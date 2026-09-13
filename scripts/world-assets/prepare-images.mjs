import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { removeMagenta } from "./palette.mjs";
import { cachePixelLabImage } from "./source-images.mjs";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const sources = JSON.parse(await readFile(new URL("./artwork-sources.json", import.meta.url), "utf8"));
const requested = process.argv.slice(2);
for (const assetId of requested.length ? requested : Object.keys(sources)) {
  if (!sources[assetId]) throw new Error(`No reviewed source set for ${assetId}`);
  for (const [variantId, source] of Object.entries(sources[assetId])) {
    const directory = new URL(`./directions/${assetId}/${variantId}/`, import.meta.url);
    const sheetDirectory = new URL(`./sheets/${assetId}/`, import.meta.url);
    await mkdir(directory, { recursive: true });
    await mkdir(sheetDirectory, { recursive: true });
    const composed = [];
    let cellSize = 256;
    for (const [index, frame] of source.frames.entries()) {
      const raw = await readFile(await cachePixelLabImage(frame.url));
      const { data, info } = await sharp(raw).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      removeMagenta(data);
      const input = await sharp(data, { raw: info }).png().toBuffer();
      await writeFile(new URL(`${["south", "west", "north", "east"][index]}.png`, directory), input);
      cellSize = Math.max(cellSize, info.width, info.height);
      composed.push({ input, width: info.width, height: info.height });
    }
    const frames = composed.map((frame, index) => ({ input: frame.input, left: index % 2 * cellSize + Math.floor((cellSize - frame.width) / 2), top: Math.floor(index / 2) * cellSize + Math.floor((cellSize - frame.height) / 2) }));
    await sharp({ create: { width: cellSize * 2, height: cellSize * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(frames).png().toFile(fileURLToPath(new URL(`${variantId}.png`, sheetDirectory)));
  }
  console.log(`Prepared native source frames: ${assetId}`);
}
