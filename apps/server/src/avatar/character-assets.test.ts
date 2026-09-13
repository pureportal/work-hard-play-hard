import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  CHARACTER_ANIMATIONS, CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS,
  CHARACTER_BREAST_SIZES, CHARACTER_FACES, CHARACTER_GENDERS, CHARACTER_HAIRSTYLES,
  CHARACTER_HEADWEAR, CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, getCharacterLayerPaths, getCharacterFrame,
  CHARACTER_PORTRAIT_SCALE, CHARACTER_PORTRAIT_SIZE,
  type CharacterAppearance,
} from "@workhard/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const dimensions = {
  gender: CHARACTER_GENDERS, breastSize: CHARACTER_BREAST_SIZES, face: CHARACTER_FACES,
  hairstyle: CHARACTER_HAIRSTYLES, upperBody: CHARACTER_OUTFITS, lowerBody: CHARACTER_OUTFITS,
  shoes: CHARACTER_OUTFITS, headwear: CHARACTER_HEADWEAR,
};

describe("shipped character artwork", () => {
  it("resolves all combinations to padded transparent layers and distinct clothing fits", async () => {
    let combinations: CharacterAppearance[] = [{ ...DEFAULT_CHARACTER_APPEARANCE }];
    for (const [key, options] of Object.entries(dimensions)) {
      combinations = combinations.flatMap((appearance) => options.map((option) => ({ ...appearance, [key]: option })));
    }
    expect(combinations).toHaveLength(5832);
    const paths = [...new Set(combinations.flatMap((appearance) => getCharacterLayerPaths(appearance)))];
    expect(paths).toHaveLength(51);
    const hashes = new Map<string, string>();
    for (const path of paths) {
      const buffer = await readFile(new URL(`../../../client/public${path}`, import.meta.url));
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height], path).toEqual([CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_SIZE]);
      for (const direction of CHARACTER_DIRECTIONS) for (const motion of ["idle", "walk", "sit"] as const) {
        const animation = CHARACTER_ANIMATIONS[motion];
        for (let index = 0; index < animation.frames; index++) {
          const frame = getCharacterFrame(motion, direction, index * animation.frameDuration);
          let visible = 0;
          let border = 0;
          for (let y = 0; y < CHARACTER_CANVAS_SIZE; y++) for (let x = 0; x < CHARACTER_CANVAS_SIZE; x++) {
            const alpha = data[((frame.y + y) * info.width + frame.x + x) * 4 + 3]!;
            if (!alpha) continue;
            visible++;
            if (x < 2 || x >= CHARACTER_CANVAS_SIZE - 2 || y < 2 || y >= CHARACTER_CANVAS_SIZE - 2) border++;
          }
          expect(visible, `${path} ${motion} ${direction} ${index}`).toBeGreaterThan(0);
          expect(border, `${path} ${motion} ${direction} ${index} must not clip`).toBe(0);
        }
      }
      hashes.set(path, createHash("sha256").update(data).digest("hex"));
      const portraitPath = path.replace("/anime/", "/anime/portraits/");
      const portrait = await sharp(await readFile(new URL(`../../../client/public${portraitPath}`, import.meta.url))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([portrait.info.width, portrait.info.height], portraitPath).toEqual([CHARACTER_PORTRAIT_SIZE * 4, CHARACTER_PORTRAIT_SIZE]);
      let portraitBorder = 0;
      const margin = 2 * CHARACTER_PORTRAIT_SCALE;
      for (let y = 0; y < portrait.info.height; y++) for (let x = 0; x < portrait.info.width; x++) {
        if (y >= margin && y < CHARACTER_PORTRAIT_SIZE - margin && x % CHARACTER_PORTRAIT_SIZE >= margin && x % CHARACTER_PORTRAIT_SIZE < CHARACTER_PORTRAIT_SIZE - margin) continue;
        if (portrait.data[(y * portrait.info.width + x) * 4 + 3]) portraitBorder++;
      }
      expect(portraitBorder, `${portraitPath} must have transparent frame margins`).toBe(0);
    }
    for (const gender of CHARACTER_GENDERS) for (const outfit of CHARACTER_OUTFITS) {
      expect(new Set(CHARACTER_BREAST_SIZES.map((size) => hashes.get(`/characters/anime/upper/${gender}-${outfit}-${size}.png`))).size).toBe(4);
    }
    for (const gender of CHARACTER_GENDERS) {
      expect(new Set(CHARACTER_FACES.map((face) => hashes.get(`/characters/anime/head/${gender}-${face}.png`))).size).toBe(3);
    }
  }, 60_000);

  it("ships distinct walking, seated and idle poses in every direction", async () => {
    const inputs = await Promise.all(getCharacterLayerPaths(DEFAULT_CHARACTER_APPEARANCE).map(async (path) => ({ input: await readFile(new URL(`../../../client/public${path}`, import.meta.url)) })));
    const atlas = await sharp({ create: { width: CHARACTER_ATLAS_SIZE, height: CHARACTER_ATLAS_SIZE, channels: 4, background: "#00000000" } }).composite(inputs).raw().toBuffer();
    for (const direction of CHARACTER_DIRECTIONS) for (const motion of ["idle", "walk", "sit"] as const) {
      const hashes = new Set<string>();
      const { frames, frameDuration } = CHARACTER_ANIMATIONS[motion];
      for (let index = 0; index < frames; index++) {
        const frame = getCharacterFrame(motion, direction, index * frameDuration);
        const hash = createHash("sha256");
        for (let y = frame.y; y < frame.y + frame.height; y++) {
          const start = (y * CHARACTER_ATLAS_SIZE + frame.x) * 4;
          hash.update(atlas.subarray(start, start + frame.width * 4));
        }
        hashes.add(hash.digest("hex"));
      }
      expect(hashes.size, `${motion} ${direction}`).toBeGreaterThanOrEqual(motion === "walk" ? 6 : 3);
    }
  });

  it("keeps necks, waistbands and ankles joined across interchangeable parts", async () => {
    for (const gender of CHARACTER_GENDERS) for (const direction of CHARACTER_DIRECTIONS) {
      const directionOffset = CHARACTER_DIRECTIONS.indexOf(direction) * CHARACTER_PORTRAIT_SIZE;
      const layers = new Map<string, Buffer>();
      const loadLayer = async (name: string) => {
        if (!layers.has(name)) {
          const pixels = await sharp(await readFile(new URL(`../../../client/public/characters/anime/portraits/${name}.png`, import.meta.url)))
            .extract({ left: directionOffset, top: 0, width: CHARACTER_PORTRAIT_SIZE, height: CHARACTER_PORTRAIT_SIZE }).ensureAlpha().raw().toBuffer();
          layers.set(name, pixels);
        }
        return layers.get(name)!;
      };
      const overlap = async (first: string, second: string, region: { left: number; top: number; width: number; height: number }) => {
        const pixels = await Promise.all([first, second].map(loadLayer));
        let joined = 0;
        for (let y = region.top * CHARACTER_PORTRAIT_SCALE; y < (region.top + region.height) * CHARACTER_PORTRAIT_SCALE; y++) {
          for (let x = region.left * CHARACTER_PORTRAIT_SCALE; x < (region.left + region.width) * CHARACTER_PORTRAIT_SCALE; x++) {
            const index = (y * CHARACTER_PORTRAIT_SIZE + x) * 4 + 3;
            if (pixels[0]![index]! > 64 && pixels[1]![index]! > 64) joined++;
          }
        }
        expect(joined, `${gender} ${direction}: ${first} joins ${second}`).toBeGreaterThan(6);
      };
      for (const upper of CHARACTER_OUTFITS) for (const fit of CHARACTER_BREAST_SIZES) {
        const top = `upper/${gender}-${upper}-${fit}`;
        const pixels = await loadLayer(top);
        let handPixels = 0;
        for (let y = 92 * CHARACTER_PORTRAIT_SCALE; y < 108 * CHARACTER_PORTRAIT_SCALE; y++) for (let x = 52 * CHARACTER_PORTRAIT_SCALE; x < 128 * CHARACTER_PORTRAIT_SCALE; x++) {
          const index = (y * CHARACTER_PORTRAIT_SIZE + x) * 4;
          const r = pixels[index]!;
          const g = pixels[index + 1]!;
          const b = pixels[index + 2]!;
          if (pixels[index + 3]! > 64 && r > 150 && g > 90 && r > g + 8 && r > b + 20 && g - b < 45) handPixels++;
        }
        expect(handPixels, `${direction} ${top} retains hands below the sleeves`).toBeGreaterThan(10 * CHARACTER_PORTRAIT_SCALE ** 2);
        for (const face of CHARACTER_FACES) await overlap(`head/${gender}-${face}`, top, { left: 79, top: 37, width: 23, height: 8 });
        for (const lower of CHARACTER_OUTFITS) await overlap(top, `lower/${gender}-${lower}`, { left: 84, top: 72, width: 12, height: 15 });
      }
      for (const lower of CHARACTER_OUTFITS) for (const shoes of CHARACTER_OUTFITS) {
        for (const left of direction === "left" || direction === "right" ? [75] : [73, 90]) {
          await overlap(`lower/${gender}-${lower}`, `shoes/${gender}-${shoes}`, { left, top: 154, width: direction === "left" || direction === "right" ? 30 : 17, height: 9 });
        }
      }
    }
  }, 30_000);

  it("distinguishes neighboring chest sizes through every outfit from the front and side", async () => {
    for (const gender of CHARACTER_GENDERS) for (const outfit of CHARACTER_OUTFITS) for (const direction of ["down", "left"] as const) {
      const frame = getCharacterFrame("idle", direction, 0);
      const fits = await Promise.all(CHARACTER_BREAST_SIZES.map(async (size) => sharp(await readFile(new URL(`../../../client/public/characters/anime/upper/${gender}-${outfit}-${size}.png`, import.meta.url)))
        .extract({ left: frame.x + 60, top: frame.y + 50, width: 60, height: 38 }).ensureAlpha().raw().toBuffer()));
      for (let index = 1; index < fits.length; index++) {
        let changed = 0;
        for (let pixel = 0; pixel < fits[index]!.length; pixel += 4) {
          if (fits[index]!.subarray(pixel, pixel + 4).some((value, channel) => Math.abs(value - fits[index - 1]![pixel + channel]!) > 24)) changed++;
        }
        expect(changed, `${gender} ${outfit} ${direction}: ${CHARACTER_BREAST_SIZES[index - 1]} / ${CHARACTER_BREAST_SIZES[index]}`).toBeGreaterThan(45);
      }
    }
  });
});
