import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = "artifacts/avatar-anime";
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage({ viewport: { width: 1028, height: 800 }, deviceScaleFactor: 1 });
  const sources = await Promise.all(["before/creator-mixed.png", "after/creator-mixed.png", "before/character-style-1.png", "after/character-style-1.png"].map(async path => `data:image/png;base64,${(await readFile(`${output}/${path}`)).toString("base64")}`));
  await page.setContent('<!doctype html><html><body style="margin:0;background:#eae5df"><canvas width="1028" height="800"></canvas></body></html>');
  await page.evaluate(async sources => {
    const images = await Promise.all(sources.map(src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode a comparison screenshot"));
      image.src = src;
    })));
    const ctx = document.querySelector("canvas").getContext("2d");
    ctx.fillStyle = "#534654";
    ctx.font = "16px sans-serif";
    ctx.fillText("Before", 30, 30);
    ctx.fillText("After", 282, 30);
    ctx.fillText("Before · 80px and 120px frames", 544, 30);
    ctx.fillText("After · 80px and 120px frames", 544, 420);
    ctx.drawImage(images[0], 355, 200, 240, 575, 18, 50, 240, 575);
    ctx.drawImage(images[1], 355, 200, 240, 575, 270, 50, 240, 575);
    for (let index = 0; index < 2; index++) {
      const y = 45 + index * 390;
      ctx.drawImage(images[index + 2], 0, 0, 480, 152, 530, y, 480, 152);
      ctx.drawImage(images[index + 2], 480, 0, 480, 152, 530, y + 165, 480, 152);
    }
  }, sources);
  await page.screenshot({ path: `${output}/comparison.png` });
} finally {
  await browser.close();
}
