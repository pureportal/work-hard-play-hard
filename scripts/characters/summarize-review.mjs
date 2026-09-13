import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sharp } from "./raster.mjs";
import { CHARACTER_ANIMATIONS, CHARACTER_WORLD_SIZE } from "../../packages/shared/src/character.ts";

const root = new URL("../../artifacts/characters/state-review/", import.meta.url);
const states = JSON.parse(await readFile(new URL("after/states/results.json", root), "utf8"));
for (const assetId of new Set(states.inspected.map((state) => state.assetId))) {
  const tiles = [];
  const entries = states.inspected.filter((state) => state.assetId === assetId);
  for (const [index, entry] of entries.entries()) {
    const name = `${entry.assetId}-${entry.rotation}-${entry.viewport.width}`;
    const left = index % 4 * 300;
    const top = Math.floor(index / 4) * 390;
    const screenshot = new URL(`after/states/${name}-detail.png`, root);
    tiles.push({ input: await sharp(await readFile(screenshot)).resize(300, 360).png().toBuffer(), left, top });
    tiles.push({ input: Buffer.from(`<svg width="300" height="30"><text x="150" y="21" text-anchor="middle" font-family="Arial" font-size="12">${entry.rotation}° · ${entry.viewport.width}×${entry.viewport.height}</text></svg>`), left, top: top + 360 });
  }
  await sharp({ create: { width: 1200, height: Math.ceil(entries.length / 4) * 390, channels: 4, background: "#ede9e3" } }).composite(tiles).png().toFile(fileURLToPath(new URL(`after/states/${assetId}-review.png`, root)));
}
const provenance = JSON.parse(await readFile(new URL("anime-sources.json", import.meta.url), "utf8"));
const sources = {};
for (const [path, source] of Object.entries(provenance.files)) {
  const hash = createHash("sha256").update(await readFile(new URL(path, import.meta.url))).digest("hex");
  sources[path] = { sha256: hash, unchanged: hash === source.sha256 };
}
const suites = {};
for (const suite of ["creator", "states", "seat-labels", "transitions", "recovery", "live"]) {
  suites[suite] = JSON.parse(await readFile(new URL(`after/${suite}/results.json`, root), "utf8"));
}
const pixelLab = JSON.parse(await readFile(new URL("pixellab-balance.json", root), "utf8"));
await writeFile(new URL("verification.json", root), JSON.stringify({
  reviewedAt: new Date().toISOString(), worldSize: CHARACTER_WORLD_SIZE, animations: CHARACTER_ANIMATIONS,
  pixelLab, sources, suites,
}, null, 2));
console.log(`Recorded ${states.inspected.length} seating views, browser suites and source hashes.`);
