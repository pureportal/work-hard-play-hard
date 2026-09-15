import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-migration";
const height = CHARACTER_HEADWEAR.length * 140;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__headwear-review", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body style="margin:0"><canvas id="review" width="960" height="${height}"></canvas></body></html>` }));
  await page.goto("http://127.0.0.1:5173/__headwear-review");
  for (const hairstyle of CHARACTER_HAIRSTYLES) {
    await page.evaluate(async ({ hairstyle, headwears, appearance }) => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const { CHARACTER_DIRECTIONS, getCharacterFrame } = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/character.ts");
      const canvas = document.getElementById("review");
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#eae5df";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      for (const [row, headwear] of headwears.entries()) {
        const atlas = await renderCharacter({ ...appearance, hairstyle, headwear });
        ctx.fillStyle = "#635565";
        ctx.font = "12px sans-serif";
        ctx.fillText(`${hairstyle} / ${headwear}`, 12, row * 140 + 16);
        for (const [column, direction] of CHARACTER_DIRECTIONS.entries()) {
          for (const [index, motion] of ["idle", "listen"].entries()) {
            const frame = getCharacterFrame(motion, direction, 200);
            ctx.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, column * 240 + index * 120, row * 140 + 20, 120, 120);
          }
        }
      }
    }, { hairstyle, headwears: CHARACTER_HEADWEAR, appearance: DEFAULT_CHARACTER_APPEARANCE });
    await page.screenshot({ path: `${output}/headwear-${hairstyle}.png` });
  }
  assert.deepEqual(errors, []);
  const combinations = CHARACTER_HAIRSTYLES.length * CHARACTER_HEADWEAR.length;
  await writeFile(`${output}/headwear-review.json`, JSON.stringify({ combinations, views: combinations * 8, motions: ["idle", "listen"], errors }, null, 2));
  console.log(`Captured all ${combinations} hair/headwear combinations, idle and listening, in four directions.`);
} finally { await browser.close(); }
