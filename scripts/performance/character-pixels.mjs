import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = new URL("../../artifacts/performance-2026-09-17/", import.meta.url);
await mkdir(output, { recursive: true });
const appearances = [
  { face: "calm", hairstyle: "bob", upperBody: "street", lowerBody: "street", shoes: "street", headwear: "none" },
  { face: "shy", hairstyle: "hime", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "goggles" },
  { face: "dreamy", hairstyle: "longbraid", upperBody: "festival", lowerBody: "traveler", shoes: "arcane", headwear: "witch" },
];
const results = [];
for (const appearance of appearances) {
  const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) console.error(response.status(), response.url()); });
    page.on("requestfailed", request => console.error(request.url(), request.failure()));
    await page.route("**/character-pixel-check", route => route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }));
    await page.goto("http://127.0.0.1:5173/character-pixel-check");
    const result = await page.evaluate(async ({ sharedPath, appearance }) => {
      const shared = await import(sharedPath);
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const { CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT, CHARACTER_DIRECTIONS, CHARACTER_ANIMATIONS, getCharacterFrame, getCharacterLayerPaths, composeCharacterLayers } = shared;
      const crops = [[24, 0, 72, 120], [36, 18, 48, 48], [42, 33, 36, 34], [28, 16, 64, 68], [32, 4, 56, 54], [38, 61, 44, 30], [40, 82, 40, 25], [42, 103, 36, 15]];
      const layers = await Promise.all(getCharacterLayerPaths(appearance).map(async path => {
        const image = new Image();
        image.src = path;
        try {
          await image.decode();
        } catch (error) {
          throw new Error(`Original image failed to decode: ${path}`, { cause: error });
        }
        const canvas = document.createElement("canvas");
        canvas.width = CHARACTER_ATLAS_SIZE;
        canvas.height = CHARACTER_ATLAS_HEIGHT * 2;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        canvas.width = canvas.height = 0;
        return pixels;
      }));
      const expected = document.createElement("canvas");
      expected.width = CHARACTER_ATLAS_SIZE;
      expected.height = CHARACTER_ATLAS_HEIGHT;
      const context = expected.getContext("2d", { willReadFrequently: true });
      const original = composeCharacterLayers(layers);
      context.putImageData(new ImageData(original, expected.width, expected.height), 0, 0);
      layers.length = 0;
      const verifyRegion = async region => {
        const crop = await renderCharacter(appearance, region).catch(error => { throw new Error(`Crop failed: ${JSON.stringify({ appearance, region })}: ${error.message}`); });
        const pixels = crop.getContext("2d").getImageData(0, 0, crop.width, crop.height).data;
        const reference = context.getImageData(region.x, region.y, region.width, region.height).data;
        if (pixels.length !== reference.length || pixels.some((value, index) => value !== reference[index])) {
          throw new Error(`Crop differs from original PNG composition: ${JSON.stringify({ appearance, region })}`);
        }
      };
      let imageRegions = 0;
      for (const direction of CHARACTER_DIRECTIONS) {
        const frame = getCharacterFrame("idle", direction, 0);
        for (const [x, y, width, height] of crops) {
          await verifyRegion({ x: frame.x + x, y: frame.y + y, width, height });
          imageRegions++;
        }
      }
      const atlas = await renderCharacter(appearance).catch(error => { throw new Error(`Full atlas failed: ${JSON.stringify(appearance)}: ${error.message}`); });
      const actual = atlas.getContext("2d").getImageData(0, 0, atlas.width, atlas.height).data;
      if (actual.length !== original.length || actual.some((value, index) => value !== original[index])) throw new Error("Full atlas differs from original PNG composition");
      let regions = 0;
      for (const direction of CHARACTER_DIRECTIONS) {
        const idle = getCharacterFrame("idle", direction, 0);
        const samples = crops.map(([x, y, width, height]) => ({ x: idle.x + x, y: idle.y + y, width, height }));
        for (const [motion, animation] of Object.entries(CHARACTER_ANIMATIONS)) {
          for (let frame = 0; frame < animation.frames; frame++) samples.push(getCharacterFrame(motion, direction, frame * animation.frameDuration));
        }
        for (const region of samples) {
          await verifyRegion(region);
          regions++;
        }
      }
      expected.width = expected.height = 0;
      return { appearance, fullAtlasIdentical: true, identicalImageRegions: imageRegions, identicalCachedRegions: regions };
    }, { appearance, sharedPath: `/@fs/${fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)).replaceAll("\\", "/")}` });
    assert.deepEqual(errors, []);
    results.push(result);
  } finally {
    await browser.close();
  }
}
await writeFile(new URL("character-pixels.json", output), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
