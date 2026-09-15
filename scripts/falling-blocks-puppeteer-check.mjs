import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const gameMode = process.env.FALLING_BLOCKS_MODE ?? "classic";
const artifactDirectory = new URL("../artifacts/", import.meta.url);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertContained(page, selectors) {
  const failures = await page.evaluate((targets) => targets.flatMap((selector) => {
    const element = document.querySelector(selector);
    const game = document.querySelector(".falling-blocks-game");
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
  return page.evaluate((startIndex) => globalThis.__fallingBlocksCommands
    .slice(startIndex)
    .filter((command) => command.type === "game.command")
    .map((command) => command.command), start);
}

async function selectCabinet(page, objectId) {
  await page.waitForFunction((id) => globalThis.__fallingBlocksEvents.some((event) =>
    event.type === "game.lobby_updated" && event.lobby.objectId === id && event.lobby.participantIds.includes("user-maya")), {}, objectId);
  if (await page.$('select[aria-label="Active interaction"]')) {
    await page.select('select[aria-label="Active interaction"]', objectId);
  }
  await page.waitForSelector(".falling-blocks-lobby", { visible: true });
}

async function moveTo(page, x, y) {
  await page.evaluate((position) => {
    const socket = globalThis.__fallingBlocksSockets.findLast((candidate) =>
      candidate.readyState === WebSocket.OPEN && candidate.url.includes("/v1/realtime"));
    socket.send(JSON.stringify({ type: "movement.set_destination", requestId: crypto.randomUUID(), floorId: "floor-studio", ...position }));
  }, { x, y });
  await page.waitForFunction((targetX, targetY) => {
    const snapshot = globalThis.__fallingBlocksEvents.findLast((event) => event.type === "world.snapshot");
    const player = snapshot?.players.find((candidate) => candidate.userId === "user-maya");
    return player && Math.hypot(player.x - targetX, player.y - targetY) < 4;
  }, { timeout: 45_000 }, x, y);
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await puppeteer.launch({
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 120_000,
  args: ["--disable-dev-shm-usage", "--no-first-run"],
});
const [page] = await browser.pages();

try {
  assert(page, "Chromium did not create a page.");
  page.on("pageerror", (error) => process.stderr.write(`${error.message}\n`));
  page.setDefaultTimeout(30_000);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.__fallingBlocksCommands = [];
    globalThis.__fallingBlocksSockets = [];
    globalThis.__fallingBlocksEvents = [];
    class TrackingWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        if (protocols === undefined) {
          super(url);
        } else {
          super(url, protocols);
        }
        globalThis.__fallingBlocksSockets.push(this);
        this.addEventListener("message", (message) => {
          globalThis.__fallingBlocksEvents.push(JSON.parse(String(message.data)));
          if (globalThis.__fallingBlocksEvents.length > 2000) globalThis.__fallingBlocksEvents.shift();
        });
      }

      send(data) {
        try {
          globalThis.__fallingBlocksCommands.push(JSON.parse(String(data)));
        } catch {
          globalThis.__fallingBlocksCommands.push({ type: "unparsed" });
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
  process.stdout.write("Signed in.\n");
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const cabinets = await page.evaluate(async () => {
    const data = await (await fetch("/v1/bootstrap")).json();
    return data.layouts.find((layout) => layout.floorId === "floor-studio").objects.filter((object) => object.assetId === "equipment-falling-blocks");
  });
  assert(cabinets.length > 0, "No Falling Blocks cabinets are placed.");
  const originalPosition = await page.evaluate(() => globalThis.__fallingBlocksEvents.findLast((event) => event.type === "world.snapshot")?.players.find((player) => player.userId === "user-maya"));
  await moveTo(page, cabinets[0].x - 38, cabinets[0].y + 44);
  await selectCabinet(page, cabinets[0].id);
  await page.select(".falling-blocks-settings select", gameMode);
  await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-interaction.png", artifactDirectory)) });
  await page.click(".falling-blocks-start-button");
  await page.waitForSelector(".falling-blocks-game", { visible: true });
  process.stdout.write(`Playing ${cabinets[0].id}.\n`);
  await page.waitForSelector(".falling-blocks-piece-preview.has-piece", { visible: true });
  const settings = await page.evaluate(() => globalThis.__fallingBlocksEvents.findLast((event) => event.type === "game.round_started")?.round.fallingBlocks?.settings);
  assert(settings?.mode === gameMode, "The selected mode did not reach the shared round.");

  const desktopBoard = await page.$eval(".falling-blocks-board", (element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  assert(desktopBoard.width >= 280 && desktopBoard.height >= 560, "The board does not use the desktop viewport.");
  assert(await page.$(".falling-blocks-controls") === null, "Controls should start hidden.");
  assert(await page.$(".falling-blocks-game kbd") === null, "Key hints should start hidden.");
  await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-controls-hidden.png", artifactDirectory)) });
  await page.click('button[aria-label="Show controls"]');
  await assertContained(page, [".falling-blocks-left-rail", ".falling-blocks-board", ".falling-blocks-sidebar", ".falling-blocks-controls"]);

  const inputStart = await page.evaluate(() => globalThis.__fallingBlocksCommands.length);
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction((start) => globalThis.__fallingBlocksCommands
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
  await page.waitForFunction(() => document.querySelector(".falling-blocks-hold")?.classList.contains("is-locked"));
  const heldPieceLabel = await page.$eval(".falling-blocks-hold .falling-blocks-piece-preview", (element) => element.getAttribute("aria-label"));
  assert(heldPieceLabel?.startsWith("Held "), "The held piece did not update.");
  const holdCountAfter = (await gameCommands(page)).filter((command) => command === "hold").length;
  assert(holdCountAfter === holdCountBefore + 1, "The first hold command was not sent once.");
  await page.keyboard.press("c");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert((await gameCommands(page)).filter((command) => command === "hold").length === holdCountAfter, "Hold repeated before lock.");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => Number(document.querySelector(".falling-blocks-stats .score dd")?.textContent.replaceAll(",", "")) > 0);
  await page.waitForFunction(() => !document.querySelector(".falling-blocks-hold")?.classList.contains("is-locked"));
  await page.keyboard.press("c");
  await page.waitForFunction((previousCount) => globalThis.__fallingBlocksCommands
    .filter((command) => command.type === "game.command" && command.command === "hold").length > previousCount, {}, holdCountAfter);

  if (gameMode !== "classic") {
    await page.waitForFunction((mode) => {
      const state = globalThis.__fallingBlocksEvents.findLast((event) => event.type === "game.state");
      return mode === "speed-up" ? state?.fallIntervalMs <= 610 : document.querySelectorAll(".falling-blocks-cell.is-hard").length >= 10;
    }, { timeout: 45_000 }, gameMode);
    process.stdout.write(`Verified ${gameMode} progression.\n`);
  }
  await page.screenshot({ path: fileURLToPath(new URL(`falling-blocks-${gameMode}-desktop.png`, artifactDirectory)) });
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
  await assertContained(page, [".falling-blocks-left-rail", ".falling-blocks-board", ".falling-blocks-sidebar", ".falling-blocks-controls"]);
  await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-landscape.png", artifactDirectory)) });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const touchSession = await page.createCDPSession();
  await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const touchPoints = await page.evaluate(() => ['button[aria-label="Move left"]', 'button[aria-label="Rotate clockwise"]'].map((selector, index) => {
    const bounds = document.querySelector(selector).getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: index + 1 };
  }));
  const touchStart = await page.evaluate(() => globalThis.__fallingBlocksCommands.length);
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoints[0]] });
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await touchSession.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const touchCommands = await gameCommands(page, touchStart);
  assert(touchCommands.includes("rotate") && touchCommands.filter((command) => command === "left").length >= 3, "Touch hold and simultaneous rotation did not work.");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert((await gameCommands(page, touchStart)).length === touchCommands.length, "Touch movement continued after release.");
  await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-mobile.png", artifactDirectory)) });
  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
  await assertContained(page, [".falling-blocks-left-rail", ".falling-blocks-board", ".falling-blocks-sidebar", ".falling-blocks-controls"]);
  const compactOverflow = await page.$eval(".falling-blocks-content", (element) => element.scrollHeight - element.clientHeight);
  assert(compactOverflow <= 1, `The compact game overflows by ${compactOverflow}px.`);
  const undersizedControls = await page.$$eval(".falling-blocks-controls button", (buttons) => buttons.filter((button) => {
    const bounds = button.getBoundingClientRect();
    return bounds.width < 44 || bounds.height < 44;
  }).map((button) => button.getAttribute("aria-label")));
  assert(undersizedControls.length === 0, `Touch controls too small: ${undersizedControls.join(", ")}`);
  await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-compact.png", artifactDirectory)) });

  await page.click('button[aria-label="Close game"]');
  await assertContained(page, [".game-exit-prompt", ".game-exit-prompt .primary-button", ".game-exit-prompt .secondary-button"]);
  await page.locator('.game-exit-prompt button::-p-text(Leave game)').click();
  await page.waitForSelector(".falling-blocks-game", { hidden: true });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (const cabinet of cabinets.slice(1)) {
    process.stdout.write(`Checking ${cabinet.id}.\n`);
    await moveTo(page, cabinet.x + 128, cabinet.y + 56);
    await selectCabinet(page, cabinet.id);
    await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-overlapping-cabinets.png", artifactDirectory)) });
    await page.click(".falling-blocks-start-button");
    await page.waitForSelector(".falling-blocks-game", { visible: true });
    await page.keyboard.press("Space");
    await page.waitForFunction(() => Number(document.querySelector(".falling-blocks-stats .score dd")?.textContent.replaceAll(",", "")) > 0);
    const started = await page.evaluate(() => globalThis.__fallingBlocksCommands.findLast((command) => command.type === "game.start"));
    assert(started.objectId === cabinet.id, "Play started the wrong cabinet.");
    await page.click('button[aria-label="Close game"]');
    await assertContained(page, [".game-exit-prompt", ".game-exit-prompt .primary-button", ".game-exit-prompt .secondary-button"]);
    await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-exit.png", artifactDirectory)) });
    await page.locator('.game-exit-prompt button::-p-text(Leave game)').click();
    await page.waitForSelector(".falling-blocks-game", { hidden: true });
  }
  if (originalPosition) await moveTo(page, originalPosition.x, originalPosition.y);
  process.stdout.write(`Verified ${cabinets.length} saved cabinets.\n`);
  process.stdout.write(`Falling Blocks browser verification passed: ${JSON.stringify(inputCommands)}\n`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: fileURLToPath(new URL("falling-blocks-failure.png", artifactDirectory)) });
    process.stderr.write(JSON.stringify(await page.evaluate(() => ({
      commands: globalThis.__fallingBlocksCommands?.filter((command) => command.type.startsWith("game.")).slice(-8),
      events: globalThis.__fallingBlocksEvents?.filter((event) => event.type === "command.error" || event.type === "game.round_started" || event.type === "game.round_completed").slice(-6),
      actions: document.querySelector(".interaction-panel")?.textContent,
    })), null, 2));
  }
  throw error;
} finally {
  if (page && !page.isClosed()) {
    await page.evaluate(() => {
      const round = globalThis.__fallingBlocksEvents?.findLast((event) => event.type === "game.round_started")?.round;
      if (!round || globalThis.__fallingBlocksEvents.some((event) => event.type === "game.round_completed" && event.round.id === round.id)) return;
      const socket = globalThis.__fallingBlocksSockets.findLast((candidate) => candidate.readyState === WebSocket.OPEN && candidate.url.includes("/v1/realtime"));
      socket?.send(JSON.stringify({ type: "game.end", requestId: crypto.randomUUID(), roundId: round.id }));
    });
  }
  await browser.close();
}
