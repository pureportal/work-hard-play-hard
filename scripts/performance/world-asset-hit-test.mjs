import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const root = resolve(import.meta.dirname, "../..");
const artwork = JSON.parse(await readFile(resolve(root, "apps/client/src/world-asset-artwork.json"), "utf8"));
const optimized = JSON.parse(await readFile(resolve(root, "apps/client/src/optimized-world-images.json"), "utf8"));
const samples = [
  ["storage-credenza", "ink"],
  ["decor-wind-chimes", "sakura"],
  ["outdoor-mini-windmill", "sakura"],
];
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });

try {
  const page = await browser.newPage();
  const results = [];
  for (const [asset, variant] of samples) {
    const entry = artwork[asset];
    const source = entry.variants[variant];
    const hash = optimized[source.path][0];
    const image = await readFile(resolve(root, `apps/client/public/optimized-images/${hash}.webp`));
    const frames = entry.animation ? source.frames.filter((_, index) => index % 4 === 0) : [source.frames[0]];
    const result = await page.evaluate(async ({ imageUrl, width, height, frames }) => {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const referenceCanvas = document.createElement("canvas");
      referenceCanvas.width = width;
      referenceCanvas.height = height;
      const referenceContext = referenceCanvas.getContext("2d");
      referenceContext.drawImage(image, 0, 0);
      const referencePixels = referenceContext.getImageData(0, 0, width, height).data;
      for (const frame of frames) {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = frame.width;
        cropCanvas.height = frame.height;
        const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
        cropContext.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
        const cropPixels = cropContext.getImageData(0, 0, frame.width, frame.height).data;
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            const original = referencePixels[((frame.y + y) * width + frame.x + x) * 4 + 3] >= 32;
            const cropped = cropPixels[(y * frame.width + x) * 4 + 3] >= 32;
            if (original !== cropped) throw new Error(`Crop differs at ${frame.x + x}:${frame.y + y}`);
          }
        }
        cropCanvas.width = cropCanvas.height = 0;
      }
      referenceCanvas.width = referenceCanvas.height = 0;
      const measure = (action) => {
        const started = performance.now();
        const visible = action();
        return { milliseconds: performance.now() - started, visible };
      };
      const fullAtlas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        const alpha = new Uint8Array(width * height);
        for (let index = 0; index < alpha.length; index++) alpha[index] = pixels[index * 4 + 3];
        const visible = frames.some(frame => alpha[(frame.y + Math.floor(frame.height / 2)) * width + frame.x + Math.floor(frame.width / 2)] >= 32);
        canvas.width = canvas.height = 0;
        return visible;
      };
      const croppedFrames = (packed) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(...frames.map(frame => frame.width));
        canvas.height = frames.reduce((sum, frame) => sum + frame.height, 0);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let top = 0;
        for (const frame of frames) {
          context.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, top, frame.width, frame.height);
          top += frame.height;
        }
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = false;
        top = 0;
        for (const frame of frames) {
          const alpha = new Uint8Array(packed ? Math.ceil(frame.width * frame.height / 8) : frame.width * frame.height);
          for (let y = 0; y < frame.height; y++) {
            for (let x = 0; x < frame.width; x++) {
              const index = y * frame.width + x;
              const value = pixels[((top + y) * canvas.width + x) * 4 + 3];
              if (packed) {
                if (value >= 32) alpha[index >> 3] |= 1 << (index & 7);
              } else {
                alpha[index] = value;
              }
            }
          }
          const center = Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2);
          visible ||= packed ? (alpha[center >> 3] & (1 << (center & 7))) !== 0 : alpha[center] >= 32;
          top += frame.height;
        }
        canvas.width = canvas.height = 0;
        return visible;
      };
      fullAtlas();
      croppedFrames(true);
      croppedFrames(false);
      const before = [];
      const afterPacked = [];
      const afterBytes = [];
      for (let index = 0; index < 12; index++) {
        const pair = index % 2
          ? [[() => croppedFrames(false), afterBytes], [() => croppedFrames(true), afterPacked], [fullAtlas, before]]
          : [[fullAtlas, before], [() => croppedFrames(true), afterPacked], [() => croppedFrames(false), afterBytes]];
        for (const [action, measurements] of pair) measurements.push(measure(action));
      }
      return { before, afterPacked, afterBytes, atlasPixels: width * height, readPixels: canvasArea(frames) };

      function canvasArea(frames) {
        return Math.max(...frames.map(frame => frame.width)) * frames.reduce((sum, frame) => sum + frame.height, 0);
      }
    }, { imageUrl: `data:image/webp;base64,${image.toString("base64")}`, width: source.width, height: source.height, frames });
    assert.deepEqual(result.before.map(value => value.visible), result.afterPacked.map(value => value.visible));
    assert.deepEqual(result.before.map(value => value.visible), result.afterBytes.map(value => value.visible));
    const median = values => values.map(value => value.milliseconds).sort((a, b) => a - b)[Math.floor(values.length / 2)];
    results.push({ asset, variant, atlasPixels: result.atlasPixels, readPixels: result.readPixels,
      beforeMedianMs: median(result.before), afterPackedMedianMs: median(result.afterPacked), afterBytesMedianMs: median(result.afterBytes) });
  }
  console.log(JSON.stringify({ browser: browser.version(), iterations: 12, results }, null, 2));
} finally {
  await browser.close();
}
