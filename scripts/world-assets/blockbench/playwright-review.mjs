import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-migration";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  if (!process.argv.includes("--catalog")) {
  await page.addInitScript(() => { globalThis.__PIXI_APP_INIT__ = app => { globalThis.assetReviewWorld = app; }; });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username or email").fill("maya");
  await page.getByLabel("Password", { exact: true }).fill("northstar");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => globalThis.assetReviewWorld?.stage?.children?.length > 0);
  await page.waitForFunction(() => !document.querySelector(".world-artwork-error"));
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".character-editor-actions .primary-button")?.disabled === false);
  await page.screenshot({ path: `${output}/creator.png` });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(() => {
    const nodes = [globalThis.assetReviewWorld.stage];
    for (let index = 0; index < nodes.length; index++) nodes.push(...nodes[index].children ?? []);
    return nodes.filter(node => node.texture?.source?.width === 960).length >= 3
      && nodes.filter(node => node.label?.startsWith("/world-assets/")).every(node => node.visible);
  });
  await page.screenshot({ path: `${output}/world.png` });
  }
  const audit = await context.newPage();
  await audit.route("**/__blockbench-review", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0;background:#ede8e2"><main id="review"></main></body></html>' }));
  await audit.goto("http://127.0.0.1:5173/__blockbench-review");
  const catalog = await audit.evaluate(async () => (await import("/src/world-asset-artwork.json?import")).default);
  const requested = process.argv.find(argument => argument.startsWith("--asset="))?.slice(8);
  if (requested) for (const id of requested.split(",")) assert(catalog[id], `Unknown asset: ${id}`);
  const assetIds = requested ? requested.split(",") : Object.keys(catalog);
  const selection = requested ? assetIds.length === 1 ? assetIds[0] : "selected" : "";
  const reviewPrefix = `catalog-${selection ? `${selection}-` : ""}${process.argv.includes("--base") ? "base-" : ""}`;
  await audit.evaluate(value => { globalThis.reviewBaseOnly = value; }, process.argv.includes("--base"));
  for (let start = 0; start < assetIds.length; start += 8) {
    const report = await audit.evaluate(async ids => {
      const { getWorldAssetArtwork } = await import("/src/world-asset-artwork.ts");
      const shared = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/index.ts");
      const rows = [];
      for (const id of ids) {
        const asset = shared.requireAssetDefinition(id);
        for (const variant of shared.getAssetVariants(asset).slice(0, globalThis.reviewBaseOnly ? 1 : undefined)) {
          const views = shared.ASSET_ROTATIONS.map(rotation => getWorldAssetArtwork(asset, variant.id, rotation));
          const extents = views.map((view, direction) => {
            const depth = shared.getAssetRasterSize(asset, direction * 90).height * 16;
            return { top: Math.min(-depth / 2, view.bounds.y - depth / 2), bottom: Math.max(depth / 2, view.bounds.y + view.bounds.height - depth / 2) };
          });
          const top = Math.min(...extents.map(extent => extent.top));
          const bottom = Math.max(...extents.map(extent => extent.bottom));
          rows.push({ asset, variant, views, top, height: Math.max(180, Math.ceil(bottom - top) + 70) });
        }
      }
      const main = document.getElementById("review");
      main.replaceChildren();
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = rows.reduce((sum, row) => sum + row.height, 0);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ede8e2";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      let rowY = 0;
      for (const { asset, variant, views, top, height: rowHeight } of rows) {
        ctx.fillStyle = "#514552";
        ctx.font = "12px sans-serif";
        ctx.fillText(asset.name + " · " + variant.name, 12, rowY + 18);
        const image = new Image();
        image.src = views[0].path;
        await image.decode();
        for (const [direction, view] of views.entries()) {
          const raster = shared.getAssetRasterSize(asset, direction * 90);
          const width = raster.width * 16, height = raster.height * 16;
          const x = direction * 300 + 150 - width / 2;
          const y = rowY + 38 - top - height / 2;
          ctx.strokeStyle = "#d0c8bf";
          ctx.lineWidth = 0.5;
          for (let gx = 0; gx <= width; gx += 16) { ctx.beginPath(); ctx.moveTo(x + gx, y); ctx.lineTo(x + gx, y + height); ctx.stroke(); }
          for (let gy = 0; gy <= height; gy += 16) { ctx.beginPath(); ctx.moveTo(x, y + gy); ctx.lineTo(x + width, y + gy); ctx.stroke(); }
          const { frame, bounds } = view;
          ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, x + bounds.x, y + bounds.y, bounds.width, bounds.height);
          ctx.fillStyle = "#786e69";
          ctx.fillText(["South", "West", "North", "East"][direction], direction * 300 + 130, rowY + rowHeight - 12);
        }
        rowY += rowHeight;
      }
      main.append(canvas);
      return { assets: ids.length, views: rows.length * 4, width: canvas.width, height: canvas.height };
    }, assetIds.slice(start, start + 8));
    await audit.setViewportSize({ width: report.width, height: report.height });
    await audit.screenshot({ path: `${output}/${reviewPrefix}${String(start / 8 + 1).padStart(2, "0")}.png`, fullPage: true });
    console.log(`Reviewed ${report.assets} assets, ${report.views} material/direction views`);
  }
  await writeFile(`${output}/${reviewPrefix}review.json`, JSON.stringify({ assets: assetIds.length, views: assetIds.length * (process.argv.includes("--base") ? 4 : 12), errors }, null, 2));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
