import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { root } from "./sources.mjs";

const output = new URL("artifacts/image-optimization-2026-09-16/", root);
const benchmark = JSON.parse(await readFile(new URL("formats/benchmark.json", output), "utf8"));
const artwork = JSON.parse(await readFile(new URL("apps/client/src/world-asset-artwork.json", root), "utf8"));
const manifest = JSON.parse(await readFile(new URL("scripts/images/manifest.json", root), "utf8"));
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1040 }, deviceScaleFactor: 1 });
  const measurements = [];
  for (const source of new Set(benchmark.results.map(result => result.source))) {
    const name = source.slice(1).replaceAll("/", "-").replace(/\.png$/, "");
    for (const format of ["original.png", "png", "webp", "avif"]) {
      const buffer = await readFile(new URL(`formats/${name}.${format}`, output));
      const times = await page.evaluate(async ({ data, type }) => {
        const blob = new Blob([Uint8Array.from(atob(data), character => character.charCodeAt(0))], { type });
        const times = [];
        for (let index = 0; index < 9; index++) {
          const started = performance.now();
          const bitmap = await createImageBitmap(blob);
          if (index) times.push(performance.now() - started);
          bitmap.close();
        }
        return times.sort((left, right) => left - right);
      }, { data: buffer.toString("base64"), type: `image/${format.endsWith("png") ? "png" : format}` });
      measurements.push({ source, format, bytes: buffer.length, medianDecodeMs: (times[3] + times[4]) / 2, samples: times });
    }
  }
  await writeFile(new URL("browser-decode.json", output), JSON.stringify({ browser: browser.version(), measurements }, null, 2) + "\n");
  const pairs = [];
  for (const id of ["food-sushi", "food-bibimbap", "food-burger", "plant-croton", "plant-fern", "plant-orchid", "decor-wind-chimes", "decor-jellyfish-lamp", "outdoor-mini-windmill", "storage-credenza", "floor-wood", "decor-tea-set"]) {
    const [variantId, variant] = Object.entries(artwork[id].variants)[0];
    const original = `data:image/png;base64,${(await readFile(new URL(`apps/client/public${variant.path}`, root))).toString("base64")}`;
    for (const [index, frame] of variant.frames.slice(0, 4).entries()) {
      const preview = manifest[variant.path].previews[index];
      const optimized = `data:image/webp;base64,${(await readFile(new URL(`apps/client/public/optimized-images/${preview.id}.webp`, root))).toString("base64")}`;
      pairs.push({ id, variantId, rotation: index * 90, original, optimized, frame });
    }
  }
  const rows = [];
  for (let index = 0; index < pairs.length; index += 4) {
    const row = pairs.slice(index, index + 4);
    rows.push(`<tr><th>${row[0].id}</th>${row.map(pair => `<td><svg width="64" height="64" viewBox="0 0 ${pair.frame.width} ${pair.frame.height}"><svg width="${pair.frame.width}" height="${pair.frame.height}" viewBox="${pair.frame.x} ${pair.frame.y} ${pair.frame.width} ${pair.frame.height}" overflow="hidden"><image href="${pair.original}" /></svg></svg><img width="64" height="64" src="${pair.optimized}" /></td>`).join("")}</tr>`);
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Asset preview comparison</title><style>body{font:14px system-ui;background:#f3eddf;color:#332d3a;margin:16px}table{border-collapse:collapse}th,td{padding:5px 10px;border-bottom:1px solid #d8d0c0}th{text-align:left}img{object-fit:contain}td{white-space:nowrap}svg,img{vertical-align:middle}h1{font-size:20px}</style><h1>Original / optimized preview</h1><table><thead><tr><th>Asset</th><th>0°</th><th>90°</th><th>180°</th><th>270°</th></tr></thead><tbody>${rows.join("")}</tbody></table></html>`;
  await writeFile(new URL("preview-comparison.html", output), html);
  await page.setContent(html);
  await page.evaluate(async () => {
    const images = [...document.querySelectorAll("img")];
    await Promise.all(images.map(image => image.decode()));
    const sources = [...document.querySelectorAll("svg image")].map(image => image.getAttribute("href"));
    await Promise.all(sources.map(source => { const image = new Image(); image.src = source; return image.decode(); }));
  });
  assert.equal(await page.locator("img").count(), 48);
  await page.screenshot({ path: fileURLToPath(new URL("preview-comparison.png", output)), fullPage: true });
  console.table(measurements.map(({ source, format, bytes, medianDecodeMs }) => ({ source, format, bytes, medianDecodeMs })));
  console.log("Captured 48 original/optimized directional preview comparisons.");
} finally {
  await browser.close();
}
