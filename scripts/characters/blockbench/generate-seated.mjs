import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { sharp } from "../raster.mjs";

const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", import.meta.url), "utf8"));
const sources = ["geometry", "face-styles", "head", "hair-styles", "hair", "body", "clothing", "wardrobe", "statement-tops", "statement-bottoms", "runway-tops", "runway-bottoms", "runway-shoes", "statement-shoes", "headwear-styles", "headwear", "style-materials", "customization", "model", "animations", "render"];
const code = (await Promise.all(sources.map(name => readFile(new URL(`${name}.cjs`, import.meta.url), "utf8"))))
  .map(source => source.replace(/^module\.exports = .*;\r?\n?/gm, "")).join("\n");
const designs = manifest.layers.filter(layer => ["lower", "shoes"].includes(layer.layer));
const selected = process.argv.slice(2);
assert(selected.every(name => designs.some(design => `${design.layer}/${design.name}` === name)), "Unknown seated character component");
const settings = { ...manifest.settings, seatedProjection: true,
  atlasClips: Object.fromEntries(Object.entries(manifest.settings.atlasClips).filter(([motion]) => motion.startsWith("sit"))) };
const hash = input => createHash("sha256").update(input).digest("hex");
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const pending = designs.filter(design => !selected.length || selected.includes(`${design.layer}/${design.name}`));
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async (_, worker) => {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.newProject === "function");
    await page.evaluate(`(() => { ${code}
      const api = { THREE, Mesh, MeshFace, Group, Texture, document, newProject, Formats, Canvas, Codecs,
        Animation, Animator, Timeline, get Project() { return Project; } };
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
      window.renderSeatedLayer = async (design, pose, settings) => {
        const model = createCharacter(api, createCharacterGeometry, createCharacterHead, design.appearance);
        const animations = createCharacterAnimations(api, model, pose);
        const rendered = await renderCharacterLayer(api, model, animations, settings, design.layer, renderer);
        Project.saved = true;
        await Project.close();
        return rendered.png;
      };
    })()`);
    for (const design of pending.filter((_, index) => index % 3 === worker)) {
      const source = await readFile(new URL(design.path, root));
      const original = await sharp(source).ensureAlpha().raw().toBuffer();
      for (const pose of ["chair", "floor"]) {
        const png = await page.evaluate(({ design, pose, settings }) => window.renderSeatedLayer(design, pose, settings), { design, pose, settings });
        const seated = await sharp(Buffer.from(png, "base64")).ensureAlpha().raw().toBuffer();
        const pixels = Buffer.from(original);
        const { frameSize, atlasSize, atlasHeight } = settings;
        for (const clip of Object.values(settings.atlasClips)) for (let plane = 0; plane < 2; plane++) {
          for (let row = 0; row < frameSize * settings.directions.length; row++) {
            const start = ((plane * atlasHeight + clip.row * frameSize + row) * atlasSize + clip.column * frameSize) * 4;
            seated.copy(pixels, start, start, start + clip.frames * frameSize * 4);
          }
        }
        const directory = new URL(`apps/client/public/characters/seated/${pose}/${design.layer}/`, root);
        await mkdir(directory, { recursive: true });
        await sharp(pixels, { raw: { width: atlasSize, height: atlasHeight * 2, channels: 4 } }).png()
          .toFile(fileURLToPath(new URL(`${design.name}.png`, directory)));
      }
      assert.equal(hash(await readFile(new URL(design.path, root))), hash(source), `Original changed: ${design.path}`);
      console.log(`Seated poses: ${design.layer}/${design.name}`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }));
} finally {
  await browser.close();
}
