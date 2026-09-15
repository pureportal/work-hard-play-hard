import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/asset-improvement/after/animation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 1040 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__map-animation-review", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"><canvas id="review" width="960" height="1040"></canvas></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__map-animation-review");
  for (const id of ["decor-wind-chimes", "decor-pinwheel"]) {
    await page.evaluate(async id => {
      const artwork = (await import("/src/world-asset-artwork.json?import")).default[id];
      const design = artwork.variants.sakura;
      const image = new Image();
      image.src = design.path;
      await image.decode();
      const canvas = document.getElementById("review");
      const context = canvas.getContext("2d");
      context.fillStyle = "#ede8e2";
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (let direction = 0; direction < 4; direction++) for (let sample = 0; sample < 4; sample++) {
        const frame = design.frames[sample * 12 + direction], bounds = design.bounds[sample * 12 + direction];
        const x = sample * 240, y = direction * 260;
        context.fillStyle = "#514552";
        context.font = "12px sans-serif";
        context.fillText(`${["South", "West", "North", "East"][direction]} · ${sample * 300}ms`, x + 12, y + 20);
        for (const [scale, center] of [[1, 38], [2, 160]]) {
          context.drawImage(image, frame.x, frame.y, frame.width, frame.height, x + center - bounds.width * scale / 2, y + 32 + (212 - bounds.height * scale) / 2, bounds.width * scale, bounds.height * scale);
        }
      }
    }, id);
    await page.screenshot({ path: `${output}/${id}.png` });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
