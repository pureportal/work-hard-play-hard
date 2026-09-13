import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { chromium } from "playwright-core";

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, "../..");
const output = resolve(workspace, "artifacts/world-assets/gallery-build");
assert(output.startsWith(resolve(workspace, "artifacts/world-assets") + sep));
const clientRequire = createRequire(resolve(workspace, "apps/client/package.json"));
const sharp = createRequire(resolve(workspace, "apps/server/package.json"))("sharp");
const { build } = await import(pathToFileURL(clientRequire.resolve("vite")).href);
const aliases = ["pixi.js", "react", "react-dom", "react-dom/client", "react/jsx-runtime"].map((name) => ({ find: new RegExp(`^${name.replaceAll(".", "\\.")}$`), replacement: clientRequire.resolve(name) }));
await build({ configFile: false, root: directory, publicDir: false, esbuild: { jsx: "automatic" }, resolve: { alias: aliases }, build: { target: "esnext", outDir: output, emptyOutDir: true, rollupOptions: { input: resolve(directory, "gallery.html") } }, logLevel: "warn" });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 960 }, deviceScaleFactor: 1 });
  const issues = [];
  page.on("pageerror", (error) => issues.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "data:") return route.continue();
    const root = /^\/(world-assets|characters)\//.test(url.pathname) ? resolve(workspace, "apps/client/public") : output;
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(root + sep)) return route.abort();
    try {
      const body = await readFile(path);
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
      await route.fulfill({ status: 200, contentType: types[extname(path)] ?? "application/octet-stream", body });
    } catch (error) {
      issues.push(`${path}: ${error.message}`);
      await route.fulfill({ status: 404 });
    }
  });
  const catalog = JSON.parse(await readFile(resolve(workspace, "packages/shared/src/asset-catalog.json"), "utf8"));
  const ids = process.argv.slice(2);
  const selected = ids.length ? ids : catalog.assets.map((asset) => asset.id);
  const screenshots = resolve(workspace, "artifacts/world-assets/displayed");
  await mkdir(screenshots, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (let index = 0; index < selected.length; index += 4) {
      const group = selected.slice(index, index + 4);
      await page.goto(`http://artwork.test/gallery.html?ids=${group.join(",")}&theme=${theme}`, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector('body[data-ready="true"]', { timeout: 30_000 });
      } catch (error) {
        throw new Error(`${error.message}: ${JSON.stringify({ issues: [...new Set(issues)], failures: await page.evaluate(() => window.galleryFailures) })}`);
      }
      assert.deepEqual(await page.evaluate(() => window.galleryFailures), []);
      const dimensions = await page.evaluate(() => window.galleryDimensions);
      await page.setViewportSize({ width: Math.ceil(dimensions.width), height: Math.ceil(dimensions.height) });
      const screenshot = await page.screenshot({ path: resolve(screenshots, `${theme}-${group.join("__")}.png`), fullPage: true });
      const statistics = await sharp(screenshot).stats();
      assert(statistics.channels.some((channel) => channel.stdev > 2), `Blank artwork screenshot: ${group.join(",")}`);
    }
  }
  assert.deepEqual(issues, []);
  console.log(`Rendered ${selected.length} assets, every material and direction alongside 52px avatars, and all 38px previews in light and dark themes.`);
} finally {
  await browser.close();
}
