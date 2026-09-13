import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { blank, overlay, resize, transform, writeImage } from "./raster.mjs";
import { fitTop, loadHair, loadHeads } from "./appearance.mjs";
import { loadShoes } from "./footwear.mjs";
import { animateLayer } from "./rig.mjs";
import { loadTrousers, loadWardrobe, sourceSize } from "./wardrobe.mjs";
import {
  CHARACTER_ANIMATIONS, CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, CHARACTER_FOOT_ANCHOR,
} from "../../packages/shared/src/character.ts";

const output = new URL("../../apps/client/public/characters/anime/", import.meta.url);
const layers = new Map();
const [wardrobe, trousers, heads, hairstyles, shoes] = await Promise.all([loadWardrobe(), loadTrousers(), loadHeads(), loadHair(), loadShoes()]);

function register(name, kind, direction, input) {
  if (!layers.has(name)) layers.set(name, { kind, directions: new Map() });
  layers.get(name).directions.set(direction, input);
}

for (const direction of ["down", "left", "up"]) {
  for (const gender of ["female", "male"]) {
    for (const expression of ["calm", "bright", "fierce"]) {
      register(`head/${gender}-${expression}`, "head", direction, heads[gender][direction][expression]);
    }
    for (const outfit of ["street", "ranger", "arcane"]) {
      for (const fit of ["none", "flat", "medium", "big"]) {
        register(`upper/${gender}-${outfit}-${fit}`, "upper", direction, fitTop(wardrobe, gender, direction, outfit, fit));
      }
      register(`lower/${gender}-${outfit}`, "lower", direction, trousers[gender][direction][outfit]);
      register(`shoes/${gender}-${outfit}`, "shoes", direction, shoes[gender][direction][outfit]);
    }
  }
  for (const [name, views] of Object.entries(hairstyles)) {
    register(`hair/${name}`, "hair", direction, views[direction]);
  }
}

await mkdir(fileURLToPath(output), { recursive: true });
for (const [name, layer] of layers) {
  const atlas = blank(CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_SIZE);
  const portraits = blank(sourceSize * 4, sourceSize);
  for (const [directionIndex, direction] of CHARACTER_DIRECTIONS.entries()) {
    const sourceDirection = direction === "right" ? "left" : direction;
    const original = layer.directions.get(sourceDirection);
    const portrait = direction === "right" ? transform(original, -1, 0, 0, 1, sourceSize - 1, 0, sourceSize, sourceSize) : original;
    overlay(portraits, portrait, directionIndex * sourceSize, 0);
    const source = await resize(original, CHARACTER_CANVAS_SIZE, CHARACTER_CANVAS_SIZE);
    for (const [motion, animation] of Object.entries(CHARACTER_ANIMATIONS)) {
      for (let frame = 0; frame < animation.frames; frame++) {
        let posed = animateLayer(source, layer.kind, sourceDirection, frame, motion);
        if (direction === "right") posed = transform(posed, -1, 0, 0, 1, CHARACTER_CANVAS_SIZE - 1, 0);
        overlay(atlas, posed, (animation.column + frame) * CHARACTER_CANVAS_SIZE, (animation.row + directionIndex) * CHARACTER_CANVAS_SIZE);
      }
    }
  }
  for (const [folder, image] of [["", atlas], ["portraits/", portraits]]) {
    const path = fileURLToPath(new URL(`${folder}${name}.png`, output));
    await mkdir(dirname(path), { recursive: true });
    await writeImage(image, path);
  }
}

await writeFile(new URL("manifest.json", output), JSON.stringify({
  canvas: { width: CHARACTER_CANVAS_SIZE, height: CHARACTER_CANVAS_SIZE },
  atlas: { width: CHARACTER_ATLAS_SIZE, height: CHARACTER_ATLAS_SIZE },
  portrait: { width: sourceSize * 4, height: sourceSize, frameSize: sourceSize },
  anchor: CHARACTER_FOOT_ANCHOR,
  directions: CHARACTER_DIRECTIONS,
  animations: CHARACTER_ANIMATIONS,
  layers: [...layers.keys()],
}, null, 2) + "\n");
console.log(`Prepared ${layers.size} anime layers with animation atlases and high-resolution portraits.`);
