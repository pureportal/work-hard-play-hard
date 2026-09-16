import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const root = new URL("../../", import.meta.url);
const output = new URL("artifacts/image-optimization-2026-09-16/formats/", root);
const artwork = JSON.parse(await readFile(new URL("apps/client/src/world-asset-artwork.json", root), "utf8"));
const samples = [
  ...["food-sushi", "plant-croton", "floor-wood", "outdoor-mini-windmill"].map(id => Object.values(artwork[id].variants)[0].path),
  "/characters/blockbench/head/calm.png",
  "/characters/blockbench/hair/wavy-witch.png",
];
sharp.concurrency(1);
await mkdir(output, { recursive: true });
const results = [];
for (const source of samples) {
  const input = await readFile(new URL(`apps/client/public${source}`, root));
  const original = await sharp(input).ensureAlpha().raw().toBuffer();
  const name = source.slice(1).replaceAll("/", "-").replace(/\.png$/, "");
  const variants = { original: input };
  const encodings = {
    png: image => image.png({ compressionLevel: 9, adaptiveFiltering: true }),
    webp: image => image.webp({ lossless: true, effort: 6 }),
    avif: image => image.avif({ lossless: true, chromaSubsampling: "4:4:4", effort: 4 }),
  };
  for (const [format, encode] of Object.entries(encodings)) {
    const started = performance.now();
    const encoded = await encode(sharp(input)).toBuffer();
    const encodeMs = performance.now() - started;
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer();
    let changedVisiblePixels = 0, changedAlpha = 0;
    for (let offset = 0; offset < original.length; offset += 4) {
      if (original[offset + 3] !== decoded[offset + 3]) changedAlpha++;
      if (original[offset + 3] && (original[offset] !== decoded[offset] || original[offset + 1] !== decoded[offset + 1] || original[offset + 2] !== decoded[offset + 2])) changedVisiblePixels++;
    }
    variants[format] = encoded;
    results.push({ source, format, originalBytes: input.length, bytes: encoded.length, encodeMs, changedVisiblePixels, changedAlpha });
  }
  for (const [format, bytes] of Object.entries(variants)) await writeFile(new URL(`${name}.${format === "original" ? "original.png" : format}`, output), bytes);
  console.log(JSON.stringify(results.filter(result => result.source === source)));
}
await writeFile(new URL("benchmark.json", output), JSON.stringify({ versions: sharp.versions, results }, null, 2) + "\n");
console.log(`Saved ${fileURLToPath(new URL("benchmark.json", output))}`);
