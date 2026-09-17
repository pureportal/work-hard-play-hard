import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(workspace, process.env.LANDING_BUILD_DIR ?? "apps/landing/dist");
const live = process.env.LANDING_URL;
const origin = live ?? "http://landing.localhost";
const output = resolve(workspace, "artifacts/landing-redesign", live ? "live" : "production");
const expectedClient = new URL(process.env.VITE_CLIENT_URL?.trim() || "/app/", origin).href;
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath({ headless: "shell" }) });
const errors = [];
const layouts = [];
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2" };
await mkdir(output, { recursive: true });

async function install(context) {
  if (live) return;
  await context.route(`${origin}/**`, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const path = resolve(distribution, pathname === "/" ? "index.html" : `.${pathname}`);
    assert(path.startsWith(distribution + sep), "Path outside landing build");
    await route.fulfill({ path, contentType: types[extname(path)] ?? "application/octet-stream" });
  });
}

async function loadVisibleImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll("main img")].filter(image => image.checkVisibility()).map(async image => {
      image.loading = "eager";
      await image.decode();
    }));
  });
}

async function checkLayout(page) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("a[href], button")].filter(element => element.checkVisibility());
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      unnamed: controls.filter(element => !(element.ariaLabel || element.textContent || element.querySelector("img")?.alt)?.trim()).map(element => element.outerHTML),
      small: controls.filter(element => element.getBoundingClientRect().height < 43.5).map(element => element.className),
      clipped: [...document.querySelectorAll(".space-tour, .character-studio, .game-card, .screenshot-dialog[open]")].filter(element => {
        const box = element.getBoundingClientRect();
        return box.width && (box.left < -1 || box.right > innerWidth + 1);
      }).map(element => element.className),
      images: [...document.querySelectorAll("main img")].filter(image => image.checkVisibility()).map(image => ({
        src: image.currentSrc, loaded: image.complete && image.naturalWidth > 0, accessible: Boolean(image.alt || image.closest('[aria-hidden="true"]')),
      })),
    };
  });
  assert.equal(result.overflow, false, "Horizontal page overflow");
  assert.deepEqual(result.unnamed, [], "Unnamed controls");
  assert.deepEqual(result.small, [], "Controls smaller than 44px");
  assert.deepEqual(result.clipped, [], "Clipped surface");
  assert(result.images.every(image => image.loaded && image.accessible), "Image missing or lacking an accessible description");
  return result;
}

async function checkDialog(page, link) {
  await link.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.locator("img").evaluate(image => image.decode());
  assert.equal(await page.locator(".close-action").evaluate(button => button === document.activeElement), true);
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    assert(await dialog.evaluate(element => element.contains(document.activeElement)), "Focus escaped modal");
  }
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  assert(await link.evaluate(link => link === document.activeElement), "Focus did not return to preview");
}

try {
  for (const [width, height] of [[1440, 1000], [1920, 1080], [1024, 768], [800, 1024], [390, 844], [320, 568], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: width === 800 ? "dark" : "light", hasTouch: width < 1000 });
    await install(context);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(origin, { waitUntil: "networkidle" });
    assert.match(await page.title(), /^Northstar/);
    assert.match(await page.locator("h1").innerText(), /Work, with a/);
    await page.keyboard.press("Tab");
    assert(await page.locator(".skip-link").evaluate(link => link === document.activeElement));
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("main").evaluate(main => main === document.activeElement), true);
    assert(await page.evaluate(() => document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations === Infinity && animation.playState === "running").length >= 5), "Decorative motion is not running");
    if (width === 1440) {
      const bounds = await page.locator(".hero-scene").boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .5);
      await page.waitForFunction(() => document.querySelector(".hero-scene").style.getPropertyValue("--scene-x") !== "");
      for (const reveal of await page.locator(".reveal").all()) {
        await reveal.scrollIntoViewIfNeeded();
        await page.waitForFunction(element => !element.classList.contains("is-waiting"), await reveal.elementHandle());
      }
    }
    await page.getByRole("button", { name: "Pause animations", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-motion"), "paused");
    assert(await page.evaluate(() => document.getAnimations().filter(animation => animation.effect.getComputedTiming().iterations === Infinity).every(animation => animation.playState === "paused")));
    await loadVisibleImages(page);
    for (const tab of await page.getByRole("tab").all()) {
      await tab.click();
      assert.equal(await tab.getAttribute("aria-selected"), "true");
      assert.equal(await page.getByRole("tabpanel").count(), 1);
      await loadVisibleImages(page);
      await checkDialog(page, page.getByRole("tabpanel").getByRole("link"));
      if (width === 1440) {
        await page.locator(".space-tour").screenshot({ path: resolve(output, `${await tab.getAttribute("id")}.png`) });
      }
    }
    const firstTab = page.getByRole("tab", { name: "Hang out", exact: true });
    await firstTab.focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.getByRole("tab", { name: "Make it yours" }).getAttribute("aria-selected"), "true");
    await page.keyboard.press("Home");
    assert.equal(await firstTab.getAttribute("aria-selected"), "true");
    await page.keyboard.press("End");
    assert.equal(await page.getByRole("tab", { name: "Make it yours" }).getAttribute("aria-selected"), "true");
    await firstTab.click();
    for (const outfit of ["Frog", "Starlight", "Sunset"]) {
      const button = page.getByRole("button", { name: outfit, exact: true });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".character-figure.is-selected").getAttribute("data-character"), outfit.toLowerCase());
      assert.equal(await page.locator('.outfit-options [aria-pressed="true"]').count(), 1);
    }
    for (const selector of [".hero-peek", ".character-copy [data-screenshot]", ".game-chess", ".game-blocks", ".game-tictactoe"]) {
      await checkDialog(page, page.locator(selector));
    }
    await page.locator(".hero-peek").click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    await page.locator(".hero-peek").click();
    await page.mouse.click(1, 1);
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    for (const link of await page.locator("[data-client-link]").all()) assert.equal(await link.evaluate(link => link.href), expectedClient);
    assert.equal(await page.locator("[data-download-link]").getAttribute("href"), "https://github.com/pureportal/work-hard-play-hard/releases/latest");
    const result = await checkLayout(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `${width}x${height}.png`), fullPage: true });
    await page.getByRole("button", { name: "Resume animations", exact: true }).click();
    assert.equal(await page.locator("html").getAttribute("data-motion"), "playing");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.documentElement.dataset.motion === "paused");
    assert.equal(await page.locator(".motion-toggle").isVisible(), false);
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
    assert.equal(await page.locator(".primary-action").evaluate(element => getComputedStyle(element).transitionDuration), "0s");
    layouts.push({ width, height, ...result });
    console.log(`${width}x${height}: layout, images, tour, outfits, dialogs and motion passed.`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await install(context);
  const page = await context.newPage();
  await page.goto(origin);
  const link = page.locator(".hero-peek");
  const fullImage = await link.evaluate(link => link.href);
  await context.route(fullImage, route => route.fulfill({ status: 503, body: "Image unavailable" }), { times: 1 });
  await link.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".screenshot-full").isVisible(), false);
  assert.equal(await page.getByRole("link", { name: "Open image" }).getAttribute("href"), fullImage);
  await page.keyboard.press("Escape");
  await link.click();
  await page.locator(".screenshot-full").evaluate(image => image.decode());
  assert.equal(await page.getByRole("alert").isVisible(), false);
  await page.keyboard.press("Escape");
  await loadVisibleImages(page);
  assert.match(await page.locator(".hero-illustration").evaluate(image => image.currentSrc), /1536/);
  await page.screenshot({ path: resolve(output, "retina-reduced-motion.png"), fullPage: true });
  await context.route(expectedClient, route => route.fulfill({ contentType: "text/html", body: "<title>Office navigation fixture</title>" }));
  await page.locator(".primary-action").click();
  await page.waitForURL(expectedClient);
  assert.equal(await page.title(), "Office navigation fixture");
  await context.close();
  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await install(noScript);
  const noScriptPage = await noScript.newPage();
  await noScriptPage.goto(origin);
  await noScriptPage.locator(".hero-peek").click();
  assert.match(noScriptPage.url(), /office-full.*\.webp$/);
  await noScript.close();
  await writeFile(resolve(output, "browser-results.json"), JSON.stringify({
    source: live ? `Existing landing service at ${origin}` : "Production HTML, CSS, JavaScript, fonts and images via intercepted static responses",
    layouts, errors, interactions: ["keyboard tour tabs", "outfit selection", "eight screenshot links", "focus containment and restoration", "Escape, close and backdrop dismissal", "image failure and retry", "running animations, pointer parallax and scroll reveals", "pause and resume", "reduced motion and preference changes", "skip link", "retina sources", "office navigation fixture", "screenshots without JavaScript"],
  }, null, 2));
  console.log(`${live ? "Live" : "Production"} landing: ${layouts.length} layouts passed; images, keyboard, tour, outfits, dialogs and motion verified.`);
} finally {
  await browser.close();
}
