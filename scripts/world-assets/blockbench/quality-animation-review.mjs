import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/asset-quality-2026-09-15/after/animations";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1080, height: 1000 }, recordVideo: { dir: `${output}/video`, size: { width: 1080, height: 1000 } } });
const errors = [];
const report = { assets: [], errors };
try {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__animation-quality", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__animation-quality");
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world-asset-view.ts")).text();
    const { Application, Container, Text } = await import(source.match(/from\s+"([^"\n]*pixi[^"\n]*)"/)[1]);
    const { createWorldAssetView } = await import("/src/world-asset-view.ts");
    const { WorldAssetTextures } = await import("/src/world-asset-textures.ts");
    const { getWorldAssetArtwork } = await import("/src/world-asset-artwork.ts");
    const shared = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/index.ts");
    const app = new Application();
    await app.init({ width: 1080, height: 1000, background: "#eae5df", antialias: true, resolution: 1, autoStart: false });
    document.body.append(app.canvas);
    const textures = new WorldAssetTextures();
    const layout = { floorId: "animation-review", revision: 1, objects: [], rooms: [], walls: [], openings: [], tiles: [] };
    const label = (text, x, y) => {
      const node = new Text({ text, style: { fontFamily: "Arial", fontSize: 12, fill: "#514552" } });
      node.position.set(x, y);
      app.stage.addChild(node);
    };
    const draw = (asset, variantId, rotation, x, y) => {
      const artwork = getWorldAssetArtwork(asset, variantId, rotation);
      const holder = new Container();
      holder.scale.set(0.78);
      holder.position.set(x - artwork.bounds.width * 0.78 / 2 - artwork.bounds.x * 0.78, y - artwork.bounds.y * 0.78);
      const view = createWorldAssetView(textures, { id: `${asset.id}-${x}-${y}`, assetId: asset.id, variantId, rotation, x: 0, y: 0, floorId: layout.floorId }, layout, "light", error => { throw error; });
      holder.addChild(view.container);
      app.stage.addChild(holder);
      return view;
    };
    const ready = async () => {
      const deadline = performance.now() + 15000;
      while (true) {
        const nodes = [app.stage];
        for (const node of nodes) nodes.push(...node.children ?? []);
        if (nodes.filter(node => node.label?.startsWith("/world-assets/")).every(node => node.visible)) return;
        if (performance.now() > deadline) throw new Error("Animation artwork did not load");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    globalThis.animationQuality = { app, shared, label, draw, ready };
  });
  for (const id of ["decor-wind-chimes", "decor-pinwheel", "outdoor-pool", "outdoor-fountain", "outdoor-koi-pond"]) {
    const native = id.startsWith("decor-");
    const times = native ? Array.from({ length: 16 }, (_, index) => index * 100) : [0, 600, 1200, 1800, 2400, 3000, 3600, 4200];
    const columns = native ? 8 : 4;
    const evidence = [];
    for (let start = 0; start < times.length; start += columns) {
      const result = await page.evaluate(async ({ id, times, columns, native }) => {
        const { app, shared, label, draw, ready } = globalThis.animationQuality;
        app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
        const asset = shared.requireAssetDefinition(id);
        const rowHeight = native ? 77 : 185;
        const height = 52 + 12 * rowHeight;
        app.renderer.resize(1080, height);
        label(`${asset.name} · all designs/directions · normal gameplay zoom 0.78`, 12, 20);
        times.forEach((time, column) => label(`${time}ms`, 190 + column * (880 / columns), 40));
        const views = [];
        let row = 0;
        for (const variant of shared.getAssetVariants(asset)) for (const rotation of shared.ASSET_ROTATIONS) {
          label(`${variant.name} / ${rotation}°`, 12, 70 + row * rowHeight);
          times.forEach((time, column) => views.push({ time, view: draw(asset, variant.id, rotation, 160 + (column + 0.5) * (900 / columns), 61 + row * rowHeight) }));
          row++;
        }
        await ready();
        for (const { time, view } of views) view.animate(time);
        app.render();
        return { height, views: views.length };
      }, { id, times: times.slice(start, start + columns), columns, native });
      await page.setViewportSize({ width: 1080, height: result.height });
      const path = `${output}/${id}-${start / columns + 1}.png`;
      await page.screenshot({ path });
      evidence.push(path);
    }
    await page.setViewportSize({ width: 1080, height: 1000 });
    const playback = await page.evaluate(async ({ id, native }) => {
      const { app, shared, label, draw, ready } = globalThis.animationQuality;
      app.stage.removeChildren().forEach(child => child.destroy({ children: true }));
      app.renderer.resize(1080, 1000);
      const asset = shared.requireAssetDefinition(id);
      label(`${asset.name} · real-time playback · zoom 0.78`, 12, 22);
      const views = [];
      shared.getAssetVariants(asset).forEach((variant, row) => shared.ASSET_ROTATIONS.forEach((rotation, column) => {
        label(`${variant.name} / ${rotation}°`, 32 + column * 270, 70 + row * 300);
        views.push(draw(asset, variant.id, rotation, 135 + column * 270, 105 + row * 300));
      }));
      await ready();
      const observedFrames = views.map(() => new Set());
      const start = performance.now();
      while (performance.now() - start < 3600) {
        const now = performance.now() - start;
        views.forEach((view, index) => {
          view.animate(now);
          if (native) {
            const frame = view.body.children.at(-1).texture.frame;
            observedFrames[index].add(`${frame.x},${frame.y}`);
          }
        });
        app.render();
        await new Promise(requestAnimationFrame);
      }
      return { durationMs: performance.now() - start, uniqueFrames: native ? observedFrames.map(frames => frames.size) : null };
    }, { id, native });
    if (native) assert(playback.uniqueFrames.every(count => count === 16), `${id}: playback skipped an animation frame`);
    report.assets.push({ id, variants: 3, directions: [0, 90, 180, 270], sampleTimes: times, evidence, playback });
    console.log(`Validated playback and captured all designs/directions: ${id}`);
  }
  report.video = await page.video().path();
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await writeFile(`${output}/coverage.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
