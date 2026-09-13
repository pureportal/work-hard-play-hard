import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sharp } from "./raster.mjs";
import { CHARACTER_ANIMATIONS, CHARACTER_DIRECTIONS, CHARACTER_PORTRAIT_SCALE, CHARACTER_PORTRAIT_SIZE, CHARACTER_WORLD_SIZE, DEFAULT_CHARACTER_APPEARANCE, getCharacterFrame, getCharacterLayerPaths } from "../../packages/shared/src/character.ts";

const directory = new URL("../../artifacts/characters/revision/artwork/", import.meta.url);
await mkdir(directory, { recursive: true });
const layers = new Map();
const sourceScale = CHARACTER_PORTRAIT_SCALE;

async function portrait(appearance, direction = "down", motion = "idle", elapsed = 0) {
  const frame = motion === "idle" ? { x: CHARACTER_DIRECTIONS.indexOf(direction) * CHARACTER_PORTRAIT_SIZE, y: 0, width: CHARACTER_PORTRAIT_SIZE, height: CHARACTER_PORTRAIT_SIZE } : getCharacterFrame(motion, direction, elapsed);
  const inputs = await Promise.all(getCharacterLayerPaths(appearance, motion === "idle" ? "portrait" : "animation").map(async (path) => {
    if (!layers.has(path)) layers.set(path, await readFile(new URL(`../../apps/client/public${path}`, import.meta.url)));
    return { input: await sharp(layers.get(path)).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).png().toBuffer() };
  }));
  return sharp({ create: { width: frame.width, height: frame.height, channels: 4, background: "#00000000" } }).composite(inputs).png().toBuffer();
}

async function sheet(name, entries, columns) {
  const cellWidth = 240;
  const cellHeight = 280;
  const images = [];
  for (const [index, entry] of entries.entries()) {
    const left = (index % columns) * cellWidth;
    const top = Math.floor(index / columns) * cellHeight;
    images.push({ input: await sharp(await portrait(entry.appearance, entry.direction, entry.motion, entry.elapsed)).resize(240, 240).png().toBuffer(), left, top });
    const label = `<svg width="240" height="36"><text x="120" y="24" text-anchor="middle" font-family="Arial" font-size="14" fill="#282331">${entry.label}</text></svg>`;
    images.push({ input: Buffer.from(label), left, top: top + 240 });
  }
  await sharp({ create: { width: columns * cellWidth, height: Math.ceil(entries.length / columns) * cellHeight, channels: 4, background: "#ede9e3" } })
    .composite(images).png().toFile(fileURLToPath(new URL(name, directory)));
}

const fits = [];
for (const gender of ["female", "male"]) for (const outfit of ["street", "ranger", "arcane"]) for (const breastSize of ["none", "flat", "medium", "big"]) {
  fits.push({ label: `${gender} ${outfit} ${breastSize}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, gender, breastSize, upperBody: outfit, lowerBody: outfit, shoes: outfit, hairstyle: gender === "male" ? "spiky" : "bob" } });
}
await sheet("chest-front.png", fits, 4);
await sheet("chest-side.png", fits.map((entry) => ({ ...entry, direction: "left" })), 4);
const combinations = [];
for (const gender of ["female", "male"]) for (const hairstyle of ["bob", "spiky", "ponytail"]) for (const headwear of ["none", "cap", "witch"]) {
  combinations.push({ label: `${gender} ${hairstyle} ${headwear}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, gender, hairstyle, headwear, breastSize: gender === "male" ? "none" : "medium", upperBody: "arcane", lowerBody: "ranger", shoes: "street" } });
}
await sheet("accessories.png", combinations, 6);
for (const direction of ["down", "left", "up"]) {
  const faces = [];
  const tiles = [];
  for (const gender of ["female", "male"]) for (const face of ["calm", "bright", "fierce"]) for (const hairstyle of ["bob", "spiky", "ponytail"]) for (const headwear of ["none", "cap", "witch"]) {
    const appearance = { ...DEFAULT_CHARACTER_APPEARANCE, gender, face, hairstyle, headwear };
    const index = faces.length;
    const left = index % 9 * 130;
    const top = Math.floor(index / 9) * 140;
    const source = await portrait(appearance, direction);
    tiles.push({ input: await sharp(source).extract({ left: 62 * sourceScale, top: 0, width: 56 * sourceScale, height: 48 * sourceScale }).resize(130, 112).png().toBuffer(), left, top });
    tiles.push({ input: Buffer.from(`<svg width="130" height="28"><text x="65" y="18" text-anchor="middle" font-family="Arial" font-size="10" fill="#282331">${gender} ${face}</text></svg>`), left, top: top + 112 });
    faces.push(appearance);
  }
  await sharp({ create: { width: 1170, height: 840, channels: 4, background: "#ede9e3" } }).composite(tiles).png().toFile(fileURLToPath(new URL(`heads-${direction}.png`, directory)));
}
const sizes = [];
for (const [index, entry] of combinations.entries()) {
  const source = await portrait(entry.appearance);
  const left = index % 6 * 240;
  const top = Math.floor(index / 6) * 150;
  for (const [offset, background] of [[0, "#ede9e3"], [120, "#272431"]]) {
    sizes.push({ input: await sharp({ create: { width: 120, height: 150, channels: 4, background } }).png().toBuffer(), left: left + offset, top });
    sizes.push({ input: await sharp(source).resize(CHARACTER_WORLD_SIZE, CHARACTER_WORLD_SIZE).png().toBuffer(), left: left + offset + Math.round((120 - CHARACTER_WORLD_SIZE) / 2), top: top + 8 });
    sizes.push({ input: await sharp(source).extract({ left: 67 * sourceScale, top: sourceScale, width: 46 * sourceScale, height: 48 * sourceScale }).resize(38, 38, { fit: "contain", background }).png().toBuffer(), left: left + offset + 14, top: top + 83 });
    sizes.push({ input: await sharp(source).extract({ left: 67 * sourceScale, top: sourceScale, width: 46 * sourceScale, height: 48 * sourceScale }).resize(32, 32, { fit: "contain", background }).png().toBuffer(), left: left + offset + 72, top: top + 86 });
  }
}
await sharp({ create: { width: 1440, height: 450, channels: 4, background: "#ede9e3" } }).composite(sizes).png().toFile(fileURLToPath(new URL("display-sizes.png", directory)));
const walking = [];
for (const direction of ["down", "left", "right", "up"]) for (let frame = 0; frame < 8; frame++) {
  walking.push({ label: `${direction} ${frame}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", breastSize: "none", hairstyle: "spiky", upperBody: "ranger", lowerBody: "street", shoes: "arcane" }, direction, motion: "walk", elapsed: frame * CHARACTER_ANIMATIONS.walk.frameDuration });
}
await sheet("walking.png", walking, 8);
const seated = [];
for (const gender of ["female", "male"]) for (const outfit of ["street", "ranger", "arcane"]) for (const direction of CHARACTER_DIRECTIONS) {
  seated.push({ label: `${gender} ${outfit} ${direction}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, gender, upperBody: outfit, lowerBody: outfit, shoes: outfit, hairstyle: gender === "male" ? "spiky" : "bob", breastSize: gender === "male" ? "none" : "medium" }, direction, motion: "sit", elapsed: 0 });
}
await sheet("seated.png", seated, 4);
console.log("Rendered chest fits, accessories and walking frames.");
