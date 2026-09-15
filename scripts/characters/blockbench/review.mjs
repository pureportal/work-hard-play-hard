import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { CHARACTER_GENDERS, CHARACTER_FACES, CHARACTER_OUTFITS, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/blockbench-migration";
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(new URL("manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.layers.length, CHARACTER_GENDERS.length * (CHARACTER_FACES.length + CHARACTER_OUTFITS.length * 3) + CHARACTER_HAIRSTYLES.length * CHARACTER_HEADWEAR.length);
const models = [];
for (const layer of manifest.layers) {
  const model = JSON.parse(await readFile(layer.model, "utf8"));
  assert.equal(model.animations.length, 5);
  assert(model.animations.every(animation => animation.loop === "loop" && Object.keys(animation.animators).length > 0));
  assert(model.elements.length > 0 && model.textures.length > 0);
  for (const element of model.elements) for (const face of Object.values(element.faces)) assert(Number.isInteger(face.texture) && model.textures[face.texture], `${layer.name}/${element.name}: missing material`);
  if (["upper/female-street-flat", "upper/male-kimono-flat", "hair/ponytail-witch", "hair/twintails-catears", "hair/braid-cap", "hair/pixie-beret", "hair/curtains", "hair/hime-witch", "hair/tousled-cap", "hair/buns-ribbon", "hair/swept-catears", "upper/female-traveler-flat", "upper/male-festival-flat", "hair/curls-goggles", "hair/longbraid-blossom"].includes(`${layer.layer}/${layer.name}`)) models.push({ name: layer.name, model });
}
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.newProject === "function");
  const reopened = await page.evaluate(async models => {
    const results = [];
    for (const { name, model } of models) {
      Codecs.project.load(model, { path: `${name}.bbmodel` });
      Modes.options.animate.select();
      const clips = Animation.all.map(animation => {
        const poses = [0, animation.length / 4, animation.length].map(time => {
          Animation.all.forEach(clip => { clip.playing = false; });
          animation.select();
          animation.playing = true;
          Timeline.time = time;
          Animator.preview();
          Canvas.scene.updateMatrixWorld(true);
          return JSON.stringify(Mesh.all.map(mesh => mesh.mesh.matrixWorld.elements.map(value => Math.round(value * 100000))));
        });
        return { name: animation.name, animated: poses[0] !== poses[1], closed: poses[0] === poses[2] };
      });
      results.push({ name, meshes: Mesh.all.length, textures: Texture.all.length, clips });
      Project.saved = true;
      await Project.close();
    }
    return results;
  }, models);
  assert(reopened.every(model => model.clips.length === 5 && model.clips.every(clip => clip.animated && clip.closed)));
  const samples = [
    { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "curls", upperBody: "traveler", lowerBody: "traveler", shoes: "traveler", headwear: "goggles" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", hairstyle: "longbraid", upperBody: "festival", lowerBody: "festival", shoes: "festival", headwear: "blossom" },
    { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "longbraid", upperBody: "traveler", lowerBody: "kimono", shoes: "festival", headwear: "witch" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", hairstyle: "twintails", upperBody: "festival", lowerBody: "traveler", shoes: "ranger", headwear: "goggles" },
    { ...DEFAULT_CHARACTER_APPEARANCE },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", face: "fierce", hairstyle: "spiky", upperBody: "ranger", lowerBody: "ranger", shoes: "ranger" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "dreamy", hairstyle: "ponytail", upperBody: "arcane", lowerBody: "arcane", shoes: "arcane", headwear: "witch" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", face: "bright", hairstyle: "wavy", upperBody: "cardigan", lowerBody: "street", shoes: "cardigan", headwear: "beret" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "shy", hairstyle: "twintails", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "catears" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "smile", hairstyle: "braid", upperBody: "sailor", lowerBody: "kimono", shoes: "sailor", headwear: "ribbon" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", face: "bright", hairstyle: "pixie", upperBody: "cardigan", lowerBody: "ranger", shoes: "street", headwear: "beret" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", face: "calm", hairstyle: "curtains", upperBody: "ranger", lowerBody: "sailor", shoes: "ranger" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "dreamy", hairstyle: "hime", upperBody: "arcane", lowerBody: "kimono", shoes: "arcane", headwear: "witch" },
    { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", face: "fierce", hairstyle: "tousled", upperBody: "street", lowerBody: "cardigan", shoes: "kimono", headwear: "cap" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "shy", hairstyle: "buns", upperBody: "kimono", lowerBody: "sailor", shoes: "ranger", headwear: "ribbon" },
    { ...DEFAULT_CHARACTER_APPEARANCE, face: "smile", hairstyle: "swept", upperBody: "sailor", lowerBody: "street", shoes: "cardigan", headwear: "catears" },
  ];
  await page.route("**/__character-review", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="margin:0"><canvas id="review" width="960" height="760"></canvas></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__character-review");
  await page.setViewportSize({ width: 960, height: 760 });
  for (const [index, appearance] of samples.entries()) {
    await page.evaluate(async appearance => {
      const { renderCharacter } = await import("/src/character-renderer.ts");
      const { CHARACTER_DIRECTIONS, CHARACTER_ANIMATIONS, getCharacterFrame } = await import("/@fs/C:/Development/work-hard-play-hard/packages/shared/src/character.ts");
      const atlas = await renderCharacter(appearance);
      const canvas = document.getElementById("review");
      const context = canvas.getContext("2d");
      context.fillStyle = "#eae5df";
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const [row, motion] of Object.keys(CHARACTER_ANIMATIONS).entries()) {
        for (const [column, direction] of CHARACTER_DIRECTIONS.entries()) {
          const frame = getCharacterFrame(motion, direction, CHARACTER_ANIMATIONS[motion].frameDuration);
          const x = column * 240, y = row * 152;
          context.fillStyle = "#635565";
          context.font = "12px sans-serif";
          context.fillText(`${motion} · ${direction}`, x + 14, y + 20);
          context.imageSmoothingEnabled = true;
          context.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x + 12, y + 50, 80, 80);
          context.imageSmoothingEnabled = false;
          context.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, x + 106, y + 28, 120, 120);
        }
      }
    }, appearance);
    await page.screenshot({ path: `${output}/character-style-${index + 1}.png` });
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/character-model-review.json`, JSON.stringify({ models: manifest.layers.length, layers: manifest.layers.length, frames: manifest.layers.reduce((sum, layer) => sum + layer.frames, 0), reopened, samples, errors }, null, 2));
  console.log(`Verified ${manifest.layers.length} editable models; reopened ${reopened.length} models with five closed animation loops; captured ${samples.length * 20} composed views at 80px and 120px.`);
} finally { await browser.close(); }
