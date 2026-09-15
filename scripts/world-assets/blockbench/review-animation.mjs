import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const output = process.argv.find(argument => argument.startsWith("--output="))?.slice(9) ?? "artifacts/asset-expansion/maps";
const manifest = JSON.parse(await readFile(new URL("renders/manifest.json", import.meta.url), "utf8"));
const models = [];
for (const asset of manifest.results) for (const [variant, design] of Object.entries(asset.variants)) {
  if (design.animation) models.push({ id: `${asset.assetId}/${variant}`, model: JSON.parse(await readFile(design.model, "utf8")), animation: design.animation });
}
assert(models.length > 0);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.newProject === "function");
  const reopened = await page.evaluate(async models => {
    const results = [];
    for (const { id, model, animation } of models) {
      Codecs.project.load(model, { path: `${id}.bbmodel` });
      Modes.options.animate.select();
      const clip = Animation.all[0];
      clip.select();
      clip.playing = true;
      const poses = [0, clip.length / 4, clip.length].map(time => {
        Timeline.time = time;
        Animator.preview();
        Canvas.scene.updateMatrixWorld(true);
        return JSON.stringify([...Cube.all, ...Mesh.all].map(element => element.mesh.matrixWorld.elements.map(value => Math.round(value * 100000))));
      });
      results.push({ id, clip: clip.name, duration: clip.length, frames: animation.frames, animated: poses[0] !== poses[1], closed: poses[0] === poses[2] });
      Project.saved = true;
      await Project.close();
    }
    return results;
  }, models);
  assert(reopened.every(model => model.animated && model.closed));
  assert.deepEqual(errors, []);
  await writeFile(`${output}/native-animation-review.json`, JSON.stringify({ reopened, errors }, null, 2));
  console.log(`Reopened ${reopened.length} animated map models; all native loops move and close.`);
} finally {
  await browser.close();
}
