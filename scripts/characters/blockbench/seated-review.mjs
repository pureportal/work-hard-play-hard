import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_DIRECTIONS, CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, getCharacterFrame } from "../../../packages/shared/src/character.ts";

const motion = process.argv.includes("--listening") ? "sit-listen" : "sit";
const frames = CHARACTER_DIRECTIONS.map(direction => getCharacterFrame(motion, direction, 0));
const output = `artifacts/seating-fit/outfits${motion === "sit-listen" ? "-listening" : ""}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__seated-review", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><canvas width='960' height='840'></canvas></body></html>" }));
  await page.goto("http://127.0.0.1:5173/__seated-review");
  for (let start = 0; start < CHARACTER_OUTFITS.length; start += 6) {
    const png = await page.evaluate(async ({ outfits, appearance, frames }) => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      context.fillStyle = "#d8e5df";
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const [row, outfit] of outfits.entries()) {
        const character = { ...appearance, upperBody: outfit, lowerBody: outfit, shoes: outfit, hairstyle: row % 2 ? "spiky" : "bob" };
        for (const [profile, pose] of ["chair", "floor"].entries()) {
          const atlas = await renderCharacter(character, undefined, pose);
          for (const [direction, frame] of frames.entries()) context.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, profile * 480 + direction * 120, row * 140, 120, 120);
          context.fillStyle = "#30283c";
          context.font = "13px sans-serif";
          context.fillText(`${outfit} / ${pose}`, profile * 480 + 12, row * 140 + 135);
        }
      }
      return canvas.toDataURL("image/png").split(",")[1];
    }, { outfits: CHARACTER_OUTFITS.slice(start, start + 6), appearance: DEFAULT_CHARACTER_APPEARANCE, frames });
    await writeFile(`${output}/page-${start / 6 + 1}.png`, Buffer.from(png, "base64"));
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
