import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  CHARACTER_ANIMATIONS, CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS,
  CHARACTER_FACES, CHARACTER_GENDERS, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR,
  CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, composeCharacterLayers, getCharacterLayerPaths, getCharacterFrame,
  type CharacterAppearance, type CharacterMotion,
} from "@workhard/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const appearances: CharacterAppearance[] = [];
for (const gender of CHARACTER_GENDERS) {
  for (const face of CHARACTER_FACES) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, gender, face });
  for (const outfit of CHARACTER_OUTFITS) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, gender, upperBody: outfit, lowerBody: outfit, shoes: outfit });
}
for (const hairstyle of CHARACTER_HAIRSTYLES) for (const headwear of CHARACTER_HEADWEAR) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, headwear });

async function load(path: string): Promise<Uint8ClampedArray> {
  const buffer = await readFile(new URL(`../../../client/public${path}`, import.meta.url));
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height], path).toEqual([CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT * 2]);
  return new Uint8ClampedArray(data);
}

describe("production Blockbench characters", () => {
  it("ships only the current components and Flat tops in both assets and editable models", async () => {
    const paths = [...new Set(appearances.flatMap(getCharacterLayerPaths))].sort();
    const publicRoot = new URL("../../../client/public/characters/blockbench/", import.meta.url);
    const sourceRoot = new URL("../../../../scripts/characters/blockbench/", import.meta.url);
    const assets = (await readdir(publicRoot, { recursive: true })).filter(path => path.endsWith(".png"));
    expect(assets.map(path => `/characters/blockbench/${path.replaceAll("\\", "/")}`).sort()).toEqual(paths);
    const models = (await readdir(new URL("models/", sourceRoot))).sort();
    const manifest = JSON.parse(await readFile(new URL("manifest.json", sourceRoot), "utf8"));
    expect(manifest.layers.map((layer: { path: string }) => layer.path.replace("apps/client/public", "")).sort()).toEqual(paths);
    expect(models).toEqual(paths.map(path => path.replace("/characters/blockbench/", "").replace("/", "-").replace(".png", ".bbmodel")).sort());
    expect(manifest.layers.every((layer: { appearance: object }) => !("breastSize" in layer.appearance))).toBe(true);
    for (const appearance of appearances) {
      expect(getCharacterLayerPaths(appearance)[3]).toBe(`/characters/blockbench/upper/${appearance.gender}-${appearance.upperBody}-flat.png`);
    }
  });

  it("ships every option with complete color and depth frames, without clipping", async () => {
    const paths = [...new Set(appearances.flatMap(appearance => getCharacterLayerPaths(appearance)))];
    expect(paths).toHaveLength(CHARACTER_GENDERS.length * (CHARACTER_FACES.length + CHARACTER_OUTFITS.length * 3) + CHARACTER_HAIRSTYLES.length * CHARACTER_HEADWEAR.length);
    const depthStart = CHARACTER_ATLAS_SIZE * CHARACTER_ATLAS_HEIGHT * 4;
    for (const path of paths) {
      const data = await load(path);
      for (const motion of Object.keys(CHARACTER_ANIMATIONS) as CharacterMotion[]) for (const direction of CHARACTER_DIRECTIONS) {
        const animation = CHARACTER_ANIMATIONS[motion];
        for (let index = 0; index < animation.frames; index++) {
          const frame = getCharacterFrame(motion, direction, index * animation.frameDuration);
          let visible = 0, border = 0, missingDepth = 0;
          for (let y = 0; y < CHARACTER_CANVAS_SIZE; y++) for (let x = 0; x < CHARACTER_CANVAS_SIZE; x++) {
            const offset = ((frame.y + y) * CHARACTER_ATLAS_SIZE + frame.x + x) * 4;
            if (!data[offset + 3]) continue;
            visible++;
            if (!data[depthStart + offset + 3]) missingDepth++;
            if (x < 2 || y < 2 || x >= CHARACTER_CANVAS_SIZE - 2 || y >= CHARACTER_CANVAS_SIZE - 2) border++;
          }
          expect(visible, `${path}/${motion}/${direction}/${index}`).toBeGreaterThan(0);
          expect(border).toBe(0);
          expect(missingDepth).toBe(0);
        }
      }
    }
  }, 120_000);

  it("composes mixed outfits in depth order across every motion and direction", async () => {
    const appearance: CharacterAppearance = { gender: "male", face: "shy", hairstyle: "twintails", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "catears" };
    const layers = await Promise.all(getCharacterLayerPaths(appearance).map(load));
    const atlas = composeCharacterLayers(layers);
    for (const motion of Object.keys(CHARACTER_ANIMATIONS) as CharacterMotion[]) for (const direction of CHARACTER_DIRECTIONS) {
      const hashes = new Set<string>();
      const clip = CHARACTER_ANIMATIONS[motion];
      for (let index = 0; index < clip.frames; index++) {
        const frame = getCharacterFrame(motion, direction, index * clip.frameDuration);
        const hash = createHash("sha256");
        for (let y = frame.y; y < frame.y + frame.height; y++) {
          const start = (y * CHARACTER_ATLAS_SIZE + frame.x) * 4;
          hash.update(atlas.subarray(start, start + frame.width * 4));
        }
        hashes.add(hash.digest("hex"));
      }
      expect(hashes.size, `${motion}/${direction}`).toBeGreaterThanOrEqual(3);
    }
  }, 30_000);
});
