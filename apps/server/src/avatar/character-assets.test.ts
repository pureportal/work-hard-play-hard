import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  CHARACTER_ANIMATIONS, CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS,
  CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR,
  CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, composeCharacterLayers, getCharacterLayerPaths, getCharacterFrame,
  type CharacterAppearance, type CharacterMotion,
} from "@workhard/shared";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const appearances: CharacterAppearance[] = [];
for (const face of CHARACTER_FACES) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, face });
for (const outfit of CHARACTER_OUTFITS) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, upperBody: outfit, lowerBody: outfit, shoes: outfit });
for (const hairstyle of CHARACTER_HAIRSTYLES) for (const headwear of CHARACTER_HEADWEAR) appearances.push({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, headwear });

async function load(path: string): Promise<Uint8ClampedArray> {
  const buffer = await readFile(new URL(`../../../client/public${path}`, import.meta.url));
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height], path).toEqual([CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT * 2]);
  return new Uint8ClampedArray(data);
}

describe("production Blockbench characters", () => {
  it("ships one shared set of components in both assets and editable models", async () => {
    const paths = [...new Set(appearances.flatMap(getCharacterLayerPaths))].sort();
    const publicRoot = new URL("../../../client/public/characters/blockbench/", import.meta.url);
    const sourceRoot = new URL("../../../../scripts/characters/blockbench/", import.meta.url);
    const assets = (await readdir(publicRoot, { recursive: true })).filter(path => path.endsWith(".png"));
    expect(assets.map(path => `/characters/blockbench/${path.replaceAll("\\", "/")}`).sort()).toEqual(paths);
    const models = (await readdir(new URL("models/", sourceRoot))).sort();
    const manifest = JSON.parse(await readFile(new URL("manifest.json", sourceRoot), "utf8"));
    expect(manifest.layers.map((layer: { path: string }) => layer.path.replace("apps/client/public", "")).sort()).toEqual(paths);
    expect(models).toEqual(paths.map(path => path.replace("/characters/blockbench/", "").replace("/", "-").replace(".png", ".bbmodel")).sort());
    expect(manifest.layers.every((layer: { appearance: object }) => !("breastSize" in layer.appearance) && !("gender" in layer.appearance))).toBe(true);
    for (const appearance of appearances) {
      expect(getCharacterLayerPaths(appearance)[3]).toBe(`/characters/blockbench/upper/${appearance.upperBody}.png`);
    }
  });

  it("ships every option with complete color and depth frames, without clipping", async () => {
    const paths = [...new Set(appearances.flatMap(appearance => getCharacterLayerPaths(appearance)))];
    expect(paths).toHaveLength(CHARACTER_FACES.length + CHARACTER_OUTFITS.length * 3 + CHARACTER_HAIRSTYLES.length * CHARACTER_HEADWEAR.length);
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
    const appearance: CharacterAppearance = { face: "shy", hairstyle: "twintails", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "catears" };
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

  it("keeps idle facial features stable while the character breathes", async () => {
    for (const face of CHARACTER_FACES) {
      const data = await load(getCharacterLayerPaths({ ...DEFAULT_CHARACTER_APPEARANCE, face })[0]!);
      for (let frame = 1; frame < CHARACTER_ANIMATIONS.idle.frames; frame++) {
        const differences = [-2, -1, 0, 1, 2].map(shift => {
          let changed = 0;
          for (let y = 40; y < 66; y++) for (let x = 42; x < 78; x++) {
            const first = (y * CHARACTER_ATLAS_SIZE + x) * 4;
            const next = ((y + shift) * CHARACTER_ATLAS_SIZE + x + frame * CHARACTER_CANVAS_SIZE) * 4;
            if (data[first + 3] !== data[next + 3] || (data[first + 3] && (
              data[first] !== data[next] || data[first + 1] !== data[next + 1] || data[first + 2] !== data[next + 2]
            ))) changed++;
          }
          return changed;
        });
        expect(Math.min(...differences) / (36 * 26), `${face}/idle/${frame}`).toBeLessThan(0.005);
      }
    }
  });

  it("triangulates the concave wink without overlapping triangles", async () => {
    const model = JSON.parse(await readFile(new URL("../../../../scripts/characters/blockbench/models/head-smile.bbmodel", import.meta.url), "utf8"));
    const wink = model.elements.find((element: { name: string }) => element.name === "right wink") as {
      vertices: Record<string, [number, number, number]>;
      faces: Record<string, { vertices: string[] }>;
    };
    expect(wink).toBeDefined();
    const areas = Object.values(wink.faces).map(face => {
      const [a, b, c] = face.vertices.map(vertex => wink.vertices[vertex]!) as [[number, number, number], [number, number, number], [number, number, number]];
      return ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    });
    const coveredArea = areas.reduce((sum, area) => sum + Math.abs(area), 0);
    const outlinedArea = Math.abs(areas.reduce((sum, area) => sum + area, 0));
    expect(outlinedArea).toBeGreaterThan(0);
    expect(coveredArea).toBeCloseTo(outlinedArea, 6);
  });
});
