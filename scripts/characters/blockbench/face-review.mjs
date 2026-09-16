import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE } from "../../../packages/shared/src/character.ts";

const output = "artifacts/avatar-fix/browser";
const layoutsOnly = process.argv.includes("--layouts-only");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const report = { errors: [], options: [], playback: [], layouts: [], saved: null };
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.route("**/__avatar-face-review", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="review"></div></body></html>' }));
  await page.goto("http://127.0.0.1:5173/__avatar-face-review");
  await page.evaluate(async appearance => {
    const { default: refresh } = await import("/@react-refresh");
    refresh.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import("/src/styles.css");
    const { createElement } = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
    const { AvatarDialog } = await import("/src/components/AvatarDialog.tsx");
    createRoot(document.getElementById("review")).render(createElement(AvatarDialog, {
      currentUser: { character: appearance },
      onClose: () => {},
      onSaveCharacter: async value => { window.savedAppearance = value; },
    }));
  }, { ...DEFAULT_CHARACTER_APPEARANCE, face: "fierce", hairstyle: "spiky", upperBody: "ranger", lowerBody: "ranger", shoes: "ranger" });
  const ready = () => page.getByRole("button", { name: "Use character", exact: true }).waitFor({ state: "visible" }).then(() => page.waitForFunction(() => !document.querySelector(".character-editor-actions .primary-button")?.disabled));
  const optionsReady = () => page.waitForFunction(() => [...document.querySelectorAll(".character-option canvas")].every(canvas => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)));
  await ready();
  assert.equal(await page.getByText("Gender", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /^(Male|Female)$/ }).count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await optionsReady();
  await page.screenshot({ path: `${output}/creator-desktop.png` });
  for (const direction of layoutsOnly ? [] : ["Front", "Left", "Right", "Back"]) {
    await page.getByRole("button", { name: direction, exact: true }).click();
    for (const category of ["Face", "Hair", "Tops", "Bottoms", "Shoes", "Headwear"]) {
      await page.getByRole("tab", { name: category, exact: true }).click();
      await optionsReady();
      const count = await page.locator(".character-option").count();
      report.options.push({ direction, category, count });
      await page.locator(".character-controls").screenshot({ path: `${output}/${category.toLowerCase()}-${direction.toLowerCase()}.png` });
    }
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const motion of layoutsOnly ? [] : ["Idle", "Walk", "Sit", "Listen", "Sit & listen"]) {
    for (const direction of ["Front", "Left", "Right", "Back"]) {
      await page.getByRole("button", { name: motion, exact: true }).click();
      await page.getByRole("button", { name: direction, exact: true }).click();
      await ready();
      const frames = await page.locator(".character-stage canvas").evaluate(async canvas => {
        const samples = new Set();
        const start = performance.now();
        while (performance.now() - start < 850) {
          samples.add(canvas.toDataURL());
          await new Promise(requestAnimationFrame);
        }
        return samples.size;
      });
      assert(frames >= 2, `${motion}/${direction} must animate`);
      report.playback.push({ motion, direction, frames });
    }
  }
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  await page.getByRole("tab", { name: "Face", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const theme of ["dark", "light"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await optionsReady();
      await page.screenshot({ path: `${output}/creator-${theme}-${viewport.width}.png` });
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector(".character-dialog").getBoundingClientRect();
        return { dialog: dialog.toJSON(), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
      });
      const fits = layout.dialog.left >= 0 && layout.dialog.right <= layout.width && layout.dialog.top >= 0 && layout.dialog.bottom <= layout.height && layout.scrollWidth <= layout.width;
      report.layouts.push({ theme, ...viewport, ...layout, fits });
      assert(fits, `Creator must fit ${viewport.width}×${viewport.height}`);
    }
  }
  await page.getByRole("button", { name: "Bright", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Use character", exact: true }).click();
  report.saved = await page.evaluate(() => window.savedAppearance);
  assert.deepEqual(report.saved, { ...DEFAULT_CHARACTER_APPEARANCE, face: "bright", hairstyle: "spiky", upperBody: "ranger", lowerBody: "ranger", shoes: "ranger" });
  assert.deepEqual(report.errors, []);
} finally {
  await writeFile(`${output}/review.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(`Verified ${report.options.reduce((sum, item) => sum + item.count, 0)} option previews, ${report.playback.length} motion/direction combinations, ${report.layouts.length} compact layouts and a gender-free save.`);
