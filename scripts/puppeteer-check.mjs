import { mkdir } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const artifactDirectory = new URL("../artifacts/", import.meta.url);
const seededPassword = "northstar";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function report(stage) {
  process.stdout.write(`${stage}\n`);
}

function trackIssues(page, name, issues) {
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("status of 401 (Unauthorized)")) {
      issues.push(`${name} console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`${name} page: ${error.message}`));
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText ?? "failed";
    issues.push(`${name} request: ${request.url()} ${reason}`);
  });
}

async function screenshot(page, name) {
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, artifactDirectory)),
    fullPage: true,
  });
}

async function inspectVisibleUi(page, name, regions) {
  const metrics = await page.evaluate((regionSelectors) => {
    const visibleControls = [...document.querySelectorAll("button, input, select, a[href], [tabindex]")]
      .filter((element) => {
        const rectangle = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rectangle.width > 0 && rectangle.height > 0 && style.visibility !== "hidden";
      });
    const unnamedControls = visibleControls
      .filter((element) => {
        const directName = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim();
        const labelName = "labels" in element && [...element.labels].some((label) => (label.textContent ?? "").trim());
        return !directName && !labelName;
      })
      .map((element) => element.outerHTML.slice(0, 140));
    const clippedRegions = regionSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter((element) => {
        const rectangle = element.getBoundingClientRect();
        return rectangle.left < -1 || rectangle.top < -1 || rectangle.right > innerWidth + 1 || rectangle.bottom > innerHeight + 1;
      })
      .map((element) => element.className);
    return {
      title: document.title,
      bodyText: document.body.innerText,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      unnamedControls,
      clippedRegions,
    };
  }, regions);

  assert(metrics.title === "Northstar HQ", `${name}: unexpected document title`);
  assert(metrics.horizontalOverflow <= 1, `${name}: page overflows horizontally by ${metrics.horizontalOverflow}px`);
  assert(metrics.verticalOverflow <= 1, `${name}: page overflows vertically by ${metrics.verticalOverflow}px`);
  assert(metrics.unnamedControls.length === 0, `${name}: unnamed controls: ${metrics.unnamedControls.join(", ")}`);
  assert(metrics.clippedRegions.length === 0, `${name}: clipped regions: ${metrics.clippedRegions.join(", ")}`);
  return metrics;
}

async function waitForAuth(page) {
  await page.waitForSelector(".auth-card", { visible: true });
}

async function waitForOffice(page) {
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector(".connection-state")?.classList.contains("online"));
}

async function signIn(page, identifier, password = seededPassword) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAuth(page);
  await page.type('input[name="identifier"]', identifier);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
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
    globalThis.puppeteerObserver = observer;
  });
}

async function sendCommand(page, command) {
  await page.evaluate((source) => {
    globalThis.puppeteerObserver.socket.send(JSON.stringify(source));
  }, command);
}

async function resetToStudio(page, userId) {
  await sendCommand(page, { type: "floor.change", requestId: crypto.randomUUID(), floorId: "floor-rooftop" });
  await page.waitForFunction((id) => globalThis.puppeteerObserver.players.some((player) => player.userId === id && player.floorId === "floor-rooftop"), {}, userId);
  await sendCommand(page, { type: "floor.change", requestId: crypto.randomUUID(), floorId: "floor-studio" });
  await page.waitForFunction((id) => {
    const player = globalThis.puppeteerObserver.players.find((candidate) => candidate.userId === id);
    return player?.floorId === "floor-studio" && Math.hypot(player.x - 770, player.y - 890) < 3;
  }, {}, userId);
}

async function moveObserver(page, userId, x, y) {
  await sendCommand(page, { type: "movement.set_destination", requestId: crypto.randomUUID(), x, y });
  await page.waitForFunction((id, targetX, targetY) => {
    const player = globalThis.puppeteerObserver.players.find((candidate) => candidate.userId === id);
    return player && Math.hypot(player.x - targetX, player.y - targetY) < 24;
  }, { timeout: 30_000 }, userId, x, y);
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 120_000 });
const issues = [];
const contexts = [];

try {
  const [mainPage] = await browser.pages();
  assert(mainPage, "Chromium did not create an initial page");
  const leoContext = await browser.createBrowserContext();
  contexts.push(leoContext);
  const leoPage = await leoContext.newPage();
  leoPage.setDefaultTimeout(12_000);
  await leoPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  trackIssues(leoPage, "leo", issues);
  mainPage.setDefaultTimeout(12_000);
  trackIssues(mainPage, "main", issues);
  await mainPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await mainPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAuth(mainPage);
  const authDesktop = await inspectVisibleUi(mainPage, "auth desktop", [".auth-card"]);
  assert(authDesktop.bodyText.includes("Sign in") && authDesktop.bodyText.includes("Create account"), "auth desktop: account choices are missing");
  await screenshot(mainPage, "auth-sign-in");

  await mainPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const authCompact = await inspectVisibleUi(mainPage, "auth compact", [".auth-card"]);
  await screenshot(mainPage, "auth-compact");
  await mainPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  report("authentication shell ready");

  await mainPage.click('button[role="tab"]:nth-child(2)');
  const registrationId = "browser-check";
  assert(await mainPage.$('input[name="username"]') && await mainPage.$('input[name="email"]'), "registration: account fields are missing");
  await screenshot(mainPage, "auth-create-account");
  await mainPage.click('button[role="tab"]:first-child');
  await mainPage.type('input[name="identifier"]', registrationId);
  await mainPage.type('input[name="password"]', "browser-password");
  await mainPage.click('button[type="submit"]');
  await mainPage.waitForFunction(() => Boolean(document.querySelector(".world-canvas canvas, .auth-error")));
  if (await mainPage.$(".auth-error")) {
    await mainPage.click('button[role="tab"]:nth-child(2)');
    await mainPage.type('input[name="username"]', registrationId);
    await mainPage.type('input[name="email"]', `${registrationId}@example.com`);
    await mainPage.type('input[name="password"]', "browser-password");
    await mainPage.click('button[type="submit"]');
  }
  await waitForOffice(mainPage);
  assert(await mainPage.$eval("body", (body, username) => body.innerText.includes(username), registrationId), "registration: new member did not enter the office");
  await screenshot(mainPage, "auth-registration-complete");
  await mainPage.click('button[aria-label="Sign out"]');
  await waitForAuth(mainPage);
  report("registration ready");

  await mainPage.type('input[name="identifier"]', "maya");
  await mainPage.type('input[name="password"]', "wrong-password");
  await mainPage.click('button[type="submit"]');
  await mainPage.waitForSelector(".auth-error", { visible: true });
  assert(await mainPage.$eval(".auth-error", (element) => element.textContent?.includes("Invalid username or password.")), "login: invalid credentials were not explained");
  await screenshot(mainPage, "auth-login-error");
  await mainPage.$eval('input[name="password"]', (input) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await mainPage.type('input[name="password"]', seededPassword);
  await mainPage.click('button[type="submit"]');
  await waitForOffice(mainPage);
  await openObserver(mainPage);
  await resetToStudio(mainPage, "user-maya");
  report("password login ready");

  await signIn(leoPage, "leo");
  const magic = { context: leoContext, page: leoPage };
  await magic.page.click('button[aria-label="Sign out"]');
  await waitForAuth(magic.page);
  await magic.page.click(".auth-link-button");
  await magic.page.type('input[name="email"]', "leo@northstar.studio");
  await magic.page.click('button[type="submit"]');
  await magic.page.waitForSelector(".auth-email-sent", { visible: true });
  await screenshot(magic.page, "auth-magic-link-sent");
  await magic.page.click('a.auth-submit');
  await waitForOffice(magic.page);
  report("magic-link login ready");

  const desktop = await inspectVisibleUi(mainPage, "desktop office", [".top-bar", ".nav-rail", ".side-panel", ".control-dock"]);
  assert(desktop.bodyText.includes("Northstar HQ"), "desktop: office did not render");
  const canvas = await mainPage.$eval(".world-canvas canvas", (element) => element.getBoundingClientRect().toJSON());
  assert(canvas.width > 200 && canvas.height > 200, "desktop: world canvas is too small");
  await screenshot(mainPage, "desktop-office");

  await mainPage.click('button[aria-label="Messages"]');
  await mainPage.waitForSelector('.chat-panel input[aria-label^="Message"]', { visible: true });
  assert(await mainPage.$eval(".chat-panel", (element) => element.textContent?.includes("API contract is ready for review.") ?? false), "desktop: seeded chat is missing");
  if (!(await mainPage.$('.chat-image img[alt="browser-check.png"]'))) {
    await mainPage.evaluate(() => {
      const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "browser-check.png", { type: "image/png" }));
      document.querySelector(".chat-panel")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
  }
  await mainPage.waitForSelector('.chat-image img[alt="browser-check.png"]', { visible: true });
  await screenshot(mainPage, "desktop-messages");
  report("seeded workspace and image chat ready");

  const leo = magic;
  await openObserver(leo.page);
  await resetToStudio(leo.page, "user-leo");
  await moveObserver(leo.page, "user-leo", 920, 860);
  await mainPage.waitForFunction(() => {
    const player = globalThis.puppeteerObserver.players.find((candidate) => candidate.userId === "user-leo");
    return player && Math.hypot(player.x - 920, player.y - 860) < 24;
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const approach = await mainPage.evaluate(() => {
    const canvasElement = document.querySelector(".world-canvas canvas");
    const me = globalThis.puppeteerObserver.players.find((player) => player.userId === "user-maya");
    const target = globalThis.puppeteerObserver.players.find((player) => player.userId === "user-leo");
    const rectangle = canvasElement.getBoundingClientRect();
    return {
      x: rectangle.left + rectangle.width / 2 + (target.x - me.x) * 0.78,
      y: rectangle.top + rectangle.height / 2 + (target.y - me.y) * 0.78,
    };
  });
  await mainPage.mouse.click(approach.x, approach.y);
  await mainPage.waitForFunction(() => document.querySelector(".call-pill.connected")?.textContent?.includes("Leo Martins"), { timeout: 15_000 });
  await leo.page.waitForFunction(() => document.querySelector(".call-pill.connected")?.textContent?.includes("Maya Chen"), { timeout: 15_000 });
  await screenshot(mainPage, "walk-up-call-connected");
  await mainPage.click('button[aria-label="End call with Leo Martins"]');
  await mainPage.waitForSelector(".call-pill", { hidden: true });
  await leo.page.waitForSelector(".call-pill", { hidden: true });
  report("walk-up direct call ready");

  await mainPage.click('button[aria-label="People"]');
  await mainPage.waitForSelector(".people-panel", { visible: true });
  const expanded = await mainPage.$eval('button.person-main[aria-label="Leo Martins"]', (button) => button.getAttribute("aria-expanded") === "true");
  if (!expanded) {
    await mainPage.click('button.person-main[aria-label="Leo Martins"]');
  }
  await mainPage.click('button[aria-label="Call Leo Martins"]');
  await leo.page.waitForSelector('button[aria-label="Accept call from Maya Chen"]', { visible: true });
  await leo.page.click('button[aria-label="Accept call from Maya Chen"]');
  await mainPage.waitForFunction(() => document.querySelector(".call-pill.connected")?.textContent?.includes("Leo Martins"));
  await mainPage.click('button[aria-label="End call with Leo Martins"]');
  await mainPage.waitForSelector(".call-pill", { hidden: true });
  report("ringing direct call preserved");

  await resetToStudio(mainPage, "user-maya");
  await moveObserver(mainPage, "user-maya", 1265, 452);
  await mainPage.waitForFunction(() => document.querySelector(".door-interaction")?.textContent?.includes("Focus Suite"));
  await screenshot(mainPage, "locked-room-door");
  await mainPage.evaluate(() => {
    const enter = [...document.querySelectorAll(".door-interaction button")].find((button) => button.textContent?.includes("Enter"));
    enter?.click();
  });
  await mainPage.waitForFunction(() => globalThis.puppeteerObserver.players.find((player) => player.userId === "user-maya")?.areaId === "area-focus", { timeout: 15_000 });
  report("locked-room door interaction ready");

  await resetToStudio(mainPage, "user-maya");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await screenshot(mainPage, "public-meeting-circle");
  await moveObserver(mainPage, "user-maya", 800, 760);
  await mainPage.waitForFunction(() => document.querySelector("#meeting-title")?.textContent === "Open huddle", { timeout: 15_000 });
  await screenshot(mainPage, "public-meeting-joined");
  await mainPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mainPage.click('button[role="tab"][aria-label="Chat"]');
  await mainPage.waitForSelector(".meeting-main.show-chat .meeting-chat", { visible: true });
  const compactMeeting = await inspectVisibleUi(mainPage, "compact meeting chat", [".meeting-overlay", ".meeting-overlay-header", ".meeting-chat", ".meeting-controls"]);
  assert(compactMeeting.bodyText.includes("Chat"), "compact meeting: chat is unavailable");
  await screenshot(mainPage, "compact-meeting-chat");
  await mainPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await mainPage.click('button[aria-label="Leave meeting"]');
  await mainPage.waitForSelector(".meeting-overlay", { hidden: true });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert(!(await mainPage.$(".meeting-overlay")), "public meeting reopened before the user left its circle");
  report("public meeting entry ready");

  await resetToStudio(mainPage, "user-maya");
  await moveObserver(mainPage, "user-maya", 735, 360);
  await mainPage.waitForFunction(() => document.querySelector("#meeting-title")?.textContent === "Product crit", { timeout: 15_000 });
  await screenshot(mainPage, "meeting-room-joined");
  await mainPage.click('button[aria-label="Leave meeting"]');
  await mainPage.waitForSelector(".meeting-overlay", { hidden: true });
  report("meeting-room entry ready");

  await mainPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const closePanel = await mainPage.$('.side-panel .panel-header button[aria-label^="Close"]');
  if (closePanel) {
    await closePanel.click();
    await mainPage.waitForSelector(".side-panel", { hidden: true });
  }
  const compactOffice = await inspectVisibleUi(mainPage, "compact office", [".top-bar", ".nav-rail", ".control-dock", ".world-zoom-controls"]);
  assert(await mainPage.$eval(".world-canvas canvas", (element) => element.getBoundingClientRect().width > 200), "compact office: map is not reachable");
  await screenshot(mainPage, "compact-office");
  await mainPage.click('button[aria-label="Messages"]');
  await mainPage.waitForSelector(".chat-panel", { visible: true });
  await inspectVisibleUi(mainPage, "compact messages", [".nav-rail", ".chat-panel", ".message-composer"]);
  await screenshot(mainPage, "compact-messages");
  report("compact office ready");

  await mainPage.evaluate(() => globalThis.puppeteerObserver.socket.close());
  await leo.page.evaluate(() => globalThis.puppeteerObserver.socket.close());
  assert(issues.length === 0, issues.join("\n"));
  process.stdout.write(`${JSON.stringify({ authDesktop, authCompact, desktop, compactOffice }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  throw error;
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  const closed = await Promise.race([
    browser.close().then(() => true).catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!closed) {
    browser.process()?.kill();
  }
}
