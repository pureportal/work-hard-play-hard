import { Application, Graphics, Text } from "pixi.js";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ASSET_CATALOG, ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getAssetVariants, getAssetRasterSize, getPlacedAssetCells, type WorldObject } from "../../packages/shared/src/index";
import { createWorldAssetView } from "../../apps/client/src/world-asset-view";
import { WorldAssetTextures } from "../../apps/client/src/world-asset-textures";
import { getWorldAssetArtwork } from "../../apps/client/src/world-asset-artwork";
import { AssetShape } from "../../apps/client/src/components/AssetShape";
import { renderCharacter } from "../../apps/client/src/character-renderer";
import { CharacterSprite } from "../../apps/client/src/character-sprite";

const parameters = new URLSearchParams(location.search);
const ids = parameters.get("ids")?.split(",");
const assets = ASSET_CATALOG.assets.filter((asset) => !ids || ids.includes(asset.id));
const dark = parameters.get("theme") === "dark";
document.documentElement.dataset.theme = dark ? "dark" : "light";
const designs = assets.flatMap((asset) => getAssetVariants(asset).map((variant) => ({ asset, variant })));
const layouts = designs.map(({ asset, variant }) => {
  const views = ASSET_ROTATIONS.map((rotation) => getWorldAssetArtwork(asset, variant.id, rotation));
  const overhang = Math.max(0, ...views.map((view) => -view.bounds.y));
  const depth = Math.max(...ASSET_ROTATIONS.map((rotation) => getAssetRasterSize(asset, rotation).height * 16));
  return { overhang, height: Math.max(156, overhang + depth + 76) };
});
const columnWidth = Math.max(176, ...assets.flatMap((asset) => ASSET_ROTATIONS.map((rotation) => getAssetRasterSize(asset, rotation).width * 16 + 88)));
const previewX = columnWidth * 4 + 24;
const canvasWidth = Math.max(1200, previewX + 280);
const canvasHeight = layouts.reduce((total, row) => total + row.height, 0);
const app = new Application();
await app.init({ width: canvasWidth, height: canvasHeight, background: dark ? "#252532" : "#e8e5dc", resolution: 1, antialias: false });
document.getElementById("gallery")!.append(app.canvas);
const textures = new WorldAssetTextures();
const failures: string[] = [];
const previews: ReturnType<typeof createElement>[] = [];
const imagePaths = new Set<string>();
const avatars = await Promise.all([
  renderCharacter(DEFAULT_CHARACTER_APPEARANCE),
  renderCharacter({ ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", hairstyle: "spiky", upperBody: "arcane", lowerBody: "ranger", shoes: "arcane" }),
]);
let rowTop = 0;
for (const [row, { asset, variant }] of designs.entries()) {
  const rowLayout = layouts[row]!;
  const label = new Text({ text: `${asset.name} · ${variant.name} · ${asset.rarity}`, style: { fontFamily: "sans-serif", fontSize: 15, fill: dark ? "#faf7ee" : "#242330" } });
  label.position.set(16, rowTop + 12);
  app.stage.addChild(label);
  const grid = new Graphics();
  for (let x = 16; x < previewX - 16; x += 16) grid.moveTo(x, rowTop + 40).lineTo(x, rowTop + rowLayout.height - 8);
  for (let y = rowTop + 40; y < rowTop + rowLayout.height - 8; y += 16) grid.moveTo(16, y).lineTo(previewX - 16, y);
  grid.stroke({ color: dark ? "#454553" : "#d3cfc3", width: 1 });
  app.stage.addChild(grid);
  for (const [index, rotation] of ASSET_ROTATIONS.entries()) {
    const object: WorldObject = { id: `${asset.id}-${variant.id}-${rotation}`, assetId: asset.id, variantId: variant.id, floorId: "review", x: 16 + index * columnWidth, y: rowTop + 48 + rowLayout.overhang, rotation };
    const footprint = new Graphics();
    for (const cell of getPlacedAssetCells(object)) footprint.rect(cell.worldX, cell.worldY, 16, 16);
    footprint.stroke({ color: 0xc55e44, width: 1, alpha: 0.7 });
    app.stage.addChild(footprint, createWorldAssetView(textures, object, dark ? "dark" : "light", (error) => failures.push(error.message)).container);
    const size = getAssetRasterSize(asset, rotation);
    const avatar = new CharacterSprite(avatars[index % avatars.length]!);
    avatar.update(0, false, (["down", "left", "up", "right"] as const)[index]!);
    avatar.sprite.position.set(object.x + size.width * 16 + 32, object.y + size.height * 16);
    app.stage.addChild(avatar.sprite);
  }
  for (const [index, rotation] of ASSET_ROTATIONS.entries()) {
    const artwork = getWorldAssetArtwork(asset, variant.id, rotation);
    imagePaths.add(artwork.path);
    previews.push(createElement("div", {
      key: `${asset.id}-${variant.id}-${rotation}`,
      style: { position: "absolute", left: previewX + index * 60, top: rowTop + 62, width: 38, height: 38 },
    }, createElement(AssetShape, { asset, variantId: variant.id, rotation })));
  }
  rowTop += rowLayout.height;
}
Object.assign(window, { galleryFailures: failures, galleryDimensions: { width: canvasWidth, height: canvasHeight } });
const previewRoot = document.createElement("div");
document.body.append(previewRoot);
flushSync(() => createRoot(previewRoot).render(previews));
await Promise.all([...imagePaths].map(async (path) => {
  const image = new Image();
  image.src = path;
  await image.decode();
}));
const readinessCheck = window.setInterval(() => {
  const views = app.stage.children.filter((child) => child.label?.startsWith("world-asset:"));
  if (views.length !== designs.length * 4 || !views.every((view) => "children" in view && view.children.every((body) => "children" in body && body.children.every((sprite) => sprite.visible)))) return;
  const previewImages = [...document.querySelectorAll(".asset-shape")];
  if (previewImages.length !== designs.length * 4 || !previewImages.every((preview) => preview.getBoundingClientRect().width === 38 && preview.getBoundingClientRect().height === 38)) return;
  window.clearInterval(readinessCheck);
  app.render();
  window.requestAnimationFrame(() => {
    app.render();
    window.requestAnimationFrame(() => { document.body.dataset.ready = "true"; });
  });
}, 100);
