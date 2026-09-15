import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_HAIRSTYLES, CHARACTER_FACES, CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/avatar-anime/after";
const selected = process.argv.find(argument => argument.startsWith("--hair="))?.slice(7).split(",");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__appearance-review", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"><canvas id="review"></canvas></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__appearance-review");
  const groups = [{ name: "hairstyles", samples: (selected ?? CHARACTER_HAIRSTYLES).map(hairstyle => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle })) }];
  if (!selected) groups.push(
    { name: "faces", samples: CHARACTER_FACES.map(face => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "curtains", face })) },
    { name: "outfits", samples: CHARACTER_OUTFITS.map((outfit, index) => ({ ...DEFAULT_CHARACTER_APPEARANCE, gender: index % 2 ? "male" : "female", hairstyle: CHARACTER_HAIRSTYLES[index + 6], upperBody: outfit, lowerBody: outfit, shoes: outfit })) },
  );
  for (const group of groups) {
    const height = Math.ceil(group.samples.length / 3) * 180;
    await page.setViewportSize({ width: 1116, height });
    await page.evaluate(async ({ name, samples, height }) => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const { CHARACTER_DIRECTIONS, getCharacterFrame } = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/character.ts");
      const canvas = document.getElementById("review");
      canvas.width = 1116;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#eae5df";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [index, appearance] of samples.entries()) {
        const atlas = await renderCharacter(appearance);
        const x = index % 3 * 372, y = Math.floor(index / 3) * 180;
        ctx.fillStyle = "#534654";
        ctx.font = "13px sans-serif";
        ctx.fillText(appearance[name === "hairstyles" ? "hairstyle" : name === "faces" ? "face" : "upperBody"], x + 12, y + 20);
        for (const [column, direction] of CHARACTER_DIRECTIONS.entries()) {
          const frame = getCharacterFrame("idle", direction, 0);
          const size = column === 0 ? 120 : 80;
          ctx.imageSmoothingEnabled = column !== 0;
          ctx.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x + (column === 0 ? 0 : 128 + (column - 1) * 80), y + (column === 0 ? 30 : 68), size, size);
        }
      }
    }, { ...group, height });
    await page.screenshot({ path: `${output}/${group.name}.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/appearance-review.json`, JSON.stringify({ groups: groups.map(({ name, samples }) => ({ name, samples: samples.length, sizes: [120, 80] })), errors }, null, 2));
} finally {
  await browser.close();
}
