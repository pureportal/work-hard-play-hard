import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const artifactDirectory = new URL("../artifacts/", import.meta.url);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertContained(page, selectors) {
  const failures = await page.evaluate((targets) => targets.flatMap((selector) => {
    const element = document.querySelector(selector);
    const game = document.querySelector(".tetris-game");
    if (!element || !game) {
      return [`${selector} is missing`];
    }
    const bounds = element.getBoundingClientRect();
    const container = game.getBoundingClientRect();
    return bounds.left >= container.left - 1
      && bounds.top >= container.top - 1
      && bounds.right <= container.right + 1
      && bounds.bottom <= container.bottom + 1
      ? []
      : [`${selector} is outside the game window`];
  }), selectors);
  assert(failures.length === 0, failures.join(", "));
}

async function gameCommands(page, start = 0) {
  return page.evaluate((startIndex) => globalThis.__tetrisCommands
    .slice(startIndex)
    .filter((command) => command.type === "game.command")
    .map((command) => command.command), start);
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await puppeteer.launch({
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 120_000,
  args: ["--disable-dev-shm-usage", "--no-first-run"],
});

try {
  const [page] = await browser.pages();
  assert(page, "Chromium did not create a page.");
  page.setDefaultTimeout(30_000);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.__tetrisCommands = [];
    globalThis.__tetrisSockets = [];
    class TrackingWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        if (protocols === undefined) {
          super(url);
        } else {
          super(url, protocols);
        }
        globalThis.__tetrisSockets.push(this);
      }

      send(data) {
        try {
          globalThis.__tetrisCommands.push(JSON.parse(String(data)));
        } catch {
          globalThis.__tetrisCommands.push({ type: "unparsed" });
        }
        super.send(data);
      }
    }
    Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: TrackingWebSocket });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { visible: true });
  await page.type('input[name="identifier"]', "maya");
  await page.type('input[name="password"]', "northstar");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  await page.evaluate(() => {
    const socket = globalThis.__tetrisSockets.findLast((candidate) =>
      candidate.readyState === WebSocket.OPEN && candidate.url.includes("/v1/realtime"),
    );
    socket.send(JSON.stringify({
      type: "movement.set_destination",
      requestId: crypto.randomUUID(),
      floorId: "floor-studio",
      x: 1_050,
      y: 620,
    }));
  });
  await page.waitForSelector(".tetris-lobby", { visible: true });
  await page.click(".tetris-start-button");
  await page.waitForSelector(".tetris-game", { visible: true });
  await page.waitForSelector(".tetris-piece-preview.has-piece", { visible: true });

  const animationStyles = await page.evaluate(() => ({
    game: getComputedStyle(document.querySelector(".tetris-game")).animationName,
    preview: getComputedStyle(document.querySelector(".tetris-piece-preview.has-piece")).animationName,
    activeCellTransition: getComputedStyle(document.querySelector(".tetris-cell.is-active")).transitionDuration,
  }));
  assert(animationStyles.game !== "none", "The game entry animation is missing.");
  assert(animationStyles.preview !== "none", "The piece preview animation is missing.");
  assert(animationStyles.activeCellTransition !== "0s", "Active cell transitions are missing.");

  const desktopBoard = await page.$eval(".tetris-board", (element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  assert(desktopBoard.width >= 280 && desktopBoard.height >= 560, "The board does not use the desktop viewport.");
  await assertContained(page, [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);

  const inputStart = await page.evaluate(() => globalThis.__tetrisCommands.length);
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction((start) => globalThis.__tetrisCommands
    .slice(start)
    .some((command) => command.type === "game.command" && command.command === "left"), {}, inputStart);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await page.keyboard.press("ArrowUp");
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.keyboard.up("ArrowLeft");
  const inputCommands = await gameCommands(page, inputStart);
  const rotationIndex = inputCommands.indexOf("rotate");
  assert(inputCommands[0] === "left", `Horizontal movement was not immediate: ${JSON.stringify(inputCommands)}`);
  assert(rotationIndex > 0, `Rotation was not dispatched during movement: ${JSON.stringify(inputCommands)}`);
  assert(inputCommands.some((command, index) => command === "left" && index > rotationIndex), `Movement stopped after rotation: ${JSON.stringify(inputCommands)}`);

  const holdCountBefore = (await gameCommands(page)).filter((command) => command === "hold").length;
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.querySelector(".tetris-hold")?.classList.contains("is-locked"));
  const heldPieceLabel = await page.$eval(".tetris-hold .tetris-piece-preview", (element) => element.getAttribute("aria-label"));
  assert(heldPieceLabel?.startsWith("Held "), "The held piece did not update.");
  const holdCountAfter = (await gameCommands(page)).filter((command) => command === "hold").length;
  assert(holdCountAfter === holdCountBefore + 1, "The first hold command was not sent once.");
  await page.keyboard.press("c");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert((await gameCommands(page)).filter((command) => command === "hold").length === holdCountAfter, "Hold repeated before lock.");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !document.querySelector(".tetris-hold")?.classList.contains("is-locked"));
  await page.keyboard.press("c");
  await page.waitForFunction((previousCount) => globalThis.__tetrisCommands
    .filter((command) => command.type === "game.command" && command.command === "hold").length > previousCount, {}, holdCountAfter);

  await page.screenshot({ path: fileURLToPath(new URL("tetris-desktop.png", artifactDirectory)) });
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await assertContained(page, [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);
  await page.screenshot({ path: fileURLToPath(new URL("tetris-landscape.png", artifactDirectory)) });
  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await assertContained(page, [".tetris-left-rail", ".tetris-board", ".tetris-sidebar", ".tetris-controls"]);
  const compactOverflow = await page.$eval(".tetris-content", (element) => element.scrollHeight - element.clientHeight);
  assert(compactOverflow <= 1, `The compact game overflows by ${compactOverflow}px.`);
  await page.screenshot({ path: fileURLToPath(new URL("tetris-compact.png", artifactDirectory)) });

  await page.click('button[aria-label="Close game"]');
  await page.waitForSelector(".tetris-game", { hidden: true });
  process.stdout.write(`Tetris browser verification passed: ${JSON.stringify(inputCommands)}\n`);
} finally {
  await browser.close();
}
