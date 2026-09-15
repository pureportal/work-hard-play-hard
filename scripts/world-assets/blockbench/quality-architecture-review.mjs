import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/asset-quality-2026-09-15/before/architecture";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 780 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__architecture-quality", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__architecture-quality");
  await page.evaluate(async () => {
    const source = await (await fetch("/src/world-architecture.ts")).text();
    const { Application, Container, Text } = await import(source.match(/from\s+"([^"\n]*pixi[^"\n]*)"/)[1]);
    const { createWorldArchitecture, getArchitectureArtwork } = await import("/src/world-architecture.ts");
    const { WorldAssetTextures } = await import("/src/world-asset-textures.ts");
    const app = new Application();
    await app.init({ width: 1080, height: 780, background: "#eae5df", antialias: true, resolution: 1, autoStart: false });
    document.body.append(app.canvas);
    const textures = new WorldAssetTextures();
    const label = (text, x, y) => {
      const node = new Text({ text, style: { fontFamily: "Arial", fontSize: 12, fill: "#514552" } });
      node.position.set(x, y);
      app.stage.addChild(node);
    };
    label("Architecture · normal gameplay zoom 0.78 · Plaster", 12, 12);
    [0, 90, 180, 270].forEach((rotation, column) => {
      label(`${rotation}°`, 230 + column * 210, 42);
      ["wall", "door", "window"].forEach((kind, row) => {
        if (!column) label(kind, 12, 90 + row * 110);
        const holder = new Container();
        holder.position.set(220 + column * 210, 78 + row * 110);
        holder.scale.set(0.78);
        holder.addChild(textures.createSprite(getArchitectureArtwork(kind, rotation), error => { throw error; }));
        app.stage.addChild(holder);
      });
    });
    const layout = { floorId: "review", revision: 1, objects: [], rooms: [], tiles: [], walls: [
      { id: "north", start: { x: 0, y: 0 }, end: { x: 448, y: 0 } },
      { id: "east", start: { x: 448, y: 0 }, end: { x: 448, y: 320 } },
      { id: "south", start: { x: 0, y: 320 }, end: { x: 448, y: 320 } },
      { id: "west", start: { x: 0, y: 0 }, end: { x: 0, y: 320 } },
    ], openings: [
      { id: "door", wallId: "south", type: "door", offset: 128, width: 64 },
      { id: "window", wallId: "north", type: "window", offset: 224, width: 96 },
      { id: "window-side", wallId: "east", type: "window", offset: 128, width: 96 },
    ] };
    ["light", "dark"].forEach((theme, index) => {
      label(`Connected walls, door and windows · ${theme}`, 30 + index * 540, 430);
      const holder = new Container();
      holder.position.set(70 + index * 540, 475);
      holder.scale.set(0.78);
      holder.addChild(createWorldArchitecture(textures, layout, theme, error => { throw error; }));
      app.stage.addChild(holder);
    });
    globalThis.architectureQuality = app;
  });
  await page.waitForFunction(() => {
    const nodes = [globalThis.architectureQuality.stage];
    for (const node of nodes) nodes.push(...node.children ?? []);
    return nodes.filter(node => node.label?.startsWith("/world-architecture/")).every(node => node.visible);
  });
  await page.evaluate(() => globalThis.architectureQuality.render());
  await page.screenshot({ path: `${output}/architecture-directions-and-joins.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${output}/artwork-coverage.json`, JSON.stringify({ kinds: ["wall", "door", "window"], variants: ["plaster"], rotations: [0, 90, 180, 270], connectedLayouts: ["light", "dark"], scale: 0.78, errors }, null, 2) + "\n");
} finally {
  await browser.close();
}
