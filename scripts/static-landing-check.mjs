import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(workspace, process.env.LANDING_BUILD_DIR ?? "apps/landing/dist");
const output = resolve(workspace, "artifacts/landing");
const origin = "http://landing.localhost";
const expectedClient = new URL(process.env.VITE_CLIENT_URL?.trim() || "/app/", origin).href;
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors = [];
const layouts = [];
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp" };
await mkdir(output, { recursive: true });

async function install(context) {
  await context.route(`${origin}/**`, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const path = resolve(distribution, pathname === "/" ? "index.html" : `.${pathname}`);
    assert(path.startsWith(distribution + sep), "Path outside landing build");
    await route.fulfill({ path, contentType: types[extname(path)] ?? "application/octet-stream" });
  });
}

async function checkLayout(page) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("a[href], button")].filter(element => element.checkVisibility());
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      unnamed: controls.filter(element => !(element.ariaLabel || element.textContent || element.querySelector("img")?.alt)?.trim()).map(element => element.outerHTML),
      small: controls.filter(element => element.getBoundingClientRect().height < 44).map(element => element.className),
      clipped: [...document.querySelectorAll(".office-preview, .feature, .screenshot-dialog[open]")].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width && (box.left < -1 || box.right > innerWidth + 1);
      }).map(element => element.className),
      images: [...document.querySelectorAll("main img")].map(image => ({ src: image.currentSrc, loaded: image.complete && image.naturalWidth > 0, alt: image.alt })),
    };
  });
  assert.equal(result.overflow, false, "Horizontal page overflow");
  assert.deepEqual(result.unnamed, [], "Unnamed controls");
  assert.deepEqual(result.small, [], "Controls smaller than 44px");
  assert.deepEqual(result.clipped, [], "Clipped surface");
  assert(result.images.every(image => image.loaded && image.alt), "Image missing or lacking alt text");
  return result;
}

try {
  for (const colorScheme of ["light", "dark"]) {
    for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768], [800, 1024], [390, 844], [320, 568], [844, 390]]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme, hasTouch: width < 1000 });
      await install(context);
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(origin, { waitUntil: "networkidle" });
      assert.equal(await page.title(), "Northstar");
      assert.equal(await page.locator("h1").innerText(), "A shared place for remote work.");
      assert.equal(await page.locator(".feature").count(), 4);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), colorScheme);
      for (const image of await page.locator("main img").all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(image => image.decode());
      }
      await page.evaluate(() => scrollTo(0, 0));
      const result = await checkLayout(page);
      await page.screenshot({ path: resolve(output, `${colorScheme}-${width}x${height}.png`), fullPage: true });
      for (const link of await page.locator("[data-client-link]").all()) assert.equal(await link.evaluate(link => link.href), expectedClient);
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".skip-link").evaluate(link => link === document.activeElement), true);
      assert.equal(await page.locator(".skip-link").evaluate(link => getComputedStyle(link).outlineStyle), "solid");
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).hash, "#main");
      await page.getByRole("link", { name: "Explore features" }).click();
      assert.equal(new URL(page.url()).hash, "#features");
      assert(await page.locator("#features").evaluate(element => Math.abs(element.getBoundingClientRect().top) < 60));

      for (const link of await page.locator("[data-screenshot]").all()) {
        await link.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await dialog.locator("img").evaluate(image => image.decode());
        assert.equal(await dialog.getAttribute("aria-labelledby"), "screenshot-title");
        assert.equal(await page.locator(".close-action").evaluate(button => button === document.activeElement), true);
        await page.keyboard.press("Tab");
        assert(await dialog.evaluate(element => element.contains(document.activeElement)), "Focus escaped modal");
        await checkLayout(page);
        await page.keyboard.press("Escape");
        assert.equal(await dialog.isVisible(), false);
        assert(await link.evaluate(link => link === document.activeElement), "Focus did not return to image link");
      }
      const hero = page.getByRole("link", { name: "Enlarge office screenshot" });
      await hero.click();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(await page.getByRole("dialog").isVisible(), false);
      await hero.click();
      await page.mouse.click(1, 1);
      assert.equal(await page.getByRole("dialog").isVisible(), false);
      await page.evaluate(() => scrollTo(0, 0));
      layouts.push({ colorScheme, width, height, ...result });
      if (width === 390) {
        await context.route(expectedClient, route => route.fulfill({ contentType: "text/html", body: "<title>Office navigation fixture</title>" }));
        await page.locator(".primary-action").click();
        await page.waitForURL(expectedClient);
        assert.equal(await page.title(), "Office navigation fixture");
      }
      await context.close();
    }
  }
  assert.deepEqual(errors, []);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await install(context);
  const page = await context.newPage();
  await page.goto(origin);
  assert.equal(await page.locator(".primary-action").evaluate(element => getComputedStyle(element).transitionDuration), "0s");
  await page.locator(".office-preview img").evaluate(image => image.decode());
  assert.match(await page.locator(".office-preview img").evaluate(image => image.currentSrc), /office-1280/);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "dark");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light");
  const imageLink = page.getByRole("link", { name: "Enlarge office screenshot" });
  const fullImage = await imageLink.evaluate(link => link.href);
  await context.route(fullImage, route => route.fulfill({ status: 503, body: "Image unavailable" }), { times: 1 });
  await imageLink.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".screenshot-full").isVisible(), false);
  assert.equal(await page.getByRole("link", { name: "Open image" }).getAttribute("href"), fullImage);
  await page.keyboard.press("Escape");
  await imageLink.click();
  await page.locator(".screenshot-full").evaluate(image => image.decode());
  assert.equal(await page.getByRole("alert").isVisible(), false);
  await context.close();

  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await install(noScript);
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(origin);
  await noScriptPage.getByRole("link", { name: "Enlarge office screenshot" }).click();
  assert.match(noScriptPage.url(), /office-full.*\.webp$/);
  await noScript.close();
  await writeFile(resolve(output, "browser-results.json"), JSON.stringify({
    verification: "Playwright against the actual production HTML, CSS, JavaScript and images via intercepted static-file responses; not the stopped landing HTTP service",
    layouts, errors, interactions: ["skip link", "feature anchor", "office destination navigation fixture", "all five image dialogs", "keyboard focus and Escape", "close and backdrop", "image failure and recovery", "system and explicit themes", "reduced motion", "retina source selection", "image links without JavaScript"],
  }, null, 2));
  console.log(`Landing production-build fixture: ${layouts.length} layouts passed; image loading, themes, keyboard, dialogs and links verified. No landing server started.`);
} finally {
  await browser.close();
}
