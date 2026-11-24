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
const releases = "https://github.com/pureportal/work-hard-play-hard/releases/latest";
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath({ headless: "shell" }) });
const errors = [];
const layouts = [];
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2" };
const pages = {
  en: { path: "/", locale: "en-US", title: /^Northstar — Work/, heading: /^Work, with a little more/, switchName: "Deutsch", legal: { Imprint: "https://pureportal.io/imprint", Privacy: "https://pureportal.io/privacy", Terms: "https://pureportal.io/terms" } },
  de: { path: "/de/", locale: "de-DE", title: /^Northstar — Arbeit/, heading: /^Arbeit, mit ein bisschen mehr/, switchName: "English", legal: { Impressum: "https://pureportal.io/de/imprint", Datenschutz: "https://pureportal.io/de/privacy", Nutzungsbedingungen: "https://pureportal.io/de/terms" } },
};
await mkdir(output, { recursive: true });

async function install(context) {
  if (live) return;
  await context.route(`${origin}/**`, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const path = resolve(distribution, pathname.endsWith("/") ? `.${pathname}index.html` : `.${pathname}`);
    assert(path.startsWith(distribution + sep), "Path outside landing build");
    await route.fulfill({ path, contentType: types[extname(path)] ?? "application/octet-stream" });
  });
}

async function loadImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const image of document.querySelectorAll("main img")) {
      image.loading = "eager";
      await image.decode();
    }
    for (const element of document.querySelectorAll(".reveal.is-waiting")) element.classList.remove("is-waiting");
  });
}

async function checkLayout(page) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("a[href], button")].filter(element => element.checkVisibility());
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      unnamed: controls.filter(element => !(element.ariaLabel || element.textContent)?.trim()).map(element => element.outerHTML),
      small: controls.filter(element => element.getBoundingClientRect().height < 43.5).map(element => element.outerHTML),
      images: [...document.querySelectorAll("main img")].map(image => ({ src: image.currentSrc, loaded: image.complete && image.naturalWidth > 0, alt: image.alt })),
    };
  });
  assert.equal(result.overflow, false, "Horizontal page overflow");
  assert.deepEqual(result.unnamed, [], "Unnamed controls");
  assert.deepEqual(result.small, [], "Controls smaller than 44px");
  assert.equal(result.images.length, 5);
  assert(result.images.every(image => image.loaded && image.alt.length > 20), "Image missing or lacking a description");
  return result;
}

try {
  for (const [language, expected] of Object.entries(pages)) {
    for (const [width, height] of [[1920, 1080], [1440, 1000], [1024, 768], [390, 844], [320, 568]]) {
      const context = await browser.newContext({ viewport: { width, height }, locale: expected.locale, hasTouch: width < 1000 });
      await install(context);
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.goto(new URL(expected.path, origin).href, { waitUntil: "networkidle" });
      assert.equal(new URL(page.url()).pathname, expected.path, "Browser language did not select the page");
      assert.equal(await page.locator("html").getAttribute("lang"), language);
      assert.match(await page.title(), expected.title);
      assert.match(await page.locator("h1").innerText(), expected.heading);
      assert.equal(await page.locator('link[rel="alternate"]').count(), 3);
      await page.keyboard.press("Tab");
      assert(await page.locator(".skip-link").evaluate(link => link === document.activeElement));
      await page.keyboard.press("Enter");
      assert(await page.locator("main").evaluate(main => main === document.activeElement));
      for (const link of await page.locator("[data-client-link]").all()) assert.equal(await link.evaluate(link => link.href), expectedClient);
      assert.equal(await page.locator("[data-download-link]").getAttribute("href"), releases);
      for (const [name, href] of Object.entries(expected.legal)) {
        assert.equal(await page.getByRole("contentinfo").getByRole("link", { name, exact: true }).getAttribute("href"), href);
      }
      await loadImages(page);
      const result = await checkLayout(page);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: resolve(output, `${language}-${width}x${height}.png`), fullPage: true });
      layouts.push({ language, width, height, ...result });
      console.log(`${language} ${width}x${height}: layout, images, links and keyboard passed.`);
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", reducedMotion: "reduce" });
  await install(context);
  const page = await context.newPage();
  await page.goto(origin);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  assert.equal(await page.locator(".reveal.is-waiting").count(), 0, "Reduced motion still hides content");
  await page.getByRole("banner").getByRole("link", { name: "Deutsch", exact: true }).click();
  await page.waitForURL(`${origin}/de/`);
  assert.equal(await page.locator("html").getAttribute("lang"), "de");
  await page.goto(origin);
  await page.waitForURL(`${origin}/de/`);
  await page.getByRole("banner").getByRole("link", { name: "English", exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.reload();
  assert.equal(new URL(page.url()).pathname, "/");
  await context.route(expectedClient, route => route.fulfill({ contentType: "text/html", body: "<title>Office navigation fixture</title>" }));
  await page.locator(".primary-action").click();
  await page.waitForURL(expectedClient);
  assert.equal(await page.title(), "Office navigation fixture");
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "browser-results.json"), JSON.stringify({
    source: live ? `Existing landing service at ${origin}` : "Production HTML, CSS, JavaScript, fonts and images via intercepted static responses",
    layouts, errors, interactions: ["browser language selection", "remembered language choice", "skip link", "reduced motion", "legal links", "office navigation fixture"],
  }, null, 2));
  console.log(`${live ? "Live" : "Production"} landing: ${layouts.length} layouts passed in English and German.`);
} finally {
  await browser.close();
}
