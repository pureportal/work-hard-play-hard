import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sharp } from "../../images/sources.mjs";
import {
  CHARACTER_DIRECTIONS, CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS,
  CHARACTER_ATLAS_HEIGHT, DEFAULT_CHARACTER_APPEARANCE, getCharacterFrame, getCharacterLayerPaths,
} from "../../../packages/shared/src/character.ts";
import { composeCharacterLayers } from "../../../packages/shared/src/character-composition.ts";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? fileURLToPath(new URL("../../../artifacts/character-variety/artwork", import.meta.url));
const selected = process.argv.find(value => value.startsWith("--category="))?.slice(11);
const styles = process.argv.find(value => value.startsWith("--styles="))?.slice(9).split(",");
const groups = [
  { name: "faces", samples: CHARACTER_FACES.map(face => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "curtains", face })), field: "face" },
  { name: "hair", samples: CHARACTER_HAIRSTYLES.map(hairstyle => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle })), field: "hairstyle" },
  { name: "headwear", samples: CHARACTER_HEADWEAR.map(headwear => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "bob", headwear })), field: "headwear" },
  { name: "outfits", samples: CHARACTER_OUTFITS.map(outfit => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "curtains", upperBody: outfit, lowerBody: outfit, shoes: outfit })), field: "upperBody" },
].filter(group => !selected || selected === group.name).map(group => ({ ...group, samples: group.samples.filter(appearance => !styles || styles.includes(appearance[group.field])) }));
assert(groups.length && groups.every(group => group.samples.length), "Choose a catalog category and matching styles");
const files = new Map();
await mkdir(output, { recursive: true });

async function framePixels(appearance, direction, motion = "idle") {
  const frame = getCharacterFrame(motion, direction, 0);
  const layers = [];
  for (const path of getCharacterLayerPaths(appearance)) {
    let file = files.get(path);
    if (!file) {
      file = await readFile(new URL(`../../../apps/client/public${path}`, import.meta.url));
      if (files.size >= 12) files.delete(files.keys().next().value);
      files.set(path, file);
    }
    const planes = await Promise.all([0, CHARACTER_ATLAS_HEIGHT].map(offset => sharp(file).extract({ left: frame.x, top: frame.y + offset, width: 120, height: 120 }).ensureAlpha().raw().toBuffer()));
    layers.push(new Uint8ClampedArray(Buffer.concat(planes)));
  }
  return Buffer.from(composeCharacterLayers(layers, 120, 120));
}

for (const group of groups) {
  const width = 1116, rowHeight = group.name === "faces" ? 260 : 176;
  const height = Math.ceil(group.samples.length / 3) * rowHeight;
  const overlays = [];
  for (const [index, appearance] of group.samples.entries()) {
    const x = index % 3 * 372, y = Math.floor(index / 3) * rowHeight;
    overlays.push({ input: Buffer.from(`<svg width="350" height="25"><text x="10" y="18" font-family="sans-serif" font-size="13" fill="#514552">${appearance[group.field]}</text></svg>`), left: x, top: y });
    for (const [column, direction] of CHARACTER_DIRECTIONS.entries()) {
      const raw = await framePixels(appearance, direction);
      const size = column === 0 ? 120 : 80;
      const input = await sharp(raw, { raw: { width: 120, height: 120, channels: 4 } }).resize(size, size, { kernel: column === 0 ? "nearest" : "lanczos3" }).png().toBuffer();
      overlays.push({ input, left: x + (column === 0 ? 0 : 128 + (column - 1) * 80), top: y + (column === 0 ? 32 : 65) });
      if (group.name === "faces" && column === 0) {
        const face = await sharp(raw, { raw: { width: 120, height: 120, channels: 4 } }).extract({ left: 42, top: 36, width: 36, height: 34 }).resize(108, 102, { kernel: "nearest" }).png().toBuffer();
        overlays.push({ input: face, left: x + 133, top: y + 150 });
      }
    }
  }
  await sharp({ create: { width, height, channels: 4, background: "#eae5df" } }).composite(overlays).png().toFile(`${output}/${group.name}.png`);
  console.log(`Reviewed ${group.samples.length} ${group.name} in four directions.`);
}
