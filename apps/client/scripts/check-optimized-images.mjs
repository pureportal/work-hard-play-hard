import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const client = new URL("../", import.meta.url);
const [manifest, runtime, world, architecture] = await Promise.all([
  readFile(new URL("../../../scripts/images/manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("src/optimized-images.json", client), "utf8").then(JSON.parse),
  readFile(new URL("src/world-asset-artwork.json", client), "utf8").then(JSON.parse),
  readFile(new URL("src/world-architecture-artwork.json", client), "utf8").then(JSON.parse),
]);
const sources = [
  ...Object.values(world).flatMap(asset => Object.values(asset.variants).map(variant => ({ path: variant.path, frames: variant.frames.slice(0, 4) }))),
  ...Object.values(architecture).flatMap(asset => Object.values(asset.variants).map(variant => ({ path: variant.path }))),
  ...(await readdir(new URL("public/characters/", client), { recursive: true })).filter(path => path.endsWith(".png")).map(path => ({ path: `/characters/${path.replaceAll("\\", "/")}` })),
];
assert.deepEqual(Object.keys(manifest).sort(), sources.map(source => source.path).sort(), "Image inventory changed. Run pnpm assets:optimize.");
assert.deepEqual(Object.keys(runtime).sort(), Object.keys(manifest).sort(), "Runtime image inventory is stale. Run pnpm assets:optimize.");
const checked = new Set();
for (const source of sources) {
  const record = manifest[source.path];
  const bytes = await readFile(new URL(`public${source.path}`, client));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sourceHash, `Source changed: ${source.path}. Run pnpm assets:optimize.`);
  assert.equal(createHash("sha256").update(JSON.stringify(source.frames ?? null)).digest("hex"), record.layoutHash, `Frames changed: ${source.path}. Run pnpm assets:optimize.`);
  const images = [record.image, ...(record.previews ?? [])];
  assert.deepEqual(runtime[source.path], images.map(image => image.id), `Delivery paths changed: ${source.path}`);
  for (const image of images) {
    assert(/^[a-f0-9]{24}$/.test(image.id), "Invalid delivery image ID");
    if (checked.has(image.id)) continue;
    const encoded = await readFile(new URL(`public/optimized-images/${image.id}.webp`, client));
    const hash = createHash("sha256").update(encoded).digest("hex");
    assert.equal(hash, image.sha256, `Delivery image changed: ${image.id}. Run pnpm assets:optimize.`);
    assert.equal(image.id, hash.slice(0, 24));
    checked.add(image.id);
  }
}
console.log(`Verified ${sources.length} image sources and ${checked.size} delivery files.`);
