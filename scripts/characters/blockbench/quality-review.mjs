import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, getCharacterLayerPaths } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/asset-quality-2026-09-15/before/characters";
const selected = process.argv.find(value => value.startsWith("--sample="))?.slice(9).split(",");
const samples = [
  ...CHARACTER_HAIRSTYLES.flatMap(hairstyle => CHARACTER_HEADWEAR.map(headwear => ({ id: `hair-${hairstyle}-${headwear}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, headwear } }))),
  ...CHARACTER_FACES.map(face => ({ id: `face-${face}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, face, hairstyle: "curtains" } })),
  ...CHARACTER_OUTFITS.map(outfit => ({ id: `outfit-${outfit}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, upperBody: outfit, lowerBody: outfit, shoes: outfit } })),
].filter(sample => !selected || selected.includes(sample.id));
const manifest = JSON.parse(await readFile("scripts/characters/blockbench/manifest.json", "utf8"));
const covered = new Set(samples.flatMap(sample => getCharacterLayerPaths(sample.appearance)));
if (!selected) assert.deepEqual([...covered].sort(), manifest.layers.map(layer => layer.path.replace("apps/client/public", "")).sort());
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
const report = { scale: 0.78, frameScreenSize: 62.4, samples: [], layers: [...covered], errors };
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1110 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.url().includes("/characters/") && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/__asset-quality-characters", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"><canvas width="1080" height="1110"></canvas></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__asset-quality-characters");
  for (let start = 0; start < samples.length; start += 2) {
    const group = samples.slice(start, start + 2);
    const result = await page.evaluate(async samples => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const { CHARACTER_ANIMATIONS, CHARACTER_DIRECTIONS, getCharacterFrame } = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/character.ts");
      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      context.fillStyle = "#eae5df";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.font = "12px Arial";
      context.fillStyle = "#514552";
      context.fillText("Default gameplay size: 62.4px · every animation frame · directions down / left / right / up", 12, 18);
      context.imageSmoothingEnabled = true;
      const checks = [];
      for (const [column, sample] of samples.entries()) {
        const atlas = await renderCharacter(sample.appearance);
        const x = column * 540 + 12;
        context.fillStyle = "#514552";
        context.fillText(sample.id, x, 42);
        let row = 0;
        const clips = [
          { label: "idle 1–4 / sit 1–4", motions: ["idle", "sit"] },
          { label: "walk 1–8", motions: ["walk"] },
          { label: "listen 1–8", motions: ["listen"] },
          { label: "sit-listen 1–8", motions: ["sit-listen"] },
        ];
        for (const clip of clips) {
          context.fillText(clip.label, x, 64 + row * 64);
          for (const direction of CHARACTER_DIRECTIONS) {
            let frameColumn = 0;
            for (const motion of clip.motions) {
              const animation = CHARACTER_ANIMATIONS[motion];
              for (let index = 0; index < animation.frames; index++) {
                const frame = getCharacterFrame(motion, direction, index * animation.frameDuration);
                context.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x + frameColumn++ * 64, 66 + row * 64, 62.4, 62.4);
              }
            }
            row++;
          }
        }
        checks.push({ id: sample.id, frames: 128, directions: CHARACTER_DIRECTIONS, animations: Object.keys(CHARACTER_ANIMATIONS) });
      }
      return checks;
    }, group);
    const path = `${output}/characters-${String(start / 2 + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path });
    report.samples.push(...result.map((entry, index) => ({ ...entry, appearance: group[index].appearance, layers: getCharacterLayerPaths(group[index].appearance), evidence: path })));
    console.log(`Captured ${Math.min(start + 2, samples.length)}/${samples.length} character compositions`);
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/coverage.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
