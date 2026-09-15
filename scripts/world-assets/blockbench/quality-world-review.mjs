import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/asset-quality-2026-09-15/before";
const selected = process.argv.find(value => value.startsWith("--asset="))?.slice(8).split(",");
const floorsOnly = process.argv.includes("--floors");
const catalog = JSON.parse(await readFile("packages/shared/src/asset-catalog.json", "utf8"));
const assets = catalog.assets.filter(asset => !selected || selected.includes(asset.id));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
const report = { scale: 0.78, views: [], floors: [], errors };
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (/\/(world-assets|world-architecture)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.route("**/__asset-quality-world", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0;background:#eae5df"><main></main></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__asset-quality-world");
  await page.evaluate(async () => {
    const viewSource = await (await fetch("/src/world-asset-view.ts")).text();
    const pixiPath = viewSource.match(/from\s+"([^"\n]*pixi[^"\n]*)"/)[1];
    const { Application, Container, Graphics, Text } = await import(pixiPath);
    const { createWorldAssetView } = await import("/src/world-asset-view.ts");
    const { WorldAssetTextures } = await import("/src/world-asset-textures.ts");
    const { getWorldAssetArtwork } = await import("/src/world-asset-artwork.ts");
    const shared = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/index.ts");
    const app = new Application();
    await app.init({ width: 1080, height: 1000, background: "#eae5df", antialias: true, resolution: 1, autoStart: false });
    document.querySelector("main").append(app.canvas);
    const textures = new WorldAssetTextures();
    const blank = { floorId: "quality-review", revision: 1, objects: [], walls: [], openings: [], rooms: [], tiles: [] };
    const label = (text, x, y, size = 12) => {
      const node = new Text({ text, style: { fontFamily: "Arial", fontSize: size, fill: "#514552" } });
      node.position.set(x, y);
      app.stage.addChild(node);
    };
    const draw = (asset, variantId, rotation, x, y, grid = true) => {
      const object = { id: `${asset.id}-${variantId}-${rotation}-${x}-${y}`, assetId: asset.id, variantId, rotation, x: 0, y: 0, floorId: blank.floorId };
      const holder = new Container();
      holder.position.set(x, y);
      holder.scale.set(0.78);
      if (grid) {
        const raster = shared.getAssetRasterSize(asset, rotation);
        const ground = new Graphics();
        for (let gx = 0; gx <= raster.width * 16; gx += 16) ground.moveTo(gx, 0).lineTo(gx, raster.height * 16);
        for (let gy = 0; gy <= raster.height * 16; gy += 16) ground.moveTo(0, gy).lineTo(raster.width * 16, gy);
        ground.stroke({ color: "#c8c1b8", width: 0.5 });
        holder.addChild(ground);
      }
      const view = createWorldAssetView(textures, object, blank, "light", error => { throw error; });
      holder.addChild(view.container);
      app.stage.addChild(holder);
      return view;
    };
    const ready = async () => {
      const deadline = performance.now() + 20000;
      while (true) {
        const nodes = [app.stage];
        for (const node of nodes) nodes.push(...node.children ?? []);
        if (nodes.filter(node => node.label?.startsWith("/world-assets/")).every(node => node.visible)) break;
        if (performance.now() > deadline) throw new Error("World artwork did not become visible");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      app.render();
    };
    globalThis.quality = { app, shared, getWorldAssetArtwork, label, draw, ready };
  });
  if (!floorsOnly) for (let start = 0; start < assets.length; start += 3) {
    const result = await page.evaluate(async ids => {
      const { app, shared, getWorldAssetArtwork, label, draw, ready } = globalThis.quality;
      app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
      const rows = [];
      for (const id of ids) {
        const asset = shared.requireAssetDefinition(id);
        for (const variant of shared.getAssetVariants(asset)) {
          const views = shared.ASSET_ROTATIONS.map(rotation => getWorldAssetArtwork(asset, variant.id, rotation));
          const top = Math.min(...views.map(view => view.bounds.y));
          const bottom = Math.max(...views.map(view => view.bounds.y + view.bounds.height));
          rows.push({ asset, variant, top, height: Math.max(124, Math.ceil((bottom - top) * 0.78) + 44) });
        }
      }
      const height = rows.reduce((sum, row) => sum + row.height, 36);
      app.renderer.resize(1080, height);
      label("Default gameplay zoom 0.78 · 16-unit grid", 12, 10);
      ["South 0°", "West 90°", "North 180°", "East 270°"].forEach((name, index) => label(name, 190 + index * 220 + 70, 10));
      let y = 36;
      const coverage = [];
      for (const row of rows) {
        label(row.asset.name, 12, y + 18);
        label(row.variant.name, 12, y + 36);
        for (const rotation of shared.ASSET_ROTATIONS) {
          const raster = shared.getAssetRasterSize(row.asset, rotation);
          draw(row.asset, row.variant.id, rotation, 190 + rotation / 90 * 220 + 110 - raster.width * 16 * 0.78 / 2, y + 20 - row.top * 0.78);
          coverage.push({ id: `${row.asset.id}/${row.variant.id}`, rotation });
        }
        y += row.height;
      }
      await ready();
      return { height, coverage };
    }, assets.slice(start, start + 3).map(asset => asset.id));
    const path = `${output}/world-${String(start / 3 + 1).padStart(2, "0")}.png`;
    await page.setViewportSize({ width: 1080, height: result.height });
    await page.screenshot({ path });
    report.views.push(...result.coverage.map(view => ({ ...view, evidence: path })));
    console.log(`Captured ${Math.min(start + 3, assets.length)}/${assets.length} catalog assets`);
  }
  for (const asset of assets.filter(asset => asset.placement.layer === "ground")) {
    const variants = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants;
    for (const variant of variants) {
      const result = await page.evaluate(async ({ id, variantId }) => {
        const { app, shared, label, draw, ready } = globalThis.quality;
        app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
        const asset = shared.requireAssetDefinition(id);
        const raster = shared.getAssetRasterSize(asset, 0);
        const width = raster.width * 16 * 0.78;
        const height = raster.height * 16 * 0.78;
        const countX = Math.max(3, Math.floor(330 / width));
        const countY = Math.max(3, Math.floor(260 / height));
        app.renderer.resize(1080, 760);
        label(`${asset.name} / ${variantId} · individual tiles and ${countX} × ${countY} repeated fields · zoom 0.78`, 12, 12, 14);
        for (const rotation of shared.ASSET_ROTATIONS) {
          const column = rotation / 90 % 2;
          const row = Math.floor(rotation / 180);
          const cell = shared.getAssetRasterSize(asset, rotation);
          const tileWidth = cell.width * 16 * 0.78;
          const tileHeight = cell.height * 16 * 0.78;
          label(`${rotation}°`, column * 540 + 15, row * 355 + 42);
          draw(asset, variantId, rotation, column * 540 + 20, row * 355 + 78, false);
          const nx = rotation % 180 ? countY : countX;
          const ny = rotation % 180 ? countX : countY;
          for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) draw(asset, variantId, rotation, column * 540 + 180 + x * tileWidth, row * 355 + 76 + y * tileHeight, false);
        }
        await ready();
        return { countX, countY };
      }, { id: asset.id, variantId: variant.id });
      await page.setViewportSize({ width: 1080, height: 760 });
      const path = `${output}/floor-${asset.id}-${variant.id}.png`;
      await page.screenshot({ path });
      report.floors.push({ id: `${asset.id}/${variant.id}`, rotations: [0, 90, 180, 270], ...result, evidence: path });
      console.log(`Captured repeated ground: ${asset.id}/${variant.id}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/world-coverage.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
