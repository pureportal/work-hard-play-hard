import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import puppeteer from "puppeteer";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const artifactDirectory = new URL("../artifacts/", import.meta.url);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, artifactDirectory)), fullPage: true });
}

function trackIssues(page, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 401 (Unauthorized)")) {
      issues.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => issues.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
}

async function waitForOffice(page) {
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
}

async function signIn(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const authCard = await page.$(".auth-card");
  if (authCard) {
    await page.type('input[name="identifier"]', "maya");
    await page.type('input[name="password"]', "northstar");
    await page.click('button[type="submit"]');
  }
  await waitForOffice(page);
}

async function openObserver(page) {
  await page.evaluate(async () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/v1/realtime?floorId=floor-studio`);
    const observer = { socket, events: [], players: [] };
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data));
      observer.events.push(event);
      if (event.type === "world.snapshot") {
        observer.players = event.players;
      }
    });
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    globalThis.buildingObserver = observer;
  });
  await page.waitForFunction(() => globalThis.buildingObserver.players.some((player) => player.userId === "user-maya"));
}

async function resetToStudio(page) {
  await page.evaluate(() => {
    globalThis.buildingObserver.socket.send(JSON.stringify({
      type: "movement.set_destination",
      requestId: crypto.randomUUID(),
      floorId: "floor-studio",
      x: 770,
      y: 890,
    }));
  });
  await page.waitForFunction(() => {
    const player = globalThis.buildingObserver.players.find((candidate) => candidate.userId === "user-maya");
    return player?.floorId === "floor-studio" && Math.hypot(player.x - 770, player.y - 890) < 24;
  }, { timeout: 30_000 });
}

async function clickNamedButton(page, selector, name) {
  const clicked = await page.evaluate((buttonSelector, buttonName) => {
    const button = [...document.querySelectorAll(buttonSelector)]
      .find((candidate) => candidate.textContent?.trim() === buttonName);
    if (!(button instanceof HTMLElement)) {
      return false;
    }
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
    button.click();
    return true;
  }, selector, name);
  assert(clicked, `Could not find ${name}`);
}

async function openPlantPlacement(page) {
  const buildButton = await page.$('button[aria-label="Build"][aria-pressed="true"]');
  if (!buildButton) {
    await page.click('button[aria-label="Build"]');
  }
  await page.waitForSelector(".build-panel", { visible: true });
  await clickNamedButton(page, ".asset-category-tabs button", "Plants");
  await clickNamedButton(page, ".asset-grid > button", "Planter row");
  await page.waitForSelector(".placement-controls", { visible: true });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await page.$eval(".placement-orientation", (element) => element.textContent?.includes("East"))) {
      return;
    }
    await page.click(".asset-rotate");
  }
  throw new Error("Could not rotate asset east");
}

async function clearObservedEvents(page) {
  await page.evaluate(() => {
    globalThis.buildingObserver.events = [];
  });
}

async function getPlacementContext(page, point) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector(".world-canvas canvas").getBoundingClientRect();
    const player = globalThis.buildingObserver.players.find((candidate) => candidate.userId === "user-maya");
    return {
      expectedX: player.x + (x - canvas.left - canvas.width / 2) / 0.78,
      expectedY: player.y + (y - canvas.top - canvas.height / 2) / 0.78,
      player,
    };
  }, point);
}

async function findValidMousePoint(page) {
  const candidates = await page.$eval(".world-canvas canvas", (canvas) => {
    const rectangle = canvas.getBoundingClientRect();
    return [
      [-160, -120],
      [-220, -80],
      [150, -150],
      [-80, -190],
      [190, -70],
    ].map(([offsetX, offsetY]) => ({
      x: rectangle.left + rectangle.width / 2 + offsetX,
      y: rectangle.top + rectangle.height / 2 + offsetY,
    }));
  });
  for (const point of candidates) {
    await page.mouse.move(point.x, point.y);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await page.$eval(".placement-confirm", (button) => !button.disabled)) {
      return point;
    }
  }
  throw new Error("Could not find a valid desktop placement point");
}

async function findValidTouchPoint(page, panelTop) {
  const candidates = await page.$eval(".world-canvas canvas", (canvas, maximumY) => {
    const rectangle = canvas.getBoundingClientRect();
    const centerX = rectangle.left + rectangle.width / 2;
    return [
      { x: centerX, y: Math.min(maximumY - 100, 280) },
      { x: centerX - 70, y: Math.min(maximumY - 130, 240) },
      { x: centerX + 65, y: Math.min(maximumY - 155, 210) },
    ];
  }, panelTop);
  for (const point of candidates) {
    await clearObservedEvents(page);
    await page.touchscreen.tap(point.x, point.y);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const layoutUpdateCount = await page.evaluate(() => globalThis.buildingObserver.events
      .filter((event) => event.type === "layout.updated").length);
    assert(layoutUpdateCount === 0, "Touch placement committed before confirmation");
    if (await page.$eval(".placement-confirm", (button) => !button.disabled)) {
      return point;
    }
  }
  throw new Error("Could not find a valid touch placement point");
}

async function waitForPlacedObject(page, initialObjectIds, assetId = "plant-planter-row") {
  await page.waitForFunction((knownIds, expectedAssetId) => globalThis.buildingObserver.events.some((event) => (
    event.type === "layout.updated"
    && event.layout.objects.some((object) => object.assetId === expectedAssetId && !knownIds.includes(object.id))
  )), {}, initialObjectIds, assetId);
  return page.evaluate((knownIds, expectedAssetId) => {
    const update = [...globalThis.buildingObserver.events].reverse().find((event) => (
      event.type === "layout.updated"
      && event.layout.objects.some((object) => object.assetId === expectedAssetId && !knownIds.includes(object.id))
    ));
    return {
      layout: update.layout,
      object: update.layout.objects.find((candidate) => candidate.assetId === expectedAssetId && !knownIds.includes(candidate.id)),
    };
  }, initialObjectIds, assetId);
}

function assertCenteredPlacement(object, context, label) {
  const centerX = object.x + 40;
  const centerY = object.y + 8;
  const distance = Math.hypot(centerX - context.expectedX, centerY - context.expectedY);
  assert(object.rotation === 90, `${label}: placement rotation was not preserved`);
  assert(distance <= 16, `${label}: asset center missed the pointer by ${distance.toFixed(1)}px`);
}

async function removeObject(page, layout, objectId) {
  await clearObservedEvents(page);
  await page.evaluate((revision, id) => {
    globalThis.buildingObserver.socket.send(JSON.stringify({
      type: "layout.apply",
      requestId: crypto.randomUUID(),
      baseRevision: revision,
      edit: { tool: "item.remove", item: { type: "asset", id } },
    }));
  }, layout.revision, objectId);
  await page.waitForFunction((id) => globalThis.buildingObserver.events.some((event) => (
    event.type === "layout.updated" && !event.layout.objects.some((object) => object.id === id)
  )), {}, objectId);
}

async function getInitialObjectIds(page) {
  return page.evaluate(async () => {
    const response = await fetch("/v1/bootstrap", { credentials: "include", cache: "no-store" });
    const data = await response.json();
    return data.layouts.find((layout) => layout.floorId === "floor-studio").objects.map((object) => object.id);
  });
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await puppeteer.launch({
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 120_000,
  args: ["--disable-dev-shm-usage", "--no-first-run"],
});
const issues = [];

try {
  const [page] = await browser.pages();
  assert(page, "Chromium did not create a page");
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(120_000);
  trackIssues(page, issues);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => window.localStorage.setItem("northstar-color-theme", "light"));
  await signIn(page);
  await openObserver(page);
  await resetToStudio(page);
  await new Promise((resolve) => setTimeout(resolve, 900));

  assert(await page.$eval("html", (element) => element.dataset.theme === "light"), "Desktop did not start in light mode");
  await page.click('button[aria-label="Use dark mode"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await screenshot(page, "building-dark-office");
  await page.click('button[aria-label="Use light mode"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");

  const desktopInitialIds = await getInitialObjectIds(page);
  await page.click('button[aria-label="Build"]');
  await page.waitForSelector(".build-panel", { visible: true });
  await clickNamedButton(page, ".asset-category-tabs button", "Seating");
  await clickNamedButton(page, ".asset-grid > button", "Office chair");
  await clickNamedButton(page, ".asset-variants button", "Blue");
  await page.keyboard.press("r");
  assert(await page.$eval(".placement-orientation", (element) => element.textContent?.includes("East")), "R did not rotate the focused chair placement");
  assert(await page.$eval('.asset-variants button[aria-checked="true"]', (button) => button.textContent?.trim() === "Blue"), "Chair design selection was not retained");
  await findValidMousePoint(page);
  await screenshot(page, "building-chair-blue-preview");

  await clickNamedButton(page, ".asset-grid > button", "Three-seat sofa");
  await clickNamedButton(page, ".asset-variants button", "Gray");
  await findValidMousePoint(page);
  await screenshot(page, "building-sofa-gray-preview");

  await clickNamedButton(page, ".asset-category-tabs button", "Surfaces");
  await clickNamedButton(page, ".asset-grid > button", "Floor Tile");
  const surfaceDesigns = await page.$$eval(".asset-variants button", (buttons) => buttons.map((button) => button.textContent?.trim()));
  assert(JSON.stringify(surfaceDesigns) === JSON.stringify(["Wood", "Stone", "Grass"]), "Floor surface designs are incomplete");
  await clickNamedButton(page, ".asset-variants button", "Grass");
  await page.keyboard.press("r");
  const floorPoint = await findValidMousePoint(page);
  const floorContext = await getPlacementContext(page, floorPoint);
  await clearObservedEvents(page);
  await screenshot(page, "building-grass-floor-preview");
  await page.mouse.click(floorPoint.x, floorPoint.y);
  const floorPlacement = await waitForPlacedObject(page, desktopInitialIds, "floor-tile");
  assert(floorPlacement.object.variantId === "grass", "Placed floor surface lost its selected design");
  assert(floorPlacement.object.rotation === 180, "R rotation was not retained for the floor surface");
  assert(Math.hypot(floorPlacement.object.x + 32 - floorContext.expectedX, floorPlacement.object.y + 32 - floorContext.expectedY) <= 16, "Floor surface was not centered on the pointer");
  await removeObject(page, floorPlacement.layout, floorPlacement.object.id);

  await openPlantPlacement(page);
  assert(await page.$eval(".asset-rotate", (button) => button.textContent?.includes("East")), "Build panel did not show orientation");
  await clickNamedButton(page, ".asset-category-tabs button", "Equipment");
  assert(await page.$eval(".asset-grid", (grid) => grid.textContent?.includes("Bookshelf")), "Expanded asset collection is missing");
  await clickNamedButton(page, ".asset-category-tabs button", "Plants");
  await clickNamedButton(page, ".asset-grid > button", "Planter row");
  const desktopPoint = await findValidMousePoint(page);
  const desktopContext = await getPlacementContext(page, desktopPoint);
  await clearObservedEvents(page);
  await screenshot(page, "building-light-desktop-preview");
  await page.mouse.click(desktopPoint.x, desktopPoint.y);
  const desktopPlacement = await waitForPlacedObject(page, desktopInitialIds);
  assertCenteredPlacement(desktopPlacement.object, desktopContext, "Desktop");
  await removeObject(page, desktopPlacement.layout, desktopPlacement.object.id);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForOffice(page);
  await openObserver(page);
  await resetToStudio(page);
  await new Promise((resolve) => setTimeout(resolve, 900));
  await page.click('button[aria-label="Use dark mode"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  const touchInitialIds = await getInitialObjectIds(page);
  await openPlantPlacement(page);
  const mobileMetrics = await page.evaluate(() => {
    const panel = document.querySelector(".build-panel").getBoundingClientRect();
    const controls = document.querySelector(".placement-controls").getBoundingClientRect();
    const touchTargets = [...document.querySelectorAll(".placement-controls button")]
      .map((button) => button.getBoundingClientRect());
    return {
      panel: panel.toJSON(),
      controls: controls.toJSON(),
      touchTargets: touchTargets.map(({ width, height }) => ({ width, height })),
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(Math.abs(mobileMetrics.panel.bottom - mobileMetrics.viewport.height) <= 1, "Mobile build panel is not docked to the bottom");
  assert(mobileMetrics.panel.height <= mobileMetrics.viewport.height * 0.5, "Mobile build panel hides too much of the map");
  assert(mobileMetrics.controls.bottom <= mobileMetrics.panel.top - 8, "Touch placement controls overlap the build panel");
  assert(mobileMetrics.touchTargets.every((target) => target.width >= 40 && target.height >= 40), "Placement touch targets are too small");
  assert(mobileMetrics.overflow <= 1, "Mobile layout overflows horizontally");

  const touchPoint = await findValidTouchPoint(page, mobileMetrics.panel.top);
  const touchContext = await getPlacementContext(page, touchPoint);
  await screenshot(page, "building-dark-touch-preview");
  await page.click(".placement-confirm");
  const touchPlacement = await waitForPlacedObject(page, touchInitialIds);
  assertCenteredPlacement(touchPlacement.object, touchContext, "Touch");
  await removeObject(page, touchPlacement.layout, touchPlacement.object.id);
  await page.click('button[aria-label="Cancel placement"]');
  await page.waitForSelector(".placement-controls", { hidden: true });

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const narrowMetrics = await page.evaluate(() => {
    const panel = document.querySelector(".build-panel").getBoundingClientRect();
    const topBar = document.querySelector(".top-bar").getBoundingClientRect();
    return {
      panel: panel.toJSON(),
      topBar: topBar.toJSON(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(Math.abs(narrowMetrics.panel.width - 264) <= 1, "Narrow build panel did not respect the navigation rail");
  assert(narrowMetrics.topBar.right <= 310 && narrowMetrics.topBar.left >= 56, "Narrow top bar is clipped");
  assert(narrowMetrics.overflow <= 1, "Narrow layout overflows horizontally");
  await screenshot(page, "building-narrow-portrait");

  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await openPlantPlacement(page);
  const landscapeMetrics = await page.evaluate(() => {
    const panel = document.querySelector(".build-panel").getBoundingClientRect();
    const topBar = document.querySelector(".top-bar").getBoundingClientRect();
    const controls = document.querySelector(".placement-controls").getBoundingClientRect();
    const zoom = document.querySelector(".world-zoom-controls").getBoundingClientRect();
    return {
      panel: panel.toJSON(),
      topBar: topBar.toJSON(),
      controls: controls.toJSON(),
      zoom: zoom.toJSON(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  assert(landscapeMetrics.topBar.right <= landscapeMetrics.panel.left - 10, "Landscape build panel overlaps the top bar");
  assert(landscapeMetrics.controls.right <= landscapeMetrics.panel.left, "Landscape build panel overlaps placement controls");
  assert(landscapeMetrics.zoom.right <= landscapeMetrics.panel.left, "Landscape build panel overlaps zoom controls");
  assert(landscapeMetrics.overflow <= 1, "Landscape layout overflows horizontally");
  await screenshot(page, "building-touch-landscape");
  await page.click('button[aria-label="Cancel placement"]');
  assert(issues.length === 0, issues.join("\n"));

  process.stdout.write(`${JSON.stringify({
    desktop: { point: desktopPoint, object: desktopPlacement.object },
    mobile: mobileMetrics,
    narrow: narrowMetrics,
    landscape: landscapeMetrics,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ issues }, null, 2)}\n`);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  throw error;
} finally {
  await browser.close();
}
