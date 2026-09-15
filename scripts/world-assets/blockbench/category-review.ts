import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application, Sprite } from "../../../apps/client/node_modules/pixi.js";
import { ASSET_CATALOG, ASSET_ROTATIONS, getAssetVariants, type WorldObject } from "../../../packages/shared/src/index.js";
import { installAssetFixture } from "../playwright-fixture.js";
import { installWorldProbe } from "../../characters/playwright-animation.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = `${root}/${process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/category-expansion-2026-09-15/gameplay"}`;
const requested = process.argv.find(value => value.startsWith("--assets="))?.slice(9).split(",");
const assets = ASSET_CATALOG.assets.filter(asset => !requested || requested.includes(asset.id));
assert(!requested || assets.length === requested.length);
const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp") as typeof import("../../../apps/server/node_modules/sharp");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const fixture = await installAssetFixture(context, "user-maya", { x: 800, y: 704 }, { currentPlayerOnly: true });
const layout = fixture.store.getLayout("floor-studio")!;
Object.assign(layout, { objects: [], tiles: [], walls: [], openings: [], rooms: [], revision: layout.revision + 1 });
const page = await context.newPage();
await installWorldProbe(page);
const errors: string[] = [];
const coverage: { assetId: string; variantId: string; rotations: number[]; repeated: boolean; evidence: string }[] = [];
try {
  const previous = JSON.parse(await readFile(`${output}/coverage.json`, "utf8"));
  coverage.push(...previous.coverage.filter((item: { assetId: string }) => !assets.some(asset => asset.id === item.assetId)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (/\/world-assets\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  await page.waitForTimeout(800);
  for (const asset of assets) {
    const layers: { input: Buffer; left: number; top: number }[] = [];
    const designs = getAssetVariants(asset);
    const labels = [`<text x="12" y="20">${asset.name} · ${asset.id} · 0.78 gameplay zoom</text>`];
    for (const [row, variant] of designs.entries()) {
      const repeated = asset.kind === "floor-tile";
      layout.objects = ASSET_ROTATIONS.flatMap((rotation, direction) => {
        const placed: WorldObject = { id: `review-${direction}`, assetId: asset.id, variantId: variant.id, rotation, x: 320 + direction * 256, y: 576, floorId: layout.floorId };
        if (repeated) return Array.from({ length: 9 }, (_, index) => ({ ...placed, id: `${placed.id}-${index}`, x: placed.x + index % 3 * 64, y: placed.y + Math.floor(index / 3) * 64 }));
        if (asset.placement.layer !== "surface") return [placed];
        return [{ ...placed, id: `support-${direction}`, assetId: "table-workbench", variantId: "oak", rotation: 0, x: placed.x - 32 }, placed];
      });
      layout.revision++;
      fixture.publish({ type: "layout.updated", layout });
      await page.waitForFunction(async expected => {
        const artwork = (await import("/src/world-asset-artwork.json?import" as string)).default;
        const app = globalThis.avatarWorld as unknown as Application;
        return expected.every(object => {
          const sprite = app?.stage.getChildByLabel(`world-asset:${object.id}`, true)?.getChildByLabel("artwork")?.children.at(-1) as Sprite | undefined;
          const variant = artwork[object.assetId].variants[object.variantId];
          return sprite?.visible && sprite.label === variant.path && variant.frames.some((frame: { x: number; y: number }, index: number) => index % 4 === object.rotation / 90 && sprite.texture.frame.x === frame.x && sprite.texture.frame.y === frame.y);
        });
      }, layout.objects);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const clip = await page.evaluate(() => {
        const app = globalThis.avatarWorld as unknown as Application;
        app.render();
        const canvas = app.canvas.getBoundingClientRect();
        const scale = canvas.width / app.screen.width;
        const start = app.stage.children[0]!.toGlobal({ x: 272, y: 464 });
        const end = app.stage.children[0]!.toGlobal({ x: 1296, y: 784 });
        return { x: Math.floor(canvas.x + start.x * scale), y: Math.floor(canvas.y + start.y * scale), width: Math.ceil((end.x - start.x) * scale), height: Math.ceil((end.y - start.y) * scale) };
      });
      assert(clip.width >= 798 && clip.width <= 801, `Gameplay zoom changed: ${clip.width}`);
      await page.waitForTimeout(120);
      const image = await page.screenshot({ path: `${output}/${asset.id}-${variant.id}.png`, clip });
      layers.push({ input: image, left: 8, top: 50 + row * 278 });
      for (const [column, rotation] of ASSET_ROTATIONS.entries()) labels.push(`<text x="${24 + column * 200}" y="${42 + row * 278}">${variant.name} · ${rotation}°</text>`);
      coverage.push({ assetId: asset.id, variantId: variant.id, rotations: [...ASSET_ROTATIONS], repeated, evidence: `${asset.id}-${variant.id}.png` });
      if (row === 0) await page.screenshot({ path: `${output}/${asset.id}-scene.png` });
    }
    const height = 52 + designs.length * 278;
    layers.push({ input: Buffer.from(`<svg width="816" height="${height}" xmlns="http://www.w3.org/2000/svg"><g font-family="Arial" font-size="12" fill="#514552">${labels.join("")}</g></svg>`), left: 0, top: 0 });
    await sharp({ create: { width: 816, height, channels: 4, background: "#eee8df" } }).composite(layers).png().toFile(`${output}/${asset.id}.png`);
    console.log(`Captured render coverage: ${asset.id}, ${designs.length} designs × four orientations`);
    await writeFile(`${output}/coverage.json`, JSON.stringify({ scale: 0.78, coverage, errors }, null, 2) + "\n");
  }
  assert.deepEqual(errors, []);
  const captured = ASSET_CATALOG.assets.filter(asset => coverage.some(item => item.assetId === asset.id));
  await writeFile(`${output}/index.html`, `<!doctype html><meta charset="utf-8"><title>Game asset review</title><style>body{background:#eee8df;font:16px sans-serif}img{display:block;max-width:100%;margin:24px 0}</style>${captured.map(asset => `<a href="${asset.id}-scene.png"><img src="${asset.id}.png" alt="${asset.name}"></a>`).join("")}`);
} finally {
  await writeFile(`${output}/coverage.json`, JSON.stringify({ scale: 0.78, coverage, errors }, null, 2) + "\n");
  fixture.stop();
  await browser.close();
}
