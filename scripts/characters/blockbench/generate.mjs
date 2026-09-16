import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import {
  CHARACTER_ANIMATIONS, CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS,
  CHARACTER_FOOT_ANCHOR, CHARACTER_SEAT_ANCHOR, CHARACTER_FACES, CHARACTER_HAIRSTYLES,
  CHARACTER_OUTFITS, CHARACTER_HEADWEAR, DEFAULT_CHARACTER_APPEARANCE,
} from "../../../packages/shared/src/character.ts";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const source = await Promise.all(["geometry.cjs", "head.cjs", "hair.cjs", "body.cjs", "clothing.cjs", "wardrobe.cjs", "statement-tops.cjs", "statement-bottoms.cjs", "statement-shoes.cjs", "headwear.cjs", "customization.cjs", "model.cjs", "animations.cjs", "render.cjs"].map(async name =>
  (await readFile(new URL(name, import.meta.url), "utf8")).replace(/^module\.exports = .*;\r?\n?/gm, "")));
const settings = {
  frameSize: CHARACTER_CANVAS_SIZE, atlasSize: CHARACTER_ATLAS_SIZE, atlasHeight: CHARACTER_ATLAS_HEIGHT,
  directions: CHARACTER_DIRECTIONS, atlasClips: CHARACTER_ANIMATIONS,
  anchors: { foot: CHARACTER_FOOT_ANCHOR, hip: CHARACTER_SEAT_ANCHOR },
};
const designs = [];
for (const face of CHARACTER_FACES) designs.push({ layer: "head", name: face, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, face } });
for (const outfit of CHARACTER_OUTFITS) {
  designs.push({ layer: "upper", name: outfit, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, upperBody: outfit } });
  designs.push({ layer: "lower", name: outfit, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, lowerBody: outfit } });
  designs.push({ layer: "shoes", name: outfit, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, shoes: outfit } });
}
for (const hairstyle of CHARACTER_HAIRSTYLES) for (const headwear of CHARACTER_HEADWEAR) designs.push({ layer: "hair", name: `${hairstyle}${headwear === "none" ? "" : `-${headwear}`}`, appearance: { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, headwear } });
const selected = process.argv.slice(2);
assert(selected.every(name => designs.some(design => `${design.layer}/${design.name}` === name)), "Choose a component from the character inventory");
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.text().startsWith("Rendered character")) console.log(message.text()); });
  await page.exposeFunction("writeCharacterFile", async (relative, data, encoding) => {
    const path = resolve(workspace, relative);
    assert(["scripts/characters/blockbench", "apps/client/public/characters/blockbench"].some(root => path.startsWith(resolve(workspace, root) + sep)));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, encoding === "base64" ? Buffer.from(data, "base64") : data);
  });
  await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.newProject === "function" && typeof window.THREE === "object");
  const report = await page.evaluate(`(async () => {
    ${source.join("\n")}
    const api = { THREE, Mesh, MeshFace, Group, Texture, document, newProject, Formats, Canvas, Codecs,
      Animation, Animator, Timeline, get Project() { return Project; } };
    const results = [];
    for (const design of ${JSON.stringify(designs.filter(design => !selected.length || selected.includes(design.layer + "/" + design.name)))}) {
      const model = createCharacter(api, createCharacterGeometry, createCharacterHead, design.appearance);
      const animations = createCharacterAnimations(api, model);
      const modelPath = "scripts/characters/blockbench/models/" + design.layer + "-" + design.name + ".bbmodel";
      const compiled = Codecs.project.compile();
      await window.writeCharacterFile(modelPath, typeof compiled === "string" ? compiled : JSON.stringify(compiled));
      const rendered = await renderCharacterLayer(api, model, animations, ${JSON.stringify(settings)}, design.layer);
      const path = "apps/client/public/characters/blockbench/" + design.layer + "/" + design.name + ".png";
      await window.writeCharacterFile(path, rendered.png, "base64");
      results.push({ ...design, path, model: modelPath, frames: rendered.frames });
      Project.saved = true;
      await Project.close();
      console.log("Rendered character " + design.layer + "/" + design.name);
    }
    return { blockbenchVersion: Blockbench.version, settings: ${JSON.stringify(settings)}, layers: results };
  })()`);
  assert.deepEqual(errors, []);
  const manifestPath = resolve(workspace, "scripts/characters/blockbench/manifest.json");
  if (selected.length) {
    const previous = JSON.parse(await readFile(manifestPath, "utf8"));
    report.layers = designs.map(design => {
      const matches = layer => layer.layer === design.layer && layer.name === design.name;
      const layer = report.layers.find(matches) ?? previous.layers.find(matches);
      assert(layer, "Generate the complete character inventory before individual components");
      return { ...layer, appearance: design.appearance };
    });
  }
  await writeFile(manifestPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ layers: report.layers.length, frames: report.layers.reduce((sum, layer) => sum + layer.frames, 0) }));
} finally {
  await browser.close();
}
