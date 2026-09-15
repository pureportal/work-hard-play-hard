import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp");
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/__office-preview", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("http://127.0.0.1:5173/__office-preview");
  const png = await page.evaluate(async () => {
    const { getWorldAssetArtwork, getWorldAssetSurfaceHeight } = await import("/src/world-asset-artwork.ts");
    const { getArchitectureArtwork } = await import("/src/world-architecture.ts");
    const { renderCharacter } = await import("/src/character-renderer.ts");
    const { requireAssetDefinition, DEFAULT_CHARACTER_APPEARANCE, getCharacterFrame } = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/index.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 1520;
    canvas.height = 1240;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    const images = new Map();
    async function image(path) {
      if (!images.has(path)) {
        const source = new Image();
        source.src = path;
        await source.decode();
        images.set(path, source);
      }
      return images.get(path);
    }
    async function asset(id, variant, x, y, rotation = 0, elevation = 0) {
      const view = getWorldAssetArtwork(requireAssetDefinition(id), variant, rotation);
      const { frame, bounds } = view;
      ctx.drawImage(await image(view.path), frame.x, frame.y, frame.width, frame.height, x + bounds.x, y + bounds.y - elevation / Math.SQRT2, bounds.width, bounds.height);
    }
    async function wall(x, y, length, vertical = false) {
      const view = getArchitectureArtwork("wall", vertical ? 90 : 0);
      const { frame } = view;
      for (let offset = 0; offset < length; offset += 32) {
        const size = Math.min(32, length - offset);
        ctx.drawImage(await image(view.path), frame.x, frame.y, vertical ? frame.width : size * 6, vertical ? size * 6 : frame.height,
          x + (vertical ? 0 : offset), y + (vertical ? offset : 0), vertical ? 10 : size, vertical ? size : 10);
      }
    }
    async function character(appearance, x, y, direction = "down", motion = "idle") {
      const atlas = await renderCharacter({ ...DEFAULT_CHARACTER_APPEARANCE, ...appearance });
      const frame = getCharacterFrame(motion, direction, 0);
      ctx.fillStyle = "#51455224";
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x - 40, y - 76, 80, 80);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.fillStyle = "#faf5ed";
    ctx.shadowColor = "#14101f66";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.roundRect(76, 58, 608, 508, 30);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(98, 80, 564, 464, 10);
    ctx.clip();
    ctx.fillStyle = "#e6dfd4";
    ctx.fillRect(98, 80, 564, 464);
    for (let y = 82; y < 320; y += 64) for (let x = 100; x < 356; x += 64) await asset("floor-wood", "oak", x, y);
    ctx.fillStyle = "#f0e3e4";
    ctx.fillRect(366, 82, 296, 238);
    ctx.fillStyle = "#e2dfee";
    ctx.fillRect(100, 330, 256, 212);
    ctx.fillStyle = "#dbe7d9";
    ctx.fillRect(366, 330, 296, 212);
    ctx.restore();
    await wall(100, 82, 560);
    await wall(100, 532, 560);
    await wall(98, 82, 450, true);
    await wall(652, 82, 450, true);
    await wall(356, 92, 164, true);
    await wall(356, 330, 202, true);
    await wall(108, 320, 164);
    await wall(366, 320, 146);
    await wall(588, 320, 64);
    const window = getArchitectureArtwork("window", 0);
    for (const x of [144, 448]) ctx.drawImage(await image(window.path), window.frame.x, window.frame.y, window.frame.width, window.frame.height, x, 81, 96, 12);
    await asset("plant-sakura", "sakura", 300, 118);
    await asset("desk-executive", "oak", 128, 144);
    await asset("decor-monitor", "ivory", 158, 156, 0, 35.375);
    await asset("decor-books", "coral", 215, 164, 0, 35.375);
    await asset("chair-office", "blue", 176, 224);
    await character({}, 276, 267, "left");
    await asset("decor-shoji-screen", "sakura", 394, 124);
    await asset("plant-sakura", "matcha", 606, 126);
    await asset("sofa-loveseat", "blue", 398, 192);
    await asset("breakroom-tea-cart", "sakura", 544, 195);
    await asset("table-coffee", "white", 400, 266);
    await asset("decor-coffee", "ivory", 424, 273, 0, getWorldAssetSurfaceHeight("table-coffee"));
    await character({ hairstyle: "twintails", face: "shy", upperBody: "kimono", lowerBody: "kimono", headwear: "ribbon" }, 556, 293);
    await asset("equipment-arcade", "white", 124, 396);
    await asset("equipment-chess", "graphite", 236, 403);
    await character({ gender: "male", hairstyle: "spiky", face: "bright", upperBody: "sailor", shoes: "sailor" }, 209, 503, "left");
    await asset("outdoor-bench", "white", 386, 372);
    await asset("plant-sakura", "sakura", 599, 369);
    await asset("outdoor-koi-pond", "coastal", 411, 431);
    await character({ hairstyle: "braid", upperBody: "cardigan", lowerBody: "cardigan", shoes: "cardigan", headwear: "beret" }, 589, 499, "left", "listen");
    return canvas.toDataURL("image/png").split(",")[1];
  });
  assert.deepEqual(errors, []);
  await sharp(Buffer.from(png, "base64")).webp({ lossless: true }).toFile("apps/client/src/assets/blockbench-office.webp");
  console.log("Rendered the office preview from production Blockbench atlases.");
} finally {
  await browser.close();
}
