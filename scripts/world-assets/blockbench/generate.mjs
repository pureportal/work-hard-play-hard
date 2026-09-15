import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const architecture = process.argv.includes("--architecture");
const catalog = architecture ? createRequire(import.meta.url)("./architecture.cjs").architectureCatalog
  : JSON.parse(await readFile(new URL("../../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const requested = process.argv.slice(2).filter(argument => argument !== "--architecture");
const output = `scripts/world-assets/blockbench${architecture ? "/architecture" : ""}`;
const manifestPath = new URL(`${architecture ? "architecture/" : ""}renders/manifest.json`, import.meta.url);
const previous = requested.length ? JSON.parse(await readFile(manifestPath, "utf8")) : undefined;
const { worldAssetSourceFiles } = createRequire(import.meta.url)("./source-files.cjs");
const scripts = await Promise.all(worldAssetSourceFiles.map(async (name) => {
  const source = await readFile(new URL(name, import.meta.url), "utf8");
  return source.replace(/^const \{.*\} = require\("\.\/.*"\);\r?\n/gm, "").replace(/^module\.exports = .*;\r?\n?/gm, "");
}));
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", message => { if (message.text().startsWith("Rendered ")) console.log(message.text()); });
  await page.exposeFunction("writeBlockbenchFile", async (relative, data, encoding) => {
    const file = resolve(workspace, relative);
    assert(file.startsWith(resolve(workspace, "scripts/world-assets/blockbench") + sep), "Output must stay in the Blockbench asset directory");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, encoding === "base64" ? Buffer.from(data, "base64") : data);
  });
  await page.goto("https://web.blockbench.net/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.newProject === "function" && typeof window.THREE === "object");
  const result = await page.evaluate(`(async () => {
    ${scripts.join("\n")}
    return renderWorldAssets({ THREE, Cube, Mesh, MeshFace, Group, Texture, document, newProject, Formats,
      get Project() { return Project; }, Canvas, Codecs, Blockbench, Animation, Animator, Timeline, writeFile: window.writeBlockbenchFile }, ${JSON.stringify(catalog)}, ${JSON.stringify(requested)}, ${JSON.stringify(output)});
  })()`);
  assert.deepEqual(errors, []);
  if (previous) {
    const generated = JSON.parse(await readFile(manifestPath, "utf8"));
    generated.results = [...previous.results.filter(entry => !requested.includes(entry.assetId)), ...generated.results];
    await writeFile(manifestPath, JSON.stringify(generated, null, 2) + "\n");
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
