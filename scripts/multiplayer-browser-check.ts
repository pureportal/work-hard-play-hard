import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createServer } from "node:net";
import { chromium, type Page } from "playwright-core";
import type { ClientCommand, ServerEvent } from "../packages/shared/src/index.js";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

declare global {
  var __multiplayer: { sockets: WebSocket[]; events: ServerEvent[]; commands: ClientCommand[]; requestTimes: Record<string, number>; roundTrips: number[] };
}

const directory = resolve("../client/dist");
const artifacts = resolve("../../artifacts/multiplayer");
const delayMs = Number(process.env.MULTIPLAYER_DELAY_MS ?? 80);
const port = await new Promise<number>((done, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    assert(address && typeof address === "object");
    probe.close(() => done(address.port));
  });
});
const origin = `http://127.0.0.1:${port}`;
const application = await createTestApplication({ database: new MemoryDatabase(), fixture: true, clientUrl: origin, clientOrigins: [origin] });
const delayed = new Set<ReturnType<typeof setTimeout>>();
const defer = (action: () => void) => {
  const timer = setTimeout(() => { delayed.delete(timer); action(); }, delayMs);
  delayed.add(timer);
};
const connect = application.runtime.connect.bind(application.runtime);
application.runtime.connect = (userId, floorId, send) => connect(userId, floorId, (event) => defer(() => send(event)));
const handleCommand = application.runtime.handleCommand.bind(application.runtime);
application.runtime.handleCommand = (peerId, command) => defer(() => handleCommand(peerId, command));
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
application.app.get("/*", async (request, reply) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const path = resolve(directory, pathname === "/" ? "index.html" : `.${pathname}`);
  if (!path.startsWith(directory + sep)) return reply.code(403).send();
  try {
    return reply.type(types[extname(path)] ?? "application/octet-stream").send(await readFile(path));
  } catch {
    return reply.code(404).send();
  }
});
await application.app.listen({ host: "127.0.0.1", port });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const checks: string[] = [];
await mkdir(artifacts, { recursive: true });

async function login(identifier: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.__multiplayer = { sockets: [], events: [], commands: [], requestTimes: {}, roundTrips: [] };
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        globalThis.__multiplayer.sockets.push(this);
        this.addEventListener("message", (message) => {
          const event = JSON.parse(String(message.data)) as ServerEvent;
          globalThis.__multiplayer.events.push(event);
          if (event.type === "command.ack") {
            const sentAt = globalThis.__multiplayer.requestTimes[event.requestId];
            if (sentAt !== undefined) {
              globalThis.__multiplayer.roundTrips.push(performance.now() - sentAt);
              delete globalThis.__multiplayer.requestTimes[event.requestId];
            }
          }
        });
      }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === "string") {
          const command = JSON.parse(data) as ClientCommand;
          globalThis.__multiplayer.commands.push(command);
          if ("requestId" in command) globalThis.__multiplayer.requestTimes[command.requestId] = performance.now();
        }
        super.send(data);
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator('input[name="identifier"]').fill(identifier);
  await page.locator('input[name="password"]').fill("northstar");
  await page.locator('button[type="submit"]').click();
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const dailyBonus = page.getByRole("button", { name: "Close daily bonus", exact: true });
  await dailyBonus.waitFor({ timeout: 5_000 });
  await dailyBonus.click();
  const tourSkip = page.locator(".guide-skip");
  await tourSkip.waitFor({ timeout: 5_000 });
  await tourSkip.click();
  const build = page.getByRole("button", { name: "Close build", exact: true });
  if (await build.count()) await build.click();
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.count()) await people.click();
  console.log(`${identifier}: connected`);
  return page;
}

function position(x: number, y: number, userId?: string) {
  application.runtime.restorePlayers(application.runtime.serializePlayers().map((player) => !userId || player.userId === userId ? { ...player, x, y } : player));
  application.runtime.runTickForTest();
  application.runtime.runTickForTest();
}

async function chooseArea(page: Page, objectId: string, selector: string) {
  await page.waitForFunction(({ objectId, selector }) => Boolean(document.querySelector(`select[aria-label="Active interaction"] option[value="${objectId}"]`)) || Boolean(document.querySelector(selector)), { objectId, selector });
  const selection = page.getByRole("combobox", { name: "Active interaction" });
  if (await selection.count()) await selection.selectOption(objectId);
  await page.locator(selector).waitFor();
}

async function waitForMoves(page: Page, count: number) {
  await page.waitForFunction((count) => {
    const state = globalThis.__multiplayer.events.findLast((event) => event.type === "game.state");
    return state?.type === "game.state" && state.definitionId === "game-tic-tac-toe" && state.moveNumber === count;
  }, count);
}

async function leave(page: Page, chess = false) {
  await page.getByRole("button", { name: chess ? "Close chess" : "Close game", exact: true }).click();
  const confirmation = page.getByRole("button", { name: "Leave game", exact: true });
  if (await confirmation.count()) await confirmation.click();
  await page.locator(".game-backdrop").waitFor({ state: "hidden" });
}

try {
  assert.equal((await fetch(`${origin}/v1/health/ready`)).status, 200);
  const maya = await login("maya");
  const leo = await login("leo");
  position(1248, 636);
  await Promise.all([chooseArea(maya, "object-falling-blocks", ".falling-blocks-lobby"), chooseArea(leo, "object-falling-blocks", ".falling-blocks-lobby")]);
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Play", exact: true }).waitFor();
  const feedback = await maya.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>(".falling-blocks-start-button")!;
    const before = globalThis.__multiplayer.commands.filter((command) => command.type === "game.start").length;
    button.click();
    button.click();
    return { count: globalThis.__multiplayer.commands.filter((command) => command.type === "game.start").length - before, disabled: button.disabled };
  });
  assert.equal(feedback.count, 1);
  await maya.waitForFunction(() => Boolean(document.querySelector<HTMLButtonElement>(".falling-blocks-start-button")?.disabled) || Boolean(document.querySelector(".falling-blocks-game")));
  await Promise.all([maya.locator(".falling-blocks-game").waitFor(), leo.locator(".falling-blocks-game").waitFor()]);
  const firstRoundId = await maya.evaluate(() => globalThis.__multiplayer.events.findLast((event) => event.type === "game.round_started")?.round.id);
  assert(firstRoundId);
  assert.equal(await leo.evaluate(() => globalThis.__multiplayer.events.findLast((event) => event.type === "game.round_started")?.round.id), firstRoundId);
  await maya.screenshot({ path: resolve(artifacts, "falling-blocks-multiplayer.png") });
  await maya.locator(".falling-blocks-game").focus();
  const predictedMove = await maya.evaluate(async () => {
    const before = [...document.querySelectorAll(".falling-blocks-cell.is-active")]
      .map((cell) => [...cell.parentElement!.children].indexOf(cell) % 10);
    const receivedStates = globalThis.__multiplayer.events.filter((event) => event.type === "game.state").length;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowLeft", key: "ArrowLeft", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowLeft", key: "ArrowLeft", bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = [...document.querySelectorAll(".falling-blocks-cell.is-active")]
      .map((cell) => [...cell.parentElement!.children].indexOf(cell) % 10);
    return { before, after, receivedStates,
      currentStates: globalThis.__multiplayer.events.filter((event) => event.type === "game.state").length };
  });
  assert.deepEqual(predictedMove.after, predictedMove.before.map((column) => column - 1));
  assert.equal(predictedMove.currentStates, predictedMove.receivedStates);
  for (let drop = 0; drop < 30; drop += 1) {
    const count = await maya.evaluate(() => globalThis.__multiplayer.events.filter((event) => event.type === "game.state").length);
    await maya.keyboard.press("Space");
    await maya.waitForFunction((count) => globalThis.__multiplayer.events.filter((event) => event.type === "game.state").length > count, count);
    if (await maya.evaluate(() => {
      const state = globalThis.__multiplayer.events.findLast((event) => event.type === "game.state");
      return state?.type === "game.state" && state.definitionId === "game-falling-blocks" && !state.running;
    })) break;
  }
  await maya.getByRole("button", { name: "Back to lobby", exact: true }).click();
  await chooseArea(maya, "object-falling-blocks", ".falling-blocks-lobby");
  assert.equal(await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Players", exact: true }).getAttribute("aria-pressed"), "true");
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Solo", exact: true }).click();
  await maya.locator(".falling-blocks-lobby").getByRole("button", { name: "Play", exact: true }).click();
  await maya.locator(".falling-blocks-game").waitFor();
  const replayId = await maya.evaluate(() => globalThis.__multiplayer.events.findLast((event) => event.type === "game.round_started")?.round.id);
  assert.notEqual(replayId, firstRoundId);
  await leo.evaluate(() => globalThis.__multiplayer.sockets.at(-1)!.close());
  await leo.waitForFunction(() => globalThis.__multiplayer.sockets.at(-1)?.readyState === WebSocket.CLOSED);
  application.runtime.runTickForTest(15_000);
  await maya.waitForFunction((roundId) => globalThis.__multiplayer.events.some((event) => event.type === "game.round_completed" && event.round.id === roundId), firstRoundId);
  assert.equal(await maya.locator(".falling-blocks-game").count(), 1);
  await leave(maya);
  checks.push("Falling Blocks: immediate movement, shared start, top-out, replay and disconnect grace");
  console.log(checks.at(-1));

  for (const variant of ["Classic", "Ultimate", "Stacking"]) {
    await Promise.all([chooseArea(maya, "object-tic-tac-toe", ".tic-tac-toe-lobby"), chooseArea(leo, "object-tic-tac-toe", ".tic-tac-toe-lobby")]);
    await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Players", exact: true }).click();
    await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: variant, exact: true }).click();
    await maya.locator(".tic-tac-toe-lobby").getByRole("button", { name: "Play", exact: true }).click();
    await Promise.all([maya.locator(".tic-tac-toe-game").waitFor(), leo.locator(".tic-tac-toe-game").waitFor()]);
    if (variant === "Classic") {
      for (const [index, cell] of [0, 3, 1, 4, 2].entries()) {
        const page = index % 2 === 0 ? maya : leo;
        await page.locator('.tic-tac-toe-board [role="gridcell"]').nth(cell).click();
        await Promise.all([waitForMoves(maya, index + 1), waitForMoves(leo, index + 1)]);
      }
      assert.equal(await maya.locator(".tic-tac-toe-status").textContent(), "You win");
      await Promise.all([maya.getByRole("button", { name: "Back to lobby" }).click(), leo.getByRole("button", { name: "Back to lobby" }).click()]);
    } else {
      await maya.locator('.tic-tac-toe-game [role="gridcell"]:not(:disabled)').first().click();
      await waitForMoves(leo, 1);
      await leo.locator('.tic-tac-toe-game [role="gridcell"]:not(:disabled)').first().click();
      await waitForMoves(maya, 2);
      await maya.setViewportSize({ width: 390, height: 844 });
      await maya.screenshot({ path: resolve(artifacts, `tic-tac-toe-${variant.toLowerCase()}-mobile.png`) });
      await maya.setViewportSize({ width: 1440, height: 1000 });
      await maya.getByRole("button", { name: "Forfeit game", exact: true }).click();
      await maya.getByRole("button", { name: "Leave game", exact: true }).click();
      await leo.getByRole("button", { name: "Back to lobby" }).click();
    }
    checks.push(`Tic-Tac-Toe ${variant}: shared start, turns, finish and lobby return`);
    console.log(checks.at(-1));
  }

  position(1320, 720);
  await Promise.all([chooseArea(maya, "object-chess", ".chess-lobby"), chooseArea(leo, "object-chess", ".chess-lobby")]);
  await maya.locator(".chess-lobby").getByRole("button", { name: "Players", exact: true }).click();
  await maya.getByRole("button", { name: "New game", exact: true }).click();
  await maya.getByRole("button", { name: "Create game", exact: true }).click();
  await leo.locator(".chess-lobby").getByRole("button", { name: "Join", exact: true }).click();
  await leo.locator(".chess-game").waitFor();
  await maya.locator(".chess-lobby").getByRole("button", { name: "Play game", exact: true }).click();
  await maya.locator(".chess-game").waitFor();
  const matchId = await maya.locator(".chess-game").getAttribute("data-match-id");
  const mirror = await maya.context().newPage();
  await mirror.goto(origin);
  await mirror.locator(`.chess-game[data-match-id="${matchId}"]`).waitFor();
  await leave(mirror, true);
  await maya.locator(".chess-game").waitFor({ state: "hidden" });
  await mirror.close();
  await chooseArea(maya, "object-chess", ".chess-lobby");
  await maya.locator(".chess-lobby").getByRole("button", { name: "Play game", exact: true }).click();
  await maya.locator(".chess-game").waitFor();
  await maya.locator('[data-square="f2"]').click();
  await maya.locator('[data-square="f3"]').click();
  await leo.waitForFunction(() => globalThis.__multiplayer.events.findLast((event) => event.type === "chess.match_state")?.match.moves.length === 1);
  await maya.evaluate(() => globalThis.__multiplayer.sockets.at(-1)!.close());
  await maya.locator(".chess-game").waitFor({ state: "hidden" });
  await maya.locator(`.chess-game[data-match-id="${matchId}"]`).waitFor();
  for (const [index, page, from, to] of [[2, leo, "e7", "e5"], [3, maya, "g2", "g4"], [4, leo, "d8", "h4"]] as const) {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
    await Promise.all([maya, leo].map((client) => client.waitForFunction((count) => globalThis.__multiplayer.events.findLast((event) => event.type === "chess.match_state")?.match.moves.length === count, index)));
  }
  await maya.getByRole("button", { name: "Back to lobby", exact: true }).waitFor();
  await maya.screenshot({ path: resolve(artifacts, "chess-completed.png") });
  await leave(maya, true);
  await maya.locator(".chess-lobby").getByRole("button", { name: "Review game", exact: true }).click();
  await maya.locator(`.chess-game[data-match-id="${matchId}"]`).waitFor();
  checks.push("Chess: create, join, shared tab closure, synchronized moves, automatic reconnect, checkmate and saved result reopening");
  console.log(checks.at(-1));
  assert.deepEqual(errors, []);
  const observations = await maya.evaluate(() => globalThis.__multiplayer.roundTrips);
  observations.sort((left, right) => left - right);
  const report = { checks, errors, injectedDelayEachWayMs: delayMs, acknowledgedRequestRoundTripMs: { samples: observations.length, median: observations[Math.floor(observations.length / 2)], p95: observations[Math.floor(observations.length * 0.95)] } };
  await writeFile(resolve(artifacts, "browser-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  for (const [index, context] of browser.contexts().entries()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: resolve(artifacts, `failure-${index}.png`) });
      await writeFile(resolve(artifacts, `failure-${index}.json`), JSON.stringify(await page.evaluate(() => ({
        events: globalThis.__multiplayer.events.filter((event) => event.type !== "world.snapshot").slice(-10),
        commands: globalThis.__multiplayer.commands.slice(-10),
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => element.textContent),
      })), null, 2));
    }
  }
  throw error;
} finally {
  for (const timer of delayed) clearTimeout(timer);
  await browser.close();
  application.runtime.stop();
  await application.app.close();
}
