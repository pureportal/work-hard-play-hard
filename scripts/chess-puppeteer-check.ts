import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
import type { ChessClockView, ChessMatchRecord, ServerEvent } from "@workhard/shared";
import { createApplication, type ApplicationContext } from "../apps/server/src/app.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

interface ChessBrowserTracker {
  commandSocket?: WebSocket;
  events: ServerEvent[];
  commands: unknown[];
}

declare global {
  var __chessTracker: ChessBrowserTracker;
}

const distributionDirectory = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
const artifactDirectory = new URL("../artifacts/", import.meta.url);
const indexSource = await readFile(resolve(distributionDirectory, "index.html"));
const assetNames = await readdir(resolve(distributionDirectory, "assets"));
const staticAssets = new Map(await Promise.all(assetNames.map(async (name) => (
  [name, await readFile(resolve(distributionDirectory, "assets", name))] as const
))));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const database = new MemoryDatabase();
let chessTime = Date.parse("2026-09-04T23:00:00.000Z");
let application = await startApplication(database, origin, port);

await mkdir(artifactDirectory, { recursive: true });
const browser = await puppeteer.launch({
  headless: "shell",
  timeout: 120_000,
  protocolTimeout: 120_000,
  args: ["--disable-dev-shm-usage", "--no-first-run"],
});
const issues: string[] = [];

try {
  const leoContext = await browser.createBrowserContext();
  const priyaContext = await browser.createBrowserContext();
  const mayaPage = (await browser.pages())[0]!;
  const leoPage = await leoContext.newPage();
  const priyaPage = await priyaContext.newPage();
  await preparePage(mayaPage, "Maya", issues);
  await preparePage(leoPage, "Leo", issues);
  await preparePage(priyaPage, "Priya", issues);
  await signIn(mayaPage, origin, "maya");
  await signIn(leoPage, origin, "leo");
  assert(issues.length === 0, issues.join("\n"));
  await gatherAtChess(mayaPage, 1_330, 800);
  await gatherAtChess(leoPage, 1_472, 800);
  report("players gathered at chess");

  await openSetup(mayaPage);
  await assertSetupOptions(mayaPage);
  await screenshot(mayaPage, "chess-standard-setup");
  await mayaPage.click(".chess-create-button");
  const standardMatch = await waitForStoredMatch(application, mayaPage, "standard", "open");
  await waitForMatchRow(leoPage, "Open games", "Standard");
  await clickMatchAction(leoPage, "Open games", "Standard", "Join");
  await waitForMatch(leoPage, standardMatch.id);
  await clickMatchAction(mayaPage, "Your games", "Leo Martins", "Play game");
  await waitForMatch(mayaPage, standardMatch.id);
  await assertBoardLayout(mayaPage, "a8", 500);
  await assertBoardLayout(leoPage, "h1", 500);

  await playMove(mayaPage, "e2", "e4");
  await waitForMove(leoPage, standardMatch.id, "e4");
  const illegalRequestId = randomUUID();
  await sendCommand(leoPage, {
    type: "chess.move",
    requestId: illegalRequestId,
    matchId: standardMatch.id,
    move: { from: "e7", to: "e4" },
  });
  await waitForCommandError(leoPage, illegalRequestId, "CHESS_MOVE_ILLEGAL");
  assert(application.store.getChessMatches().find(({ id }) => id === standardMatch.id)?.moves.length === 1, "Illegal move changed the match");
  await playMove(leoPage, "e7", "e5");
  await waitForMove(mayaPage, standardMatch.id, "e5");
  await waitForPersistedMoves(standardMatch.id, 2);
  await screenshot(mayaPage, "chess-standard-game");
  report("standard match reached persistence checkpoint");

  await Promise.all([
    mayaPage.goto("about:blank"),
    leoPage.goto("about:blank"),
  ]);
  await application.app.close();
  application = await startApplication(database, origin, port);
  await reopenWorkspace(mayaPage, origin);
  await reopenWorkspace(leoPage, origin);
  await mayaPage.waitForSelector(".chess-lobby", { visible: true });
  await leoPage.waitForSelector(".chess-lobby", { visible: true });
  await clickMatchAction(mayaPage, "Your games", "Standard", "Play game");
  await waitForMatch(mayaPage, standardMatch.id);
  await clickMatchAction(leoPage, "Your games", "Standard", "Play game");
  await waitForMatch(leoPage, standardMatch.id);
  assert(await moveHistory(mayaPage) === "1.e4e5", "Move history did not survive the server restart");
  report("server restart restored the match");

  await playMove(mayaPage, "d1", "h5");
  await waitForMove(leoPage, standardMatch.id, "Qh5");
  await playMove(leoPage, "b8", "c6");
  await waitForMove(mayaPage, standardMatch.id, "Nc6");
  await playMove(mayaPage, "f1", "c4");
  await waitForMove(leoPage, standardMatch.id, "Bc4");
  await playMove(leoPage, "g8", "f6");
  await waitForMove(mayaPage, standardMatch.id, "Nf6");
  await playMove(mayaPage, "h5", "f7");
  await mayaPage.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("You won"));
  await leoPage.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("You lost"));
  assert((await mayaPage.$eval(".chess-status", (element) => element.textContent ?? "")).includes("Checkmate"), "Checkmate result is missing");
  await closeChess(mayaPage);
  await closeChess(leoPage);
  report("standard rules completed in checkmate");

  await signIn(priyaPage, origin, "priya");
  await gatherAtChess(priyaPage, 1_408, 850);

  await openSetup(mayaPage);
  await clickChoice(mayaPage, ".chess-control-options label", "24 hours");
  await mayaPage.click('.chess-weekend-toggle input[type="checkbox"]');
  await clickChoice(mayaPage, ".chess-access-options label", "Locked");
  await mayaPage.select(".chess-opponent-field select", "user-priya");
  await screenshot(mayaPage, "chess-daily-locked-setup");
  await mayaPage.click(".chess-create-button");
  const dailyMatch = await waitForStoredMatch(application, mayaPage, "daily", "locked");
  assert(dailyMatch.settings.pauseWeekends, "Weekend pause was not persisted");
  await waitForMatchRow(priyaPage, "Invitations", "Weekends paused");
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  assert(!(await leoPage.$eval(".chess-lobby", (element) => element.textContent ?? "")).includes("Weekends paused"), "Locked match was exposed to another player");
  const joinLockedRequestId = randomUUID();
  await sendCommand(leoPage, { type: "chess.match_join", requestId: joinLockedRequestId, matchId: dailyMatch.id });
  await waitForCommandError(leoPage, joinLockedRequestId, "CHESS_MATCH_LOCKED");
  await clickMatchAction(priyaPage, "Invitations", "Weekends paused", "Join");
  await waitForMatch(priyaPage, dailyMatch.id);
  const dailyHeader = await priyaPage.$eval(".chess-game-header", (element) => element.textContent ?? "");
  assert(dailyHeader.includes("24 hours · Weekends paused"), "Weekend-paused control is missing from the game");
  assert((await priyaPage.$$eval(".chess-player-bar time", (elements) => elements.map((element) => element.textContent)))
    .some((clock) => clock?.startsWith("24h")), "The unused daily clock did not start at 24 hours");
  const lockedRequestId = randomUUID();
  await sendCommand(leoPage, { type: "chess.match_open", requestId: lockedRequestId, matchId: dailyMatch.id });
  await waitForCommandError(leoPage, lockedRequestId, "CHESS_MATCH_FORBIDDEN");
  await clickMatchAction(mayaPage, "Your games", "Priya Nair", "Play game");
  await waitForMatch(mayaPage, dailyMatch.id);
  setChessTime("2026-09-05T12:00:00.000Z");
  await waitForClock(priyaPage, (clock) => clock.pausedForWeekend && !clock.running);
  const saturdayClock = await activeClock(priyaPage);
  setChessTime("2026-09-06T22:00:00.000Z");
  await waitForClock(priyaPage, (clock) => clock.pausedForWeekend && !clock.running);
  assert(await activeClock(priyaPage) === saturdayClock, "The clock ran during the weekend");
  await screenshot(mayaPage, "chess-weekend-paused");
  await playMove(mayaPage, "e2", "e4");
  await waitForMove(priyaPage, dailyMatch.id, "e4");
  await waitForPersistedMoves(dailyMatch.id, 1);
  setChessTime("2026-09-07T01:00:00.000Z");
  await waitForClock(priyaPage, (clock) => clock.running && !clock.pausedForWeekend && clock.blackRemainingMs! <= 23 * 60 * 60 * 1_000);
  await priyaPage.waitForFunction(() => !document.querySelector(".chess-player-bar.is-active time svg"));
  await closeChess(mayaPage);
  await priyaPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await assertBoardLayout(priyaPage, "h1", 300);
  await assertViewportContainment(priyaPage, ".chess-game");
  await screenshot(priyaPage, "chess-daily-mobile");
  await closeChess(priyaPage);
  await priyaPage.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  report("locked daily match verified");

  await openSetup(mayaPage);
  await clickChoice(mayaPage, ".chess-control-options label", "Rapid");
  await clickChoice(mayaPage, ".chess-access-options label", "Open");
  await mayaPage.click(".chess-create-button");
  const rapidMatch = await waitForStoredMatch(application, mayaPage, "rapid", "open");
  await waitForMatchRow(leoPage, "Open games", "Rapid");
  await clickMatchAction(leoPage, "Open games", "Rapid", "Join");
  await waitForMatch(leoPage, rapidMatch.id);
  const rapidStart = await activeClock(leoPage);
  setChessTime(new Date(chessTime + 1_250).toISOString());
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_250));
  const rapidLater = await activeClock(leoPage);
  assert(rapidStart !== rapidLater, `Rapid clock did not advance: ${rapidStart}`);
  assert((await leoPage.$eval(".chess-game-header", (element) => element.textContent ?? "")).includes("Rapid · 10 min"), "Rapid time control is missing");
  await screenshot(leoPage, "chess-rapid-game");
  await clickMatchAction(mayaPage, "Your games", "Rapid", "Play game");
  await waitForMatch(mayaPage, rapidMatch.id);
  await playMove(mayaPage, "e2", "e4");
  await waitForMove(leoPage, rapidMatch.id, "e4");
  await waitForPersistedMoves(rapidMatch.id, 1);
  await closeChess(mayaPage);
  await closeChess(leoPage);
  await leoPage.goto("about:blank");
  setChessTime(new Date(chessTime + 11 * 60 * 1_000).toISOString());
  await reopenWorkspace(leoPage, origin);
  await leoPage.waitForSelector(`li[data-match-id="${rapidMatch.id}"] button[aria-label="Review game"]`, { visible: true });
  await leoPage.click(`li[data-match-id="${rapidMatch.id}"] button[aria-label="Review game"]`);
  await waitForMatch(leoPage, rapidMatch.id);
  await leoPage.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("Time expired"));
  await closeChess(leoPage);
  report("rapid match verified");

  setChessTime("2026-09-12T10:00:00.000Z");
  const unpausedDaily = await createOpenMatch(mayaPage, leoPage, "daily");
  await waitForClock(mayaPage, (clock) => clock.running && !clock.pausedForWeekend);
  setChessTime(new Date(chessTime + 24 * 60 * 60 * 1_000 + 1).toISOString());
  await mayaPage.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("Time expired"));
  assert(application.store.getChessMatches().find(({ id }) => id === unpausedDaily.id)?.outcome?.winnerUserId === "user-leo", "A daily clock without weekend pauses did not expire on Sunday");
  await closeChess(mayaPage);
  await closeChess(leoPage);
  report("daily clocks without weekend pauses verified");

  const castling = await createOpenMatch(mayaPage, leoPage);
  await playSequence(mayaPage, leoPage, castling.id, [
    ["e2", "e4", "e4"], ["e7", "e5", "e5"],
    ["g1", "f3", "Nf3"], ["b8", "c6", "Nc6"],
    ["f1", "e2", "Be2"], ["g8", "f6", "Nf6"],
    ["e1", "g1", "O-O"],
  ]);
  assert(await mayaPage.$eval('[data-square="f1"]', (square) => square.getAttribute("aria-label")) === "white rook on f1", "Castling did not move the rook");
  await finishByAgreement(mayaPage, leoPage);

  const enPassant = await createOpenMatch(mayaPage, leoPage);
  await playSequence(mayaPage, leoPage, enPassant.id, [
    ["e2", "e4", "e4"], ["a7", "a6", "a6"],
    ["e4", "e5", "e5"], ["d7", "d5", "d5"], ["e5", "d6", "exd6"],
  ]);
  assert(await mayaPage.$eval('[data-square="d5"]', (square) => square.getAttribute("aria-label")) === "d5", "En passant left the captured pawn on the board");
  await finishByAgreement(mayaPage, leoPage);

  const promotion = await createOpenMatch(mayaPage, leoPage);
  await playSequence(mayaPage, leoPage, promotion.id, [
    ["a2", "a4", "a4"], ["h7", "h5", "h5"],
    ["a4", "a5", "a5"], ["h5", "h4", "h4"],
    ["a5", "a6", "a6"], ["h4", "h3", "h3"],
    ["a6", "b7", "axb7"], ["h3", "g2", "hxg2"],
  ]);
  await playMove(mayaPage, "b7", "a8");
  await mayaPage.waitForSelector(".chess-promotion-picker", { visible: true });
  assert((await mayaPage.$$(".chess-promotion-picker button")).length === 5, "Promotion choices are incomplete");
  await screenshot(mayaPage, "chess-promotion");
  await mayaPage.click('button[aria-label="Promote to knight"]');
  await waitForMove(leoPage, promotion.id, "bxa8=N");
  await finishByAgreement(mayaPage, leoPage);

  const repetition = await createOpenMatch(mayaPage, leoPage);
  await playSequence(mayaPage, leoPage, repetition.id, [
    ["g1", "f3", "Nf3"], ["g8", "f6", "Nf6"],
    ["f3", "g1", "Ng1"], ["f6", "g8", "Ng8"],
    ["g1", "f3", "Nf3"], ["g8", "f6", "Nf6"],
    ["f3", "g1", "Ng1"], ["f6", "g8", "Ng8"],
  ]);
  await mayaPage.click(".chess-claim-button");
  await mayaPage.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("Threefold repetition"));
  await closeChess(mayaPage);
  await closeChess(leoPage);
  report("castling, en passant, promotion, agreed draws, and repetition verified");

  assert(issues.length === 0, issues.join("\n"));
  process.stdout.write("Chess browser verification passed\n");
} finally {
  const closed = await Promise.race([
    browser.close().then(() => true).catch(() => false),
    new Promise<boolean>((resolvePromise) => setTimeout(() => resolvePromise(false), 3_000)),
  ]);
  if (!closed) {
    browser.process()?.kill();
  }
  await application.app.close().catch(() => undefined);
}

async function startApplication(database: MemoryDatabase, origin: string, port: number): Promise<ApplicationContext> {
  const context = await createApplication({
    database,
    seeded: true,
    clientUrl: origin,
    clientOrigins: [origin],
    chessNow: () => new Date(chessTime),
  });
  context.app.get("/*", async (request, reply) => {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname.startsWith("/assets/")) {
      const name = pathname.slice("/assets/".length);
      const asset = staticAssets.get(name);
      return asset ? reply.type(contentType(name)).send(asset) : reply.code(404).send();
    }
    return reply.type("text/html; charset=utf-8").send(indexSource);
  });
  await context.app.listen({ host: "127.0.0.1", port });
  return context;
}

async function preparePage(page: Page, name: string, issues: string[]): Promise<void> {
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401 (Unauthorized)")) {
      issues.push(`${name} console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`${name} page: ${error.message}`));
  await page.evaluateOnNewDocument(() => {
    globalThis.__chessTracker = { events: [], commands: [] };
  });
}

async function signIn(page: Page, origin: string, identifier: string): Promise<void> {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".auth-card", { visible: true });
  await page.type('input[name="identifier"]', identifier);
  await page.type('input[name="password"]', "northstar");
  await page.click('button[type="submit"]');
  await waitForOffice(page);
  await openCommandSocket(page);
}

async function reopenWorkspace(page: Page, origin: string): Promise<void> {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await waitForOffice(page);
  await openCommandSocket(page);
}

async function waitForOffice(page: Page): Promise<void> {
  await page.waitForSelector(".world-canvas canvas", { visible: true });
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const closePeople = await page.$('button[aria-label="Close people"]');
  if (closePeople) {
    await closePeople.click();
  }
}

async function gatherAtChess(page: Page, x: number, y: number): Promise<void> {
  await sendCommand(page, {
    type: "movement.set_destination",
    requestId: randomUUID(),
    floorId: "floor-studio",
    x,
    y,
  });
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 7_000));
  await page.waitForFunction(() => Boolean(document.querySelector('.chess-lobby, select[aria-label="Active interaction"] option[value="game-chess"]')));
  if (await page.$('select[aria-label="Active interaction"]')) await page.select('select[aria-label="Active interaction"]', "game-chess");
  await page.waitForSelector(".chess-lobby", { visible: true });
}

async function openCommandSocket(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/v1/realtime?floorId=floor-studio`);
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;
      if (event.type.startsWith("chess.") || event.type === "command.error") {
        const events = globalThis.__chessTracker.events;
        events.push(event);
        if (events.length > 200) {
          events.splice(0, events.length - 200);
        }
      }
    });
    await new Promise<void>((resolvePromise, reject) => {
      socket.addEventListener("open", () => resolvePromise(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Realtime observer failed")), { once: true });
    });
    globalThis.__chessTracker.commandSocket = socket;
  });
}

async function sendCommand(page: Page, command: unknown): Promise<void> {
  await page.evaluate((source) => {
    const socket = globalThis.__chessTracker.commandSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Realtime socket is not connected");
    }
    globalThis.__chessTracker.commands.push(source);
    socket.send(JSON.stringify(source));
  }, command);
}

async function waitForStoredMatch(
  application: ApplicationContext,
  page: Page,
  timeControl: ChessMatchRecord["settings"]["timeControl"],
  access: ChessMatchRecord["settings"]["access"],
): Promise<ChessMatchRecord> {
  let match: ChessMatchRecord | undefined;
  for (let attempt = 0; attempt < 100 && !match; attempt += 1) {
    match = application.store.getChessMatches().find((candidate) => (
      candidate.creatorUserId === "user-maya"
      && candidate.status === "waiting"
      && candidate.settings.timeControl === timeControl
      && candidate.settings.access === access
    ));
    if (!match) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
  }
  if (!match) {
    const diagnostics = await page.evaluate(() => ({
      commands: globalThis.__chessTracker.commands,
      events: globalThis.__chessTracker.events.slice(-8),
      text: document.body.innerText,
    }));
    throw new Error(`Stored ${timeControl} ${access} match is missing: ${JSON.stringify(diagnostics)}`);
  }
  return match;
}

async function waitForMatch(page: Page, matchId: string): Promise<void> {
  await page.waitForFunction((expectedId) => document.querySelector<HTMLElement>(".chess-game")?.dataset.matchId === expectedId, {}, matchId);
}

async function waitForMatchRow(page: Page, heading: string, rowText: string): Promise<void> {
  await page.waitForFunction((sectionHeading, expectedRowText) => (
    [...document.querySelectorAll<HTMLElement>(".chess-match-list")].some((section) => (
      section.querySelector("h3")?.textContent?.trim() === sectionHeading
      && [...section.querySelectorAll("li")].some((row) => row.textContent?.includes(expectedRowText))
    ))
  ), {}, heading, rowText);
}

async function clickMatchAction(page: Page, heading: string, rowText: string, action: string): Promise<void> {
  const clicked = await page.evaluate((sectionHeading, expectedRowText, expectedAction) => {
    const section = [...document.querySelectorAll<HTMLElement>(".chess-match-list")]
      .find((candidate) => candidate.querySelector("h3")?.textContent?.trim() === sectionHeading);
    const row = [...section?.querySelectorAll<HTMLElement>("li") ?? []]
      .find((candidate) => candidate.textContent?.includes(expectedRowText));
    const button = [...row?.querySelectorAll<HTMLButtonElement>("button") ?? []]
      .find((candidate) => candidate.getAttribute("aria-label") === expectedAction || candidate.textContent?.trim() === expectedAction);
    button?.click();
    return Boolean(button);
  }, heading, rowText, action);
  assert(clicked, `Could not click ${action} in ${heading} for ${rowText}`);
}

async function clickChoice(page: Page, selector: string, text: string): Promise<void> {
  const clicked = await page.evaluate((labelSelector, expectedText) => {
    const label = [...document.querySelectorAll<HTMLElement>(labelSelector)]
      .find((candidate) => candidate.textContent?.includes(expectedText));
    label?.click();
    return Boolean(label);
  }, selector, text);
  assert(clicked, `Could not choose ${text}`);
}

async function playMove(page: Page, from: string, to: string): Promise<void> {
  await page.click(`[data-square="${from}"]`);
  await page.waitForFunction((square) => document.querySelector(`[data-square="${square}"]`)?.classList.contains("is-selected"), {}, from);
  await page.click(`[data-square="${to}"]`);
}

async function waitForMove(page: Page, matchId: string, san: string): Promise<void> {
  await page.waitForFunction((expectedId, expectedSan) => (
    document.querySelector<HTMLElement>(".chess-game")?.dataset.matchId === expectedId
    && [...document.querySelectorAll(".chess-moves li strong")].filter((element) => element.textContent).at(-1)?.textContent === expectedSan
  ), {}, matchId, san);
}

async function waitForCommandError(page: Page, requestId: string, code: string): Promise<void> {
  try {
    await page.waitForFunction((id, expectedCode) => globalThis.__chessTracker.events.some((event) => (
      event.type === "command.error" && event.requestId === id && event.code === expectedCode
    )), {}, requestId, code);
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      errors: globalThis.__chessTracker.events.filter((event) => event.type === "command.error"),
      commands: globalThis.__chessTracker.commands.slice(-5),
      socketState: globalThis.__chessTracker.commandSocket?.readyState,
    }));
    throw new Error(`Expected ${code}: ${JSON.stringify(diagnostics)}`, { cause: error });
  }
}

async function waitForPersistedMoves(matchId: string, count: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const saved = await database.loadWorkspaceState();
    if (saved?.store.chessMatches.find(({ id }) => id === matchId)?.moves.length === count) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("Chess action was not saved immediately");
}

function setChessTime(value: string): void {
  chessTime = Date.parse(value);
  application.runtime.tick();
}

async function waitForClock(page: Page, predicate: (clock: ChessClockView) => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const clock = await page.evaluate(() => globalThis.__chessTracker.events.findLast((event) => event.type === "chess.match_state")?.match.clock);
    if (clock && predicate(clock)) {
      return;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("Chess clock did not reach the expected state");
}

async function openSetup(page: Page): Promise<void> {
  if (await page.$('select[aria-label="Active interaction"]')) await page.select('select[aria-label="Active interaction"]', "game-chess");
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".chess-lobby button")].find((button) => button.textContent === "Players")!.click());
  await page.click(".chess-new-button");
}

async function createOpenMatch(white: Page, black: Page, timeControl: "standard" | "daily" = "standard"): Promise<ChessMatchRecord> {
  const label = timeControl === "standard" ? "Standard" : "24 hours";
  await openSetup(white);
  await clickChoice(white, ".chess-control-options label", label);
  if (timeControl === "daily" && await white.$eval('.chess-weekend-toggle input', (input) => (input as HTMLInputElement).checked)) {
    await white.click('.chess-weekend-toggle input');
  }
  await clickChoice(white, ".chess-access-options label", "Open");
  await white.click(".chess-create-button");
  const match = await waitForStoredMatch(application, white, timeControl, "open");
  await waitForMatchRow(black, "Open games", label);
  await clickMatchAction(black, "Open games", label, "Join");
  await waitForMatch(black, match.id);
  await white.click(`li[data-match-id="${match.id}"] .chess-play-button`);
  await waitForMatch(white, match.id);
  return match;
}

async function playSequence(white: Page, black: Page, matchId: string, moves: [string, string, string][]): Promise<void> {
  for (const [index, [from, to, san]] of moves.entries()) {
    await playMove(index % 2 === 0 ? white : black, from, to);
    await waitForMove(index % 2 === 0 ? black : white, matchId, san);
  }
}

async function finishByAgreement(white: Page, black: Page): Promise<void> {
  await white.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".chess-game-actions button")].find((button) => button.textContent === "Offer draw")?.click());
  await black.waitForSelector(".chess-draw-response", { visible: true });
  await black.click(".chess-draw-response .primary-button");
  await white.waitForFunction(() => document.querySelector(".chess-status")?.textContent?.includes("By agreement"));
  await closeChess(white);
  await closeChess(black);
}

async function closeChess(page: Page): Promise<void> {
  await page.click('button[aria-label="Close chess"]');
  await page.waitForSelector(".chess-game", { hidden: true });
  await page.waitForSelector(".chess-lobby", { visible: true });
}

async function moveHistory(page: Page): Promise<string> {
  return page.$eval(".chess-moves ol", (element) => (element.textContent ?? "").replace(/\s/g, ""));
}

async function activeClock(page: Page): Promise<string> {
  return page.$eval(".chess-player-bar.is-active time", (element) => element.textContent?.trim() ?? "");
}

async function assertSetupOptions(page: Page): Promise<void> {
  const options = await page.$$eval(".chess-control-options label", (labels) => labels.map((label) => label.textContent?.replace(/\s+/g, " ").trim()));
  assert(options.some((option) => option?.includes("Standard") && option.includes("No clock")), "Standard chess option is missing");
  assert(options.some((option) => option?.includes("Rapid") && option.includes("10 min")), "Rapid chess option is missing");
  assert(options.some((option) => option?.includes("24 hours") && option.includes("Per move")), "24-hour chess option is missing");
}

async function assertBoardLayout(page: Page, firstSquare: string, minimumWidth: number): Promise<void> {
  const metrics = await page.$eval(".chess-board", (element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      firstSquare: element.querySelector<HTMLElement>(".chess-square")?.dataset.square,
    };
  });
  assert(Math.abs(metrics.width - metrics.height) <= 1, `Chess board is not square: ${metrics.width} × ${metrics.height}`);
  assert(metrics.width >= minimumWidth, `Chess board is too small: ${metrics.width}`);
  assert(metrics.firstSquare === firstSquare, `Board orientation starts at ${metrics.firstSquare}, expected ${firstSquare}`);
}

async function assertViewportContainment(page: Page, selector: string): Promise<void> {
  const overflow = await page.$eval(selector, (element) => {
    const bounds = element.getBoundingClientRect();
    return {
      left: Math.max(0, -bounds.left),
      top: Math.max(0, -bounds.top),
      right: Math.max(0, bounds.right - innerWidth),
      bottom: Math.max(0, bounds.bottom - innerHeight),
    };
  });
  assert(Object.values(overflow).every((value) => value <= 1), `${selector} overflows the viewport: ${JSON.stringify(overflow)}`);
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, artifactDirectory)),
    fullPage: true,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function report(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Test port is unavailable");
  }
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[extname(path)] ?? "application/octet-stream";
}
