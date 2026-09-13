import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const sources = JSON.parse(await readFile(new URL("./artwork-sources.json", import.meta.url), "utf8"));
const output = new URL("../../artifacts/world-assets/native/", import.meta.url);
await mkdir(output, { recursive: true });
const requested = process.argv.slice(2);
const assets = catalog.assets.filter((asset) => sources[asset.id] && (!requested.length || requested.includes(asset.id)));
for (let start = 0; start < assets.length; start += 3) {
  const rows = [];
  for (const asset of assets.slice(start, start + 3)) {
    const variant = catalog.themeSets.find((theme) => theme.id === asset.themeSetId).variants[0];
    const frames = await Promise.all(["south", "west", "north", "east"].map(async (direction) => {
      const input = await readFile(new URL(`./directions/${asset.id}/${variant.id}/${direction}.png`, import.meta.url));
      const metadata = await sharp(input).metadata();
      return { input, width: metadata.width, height: metadata.height };
    }));
    rows.push({ id: asset.id, frames, size: Math.max(256, ...frames.flatMap((frame) => [frame.width, frame.height])) });
  }
  const width = Math.max(...rows.map((row) => row.size * 4));
  const height = rows.reduce((sum, row) => sum + row.size + 24, 0);
  const layers = [];
  let top = 0;
  for (const row of rows) {
    const label = Buffer.from(`<svg width="${width}" height="24"><text x="8" y="17" font-family="sans-serif" font-size="14">${row.id} — south / west / north / east</text></svg>`);
    layers.push({ input: label, left: 0, top });
    for (const [index, frame] of row.frames.entries()) {
      layers.push({ input: frame.input, left: index * row.size + Math.floor((row.size - frame.width) / 2), top: top + 24 + Math.floor((row.size - frame.height) / 2) });
    }
    top += row.size + 24;
  }
  await sharp({ create: { width, height, channels: 4, background: "#dcdcd7" } }).composite(layers).png().toFile(fileURLToPath(new URL(`${String(start / 3 + 1).padStart(2, "0")}.png`, output)));
}
console.log(`Prepared ${assets.length} asset reviews at native resolution.`);
