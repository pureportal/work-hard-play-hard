import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const workspaceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distributionDirectory = resolve(workspaceDirectory, "apps/landing/dist");
const artifactDirectory = resolve(workspaceDirectory, "artifacts");
const browser = await puppeteer.launch({ headless: true, args: ["--disable-gpu"] });
try {
  const page = await browser.newPage();
  const browserIssues = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserIssues.push(`Browser console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserIssues.push(`Browser error: ${error.message}`));
  page.on("requestfailed", (request) => {
    browserIssues.push(`Request failed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });

  await mkdir(artifactDirectory, { recursive: true });
  await page.setRequestInterception(true);
  page.on("request", (request) => void respondWithStaticFile(request));

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "compact", width: 390, height: 844 },
  ]) {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.goto("http://landing.localhost/", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => [...document.querySelectorAll("[data-client-link]")]
      .every((link) => link.getAttribute("href") === "/app/"));
    const result = await page.evaluate(() => {
      const visible = (element) => {
        const rectangle = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rectangle.width > 0 && rectangle.height > 0 && style.visibility !== "hidden";
      };
      const unnamedControls = [...document.querySelectorAll("a[href], button, input, select")]
        .filter(visible)
        .filter((element) => !(element.getAttribute("aria-label") ?? element.textContent ?? "").trim())
        .map((element) => element.outerHTML.slice(0, 120));
      const undersizedActions = [...document.querySelectorAll("[data-client-link]")]
        .filter(visible)
        .filter((element) => element.getBoundingClientRect().height < 44)
        .map((element) => element.className);
      const preview = document.querySelector(".office-preview")?.getBoundingClientRect();
      return {
        title: document.title,
        heading: document.querySelector("h1")?.textContent?.trim(),
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        unnamedControls,
        undersizedActions,
        previewClipped: Boolean(preview && (preview.left < -1 || preview.right > innerWidth + 1)),
      };
    });
    assert(result.title === "Northstar", `${viewport.name}: unexpected title`);
    assert(result.heading === "A shared place for remote work.", `${viewport.name}: heading is missing`);
    assert(result.horizontalOverflow <= 1, `${viewport.name}: page overflows horizontally`);
    assert(result.unnamedControls.length === 0, `${viewport.name}: unnamed controls: ${result.unnamedControls.join(", ")}`);
    assert(result.undersizedActions.length === 0, `${viewport.name}: undersized actions: ${result.undersizedActions.join(", ")}`);
    assert(!result.previewClipped, `${viewport.name}: office preview is clipped`);
    await page.screenshot({
      path: resolve(artifactDirectory, `landing-${viewport.name}.png`),
      fullPage: true,
    });
  }
  assert(browserIssues.length === 0, browserIssues.join("\n"));
  process.stdout.write("landing page ready\n");
} finally {
  await browser.close();
}

async function respondWithStaticFile(request) {
  const url = new URL(request.url());
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = resolve(distributionDirectory, relativePath);
  if (filePath !== distributionDirectory && !filePath.startsWith(`${distributionDirectory}${sep}`)) {
    await request.abort();
    return;
  }
  try {
    await request.respond({
      status: 200,
      contentType: contentType(filePath),
      body: await readFile(filePath),
    });
  } catch {
    await request.respond({ status: 404, contentType: "text/plain", body: "Not found" });
  }
}

function contentType(filePath) {
  const types = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
  };
  return types[extname(filePath)] ?? "application/octet-stream";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
