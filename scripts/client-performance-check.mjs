import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const distribution = process.argv[3] ? pathToFileURL(`${resolve(process.argv[3])}/`) : new URL("../apps/client/dist/", import.meta.url);
const html = await readFile(new URL("index.html", distribution), "utf8");
const entry = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
assert(entry, "Build the client before measuring it");
const initial = new Map();
async function inspectModule(path) {
  if (initial.has(path)) return;
  const source = await readFile(new URL(path.slice(1), distribution), "utf8");
  initial.set(path, { bytes: Buffer.byteLength(source), gzip: gzipSync(source).length });
  for (const match of source.matchAll(/(?:import|export)\s*(?:[^;"']*?from\s*)?["'](\.\/[^"']+\.js)["']/g)) {
    await inspectModule(`/assets/${match[1].slice(2)}`);
  }
}
await inspectModule(entry);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage();
  const origin = process.env.CLIENT_URL ?? "http://127.0.0.1:5173";
  await page.route(`${origin}/performance-check`, route => route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }));
  await page.goto(`${origin}/performance-check`);
  const textures = await page.evaluate(async (sharedUrl) => {
    const { CharacterSprite } = await import("/src/character-sprite.ts");
    const { CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT } = await import(sharedUrl);
    const atlas = document.createElement("canvas");
    atlas.width = CHARACTER_ATLAS_SIZE;
    atlas.height = CHARACTER_ATLAS_HEIGHT;
    const players = Array.from({ length: 12 }, () => new CharacterSprite(atlas));
    const sources = new Set(players.map(player => player.sprite.texture.source));
    const result = { players: players.length, sources: sources.size, rgbaBytes: sources.size * atlas.width * atlas.height * 4 };
    for (const player of players) player.sprite.destroy();
    return result;
  }, `/@fs/${fileURLToPath(new URL("../packages/shared/src/index.ts", import.meta.url)).replaceAll("\\", "/")}`);
  const report = {
    entry: initial.get(entry),
    initialJavaScript: [...initial.values()].reduce((total, file) => ({ bytes: total.bytes + file.bytes, gzip: total.gzip + file.gzip }), { bytes: 0, gzip: 0 }),
    initialChunks: [...initial.keys()],
    identicalAvatarTextures: textures,
  };
  const output = resolve(process.argv[2] ?? "artifacts/refinement/performance.json");
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally {
  await browser.close();
}
