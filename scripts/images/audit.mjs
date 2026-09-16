import { mkdir, readFile, writeFile } from "node:fs/promises";
import { root, publicRoot, readImageSources } from "./sources.mjs";
import { isPermanentAsset } from "../../packages/shared/src/public-economy.ts";

const catalog = JSON.parse(await readFile(new URL("packages/shared/src/asset-catalog.json", root), "utf8"));
const artwork = JSON.parse(await readFile(new URL("apps/client/src/world-asset-artwork.json", root), "utf8"));
const sources = await readImageSources();
const sizes = new Map(await Promise.all(sources.map(async source => [source.path, (await readFile(new URL(source.path.slice(1), publicRoot))).length])));
const categories = catalog.categories.map(category => {
  const assets = catalog.assets.filter(asset => asset.category === category.id);
  return {
    id: category.id, name: category.name, assets: assets.length,
    designs: assets.reduce((sum, asset) => sum + catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants.length, 0),
    shop: assets.filter(asset => asset.shop?.available && !isPermanentAsset(asset.id)).length,
    shopListed: assets.filter(asset => asset.shop && !isPermanentAsset(asset.id)).length,
    permanent: assets.filter(asset => isPermanentAsset(asset.id)).map(asset => asset.id),
    buildable: assets.filter(asset => asset.buildable).length,
    tabletop: assets.filter(asset => asset.placement.layer === "surface").map(asset => asset.id),
    animatedAtlases: assets.filter(asset => artwork[asset.id]?.animation).map(asset => asset.id),
    items: assets.map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind, placement: asset.placement, ...(asset.workKind ? { workKind: asset.workKind } : {}) })),
  };
});
const imageGroups = ["world", "architecture", "characters"].map(group => {
  const images = sources.filter(source => source.group === group);
  return { group, images: images.length, bytes: images.reduce((sum, source) => sum + sizes.get(source.path), 0), pixels: images.reduce((sum, source) => sum + source.width * source.height, 0) };
});
const missingArtwork = [];
for (const asset of catalog.assets) for (const variant of catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants) {
  if (!artwork[asset.id]?.variants[variant.id]) missingArtwork.push(`${asset.id}/${variant.id}`);
}
const result = {
  assets: catalog.assets.length, designs: categories.reduce((sum, category) => sum + category.designs, 0),
  directionalFrames: Object.values(artwork).reduce((sum, entry) => sum + Object.values(entry.variants).reduce((count, variant) => count + variant.frames.length, 0), 0),
  categories, imageGroups, missingArtwork,
  nonShopAssets: catalog.assets.filter(asset => !asset.shop?.available || isPermanentAsset(asset.id)).map(asset => ({ id: asset.id, buildable: asset.buildable, permanent: isPermanentAsset(asset.id) })),
};
const output = new URL("artifacts/image-optimization-2026-09-16/", root);
await mkdir(output, { recursive: true });
await writeFile(new URL("inventory.json", output), JSON.stringify(result, null, 2) + "\n");
console.table(categories.map(({ name, assets, designs, shop, tabletop, animatedAtlases }) => ({ category: name, assets, designs, shop, tabletop: tabletop.length, animatedAtlases: animatedAtlases.length })));
console.log(JSON.stringify({ assets: result.assets, designs: result.designs, frames: result.directionalFrames, imageGroups, missingArtwork, nonShopAssets: result.nonShopAssets }, null, 2));
