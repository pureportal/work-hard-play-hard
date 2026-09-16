import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { CHARACTER_ANIMATIONS, CHARACTER_DIRECTIONS, CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/asset-quality-2026-09-15";
await mkdir(output, { recursive: true });
const json = async path => JSON.parse(await readFile(path, "utf8"));
const catalog = await json("packages/shared/src/asset-catalog.json");
const world = await json("apps/client/src/world-asset-artwork.json");
const architecture = await json("apps/client/src/world-architecture-artwork.json");
const worldModels = await json("scripts/world-assets/blockbench/renders/manifest.json");
const architectureModels = await json("scripts/world-assets/blockbench/architecture/renders/manifest.json");
const characters = await json("scripts/characters/blockbench/manifest.json");
const files = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : `${directory}/${entry.name}`))).flat();
const assets = [];
for (const asset of catalog.assets) {
  const artwork = world[asset.id];
  assert(artwork, `Missing catalog artwork: ${asset.id}`);
  for (const [variantId, variant] of Object.entries(artwork.variants)) {
    assets.push({ id: `${asset.id}/${variantId}`, family: "world", name: asset.name, assetId: asset.id, variantId, path: `apps/client/public${variant.path}`, model: worldModels.results.find(entry => entry.assetId === asset.id).variants[variantId].model, placement: asset.placement, directions: [0, 90, 180, 270], animation: artwork.animation ?? null, frames: variant.frames.length, bounds: variant.bounds, initialScore: null, initialReason: null, changes: [], finalScore: null, evidence: [] });
  }
}
assert.deepEqual(Object.keys(world).sort(), catalog.assets.map(asset => asset.id).sort());
for (const [kind, artwork] of Object.entries(architecture)) for (const [variantId, variant] of Object.entries(artwork.variants)) {
  assets.push({ id: `architecture/${kind}/${variantId}`, family: "architecture", name: kind, assetId: kind, variantId, path: `apps/client/public${variant.path}`, model: architectureModels.results.find(entry => entry.assetId === kind).variants[variantId].model, directions: [0, 90, 180, 270], gameplayDirections: [0, 90], frames: variant.frames.length, initialScore: null, initialReason: null, changes: [], finalScore: null, evidence: [] });
}
for (const layer of characters.layers) assets.push({ id: `character/${layer.layer}/${layer.name}`, family: "character", name: layer.name, layer: layer.layer, path: layer.path, model: layer.model, appearance: layer.appearance, directions: CHARACTER_DIRECTIONS, animations: CHARACTER_ANIMATIONS, frames: layer.frames, initialScore: null, initialReason: null, changes: [], finalScore: null, evidence: [] });
const inventory = await files("apps/client/public");
assert.deepEqual(inventory.sort(), assets.map(asset => asset.path).sort());
const illustrations = await files("apps/client/src/assets");
for (const path of illustrations) assets.push({ id: `illustration/${path.split("/").at(-1)}`, family: "illustration", path, initialScore: null, initialReason: null, changes: [], finalScore: null, evidence: [] });
for (const asset of assets) {
  asset.sha256 = createHash("sha256").update(await readFile(asset.path)).digest("hex");
  if (asset.model) {
    const model = await json(asset.model);
    asset.modelSha256 = createHash("sha256").update(await readFile(asset.model)).digest("hex");
    asset.elements = model.elements.length;
    asset.materials = model.textures.length;
    asset.nativeAnimations = model.animations?.map(animation => ({ name: animation.name, length: animation.length, loop: animation.loop })) ?? [];
    for (const element of model.elements) for (const face of Object.values(element.faces ?? {})) assert(Number.isInteger(face.texture) && model.textures[face.texture], `${asset.id}/${element.name}: missing material`);
  }
}
const report = { createdAt: new Date().toISOString(), criteria: ["visual appeal", "clarity", "style consistency", "proportions", "visible defects"], passingScore: 8, scale: { defaultCameraZoom: 0.78, grid: 16, characterWorldSize: 80, characterScreenSize: 62.4, buildPreview: 38 }, counts: { catalog: catalog.assets.length, variants: assets.filter(asset => asset.family === "world").length, architecture: Object.keys(architecture).length, characterLayers: characters.layers.length, illustrations: illustrations.length, files: assets.length, worldDirectionalFrames: assets.filter(asset => asset.family === "world").reduce((sum, asset) => sum + asset.frames, 0), characterFrames: characters.layers.reduce((sum, layer) => sum + layer.frames, 0) }, customization: { faces: CHARACTER_FACES, hairstyles: CHARACTER_HAIRSTYLES, headwear: CHARACTER_HEADWEAR, outfits: CHARACTER_OUTFITS }, assets };
await writeFile(`${output}/inventory.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.counts, null, 2));
console.log(catalog.assets.map(asset => `${asset.id}: ${asset.name} (${Object.keys(world[asset.id].variants).join(", ")})${world[asset.id].animation ? " animated" : ""}`).join("\n"));
