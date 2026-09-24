import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

export const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
export const root = new URL("../../", import.meta.url);
export const publicRoot = new URL("apps/client/public/", root);
export const generatedRoot = new URL("optimized-images/", publicRoot);
export const manifestFile = new URL("manifest.json", import.meta.url);
export const runtimeFile = new URL("apps/client/src/optimized-images.json", root);
export const characterRuntimeFile = new URL("apps/client/src/optimized-character-images.json", root);
export const worldRuntimeFile = new URL("apps/client/src/optimized-world-images.json", root);
export const webpOptions = { lossless: true, effort: 6 };
export const previewOptions = { width: 128, height: 128, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" };

export function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function recipeHash(source) {
  const { sharp: sharpVersion, vips, png, webp } = sharp.versions;
  return digest(JSON.stringify({ webpOptions, previewOptions, versions: { sharp: sharpVersion, vips, png, webp }, frames: source.frames }));
}

export async function readImageSources() {
  const [world, architecture, characters, seating] = await Promise.all([
    readFile(new URL("apps/client/src/world-asset-artwork.json", root), "utf8").then(JSON.parse),
    readFile(new URL("apps/client/src/world-architecture-artwork.json", root), "utf8").then(JSON.parse),
    readFile(new URL("scripts/characters/blockbench/manifest.json", root), "utf8").then(JSON.parse),
    readFile(new URL("apps/client/src/world-seat-occlusion.json", root), "utf8").then(JSON.parse),
  ]);
  const sources = [
    ...Object.values(seating).filter(asset => asset.path).map(asset => ({
      path: asset.path, group: "world", width: asset.width, height: asset.height,
    })),
    ...Object.values(world).flatMap(asset => Object.values(asset.variants).map(variant => ({
      path: variant.path, group: "world", width: variant.width, height: variant.height, frames: variant.frames.slice(0, 4),
    }))),
    ...Object.values(architecture).flatMap(asset => Object.values(asset.variants).map(variant => ({
      path: variant.path, group: "architecture", width: variant.width, height: variant.height,
    }))),
    ...characters.layers.map(layer => ({
      path: layer.path.replace(/^apps\/client\/public/, ""), group: "characters",
      width: characters.settings.atlasSize, height: characters.settings.atlasHeight * 2,
    })),
    ...characters.layers.filter(layer => ["lower", "shoes"].includes(layer.layer)).flatMap(layer => ["chair", "floor"].map(pose => ({
      path: `/characters/seated/${pose}/${layer.layer}/${layer.name}.png`, group: "characters",
      width: characters.settings.atlasSize, height: characters.settings.atlasHeight * 2,
    }))),
  ].sort((left, right) => left.path.localeCompare(right.path, "en"));
  assert.equal(new Set(sources.map(source => source.path)).size, sources.length, "Duplicate image sources");
  for (const source of sources) {
    assert(/^\/(world-assets|world-architecture|characters)\/[a-z0-9/-]+\.png$/.test(source.path), `Invalid image source: ${source.path}`);
    assert(source.width > 0 && source.height > 0, `Missing dimensions: ${source.path}`);
    if (source.frames) assert.equal(source.frames.length, 4, `Missing directions: ${source.path}`);
  }
  return sources;
}

export function assertSamePixels(original, optimized, label) {
  assert.equal(optimized.length, original.length, `${label}: pixel count changed`);
  for (let offset = 0; offset < original.length; offset += 4) {
    if (optimized[offset + 3] !== original[offset + 3]) assert.fail(`${label}: alpha changed at ${offset / 4}`);
    if (!original[offset + 3]) continue;
    if (original[offset] !== optimized[offset] || original[offset + 1] !== optimized[offset + 1] || original[offset + 2] !== optimized[offset + 2]) {
      assert.fail(`${label}: visible RGB changed at ${offset / 4}`);
    }
  }
}
