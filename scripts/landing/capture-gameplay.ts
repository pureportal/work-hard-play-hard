import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { createInitialData } from "../../apps/server/src/initial-data.js";
import { createTestData } from "../../apps/server/src/testing/workspace-data.js";
import { WorkspaceStore } from "../../apps/server/src/store.js";
import { WorldRuntime } from "../../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../../apps/server/src/protocol.js";
import { MemoryDatabase } from "../../apps/server/src/persistence/memory-database.js";
import { saveWorkObject } from "../../apps/server/src/work/work-object-commands.js";
import { DEFAULT_CHARACTER_APPEARANCE, type ServerEvent } from "../../packages/shared/src/index.js";
import { createArcadeReviewFixture } from "../arcade-review-fixture.js";
import { installWorldProbe } from "../characters/playwright-animation.js";

const output = fileURLToPath(new URL("../../apps/landing/artwork/", import.meta.url));
const artifacts = fileURLToPath(new URL("../../artifacts/landing/", import.meta.url));
await mkdir(output, { recursive: true });
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const issues: string[] = [];
const crops: Record<string, { left: number; top: number; width: number; height: number }> = {};
const data = createInitialData();
data.currentUserId = "user-maya";
data.members = createTestData().members.slice(0, 3).map((member, index) => ({
  ...member, floorId: "floor-main", activity: "Lounge",
  position: [{ x: 864, y: 592 }, { x: 624, y: 544 }, { x: 1088, y: 496 }][index]!,
  character: { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: index === 1 ? "braid" : "bob",
    upperBody: index === 0 ? "sunset" : index === 1 ? "frog" : "starlight",
    lowerBody: index === 0 ? "sunset" : "street", shoes: index === 0 ? "sunset" : "street" },
}));
data.organisation.ceoIds = [data.currentUserId];
const store = new WorkspaceStore(data);
const runtime = new WorldRuntime(store);
const games = createArcadeReviewFixture();

async function ready(page: Page) {
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.isVisible()) await people.click();
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll("img")].map(image => image.decode()));
    await Promise.all([...document.querySelectorAll("image")].filter(element => element.getBoundingClientRect().width > 0).map(async element => {
      const image = new Image();
      image.src = element.href.baseVal;
      await image.decode();
    }));
    for (let frame = 0; frame < 30; frame++) await new Promise(requestAnimationFrame);
  });
  assert.equal(await page.locator(".world-artwork-error, .character-preview-error").count(), 0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${output}/${name}.png` });
  const panel = page.locator(".character-dialog, .chess-game, .whiteboard-dialog");
  if (await panel.count()) {
    const box = await panel.boundingBox();
    if (box) crops[name] = { left: Math.floor(box.x * 2), top: Math.floor(box.y * 2), width: Math.floor(box.width * 2), height: Math.floor(box.height * 2) };
  }
}

try {
  const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await live.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await live.locator(".auth-card").waitFor();
  await live.screenshot({ path: `${artifacts}/live-sign-in.png` });
  await live.close();

  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2, colorScheme: "light" });
  await context.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/session") await route.fulfill({ json: {
      user: { id: data.currentUserId, username: "landing-capture", email: "landing-capture@example.test" },
      setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false,
      corporateIdentity: data.corporateIdentity,
    } });
    else if (path === "/v1/bootstrap") await route.fulfill({ json: store.getBootstrap(data.currentUserId) });
    else throw new Error(`Unexpected capture request: ${path}`);
  });
  await context.routeWebSocket(/\/v1\//, socket => {
    const peer = runtime.connect(data.currentUserId, "floor-main", event => socket.send(JSON.stringify(event)));
    socket.onMessage(message => runtime.handleCommand(peer, clientCommandSchema.parse(JSON.parse(String(message)))));
    socket.onClose(() => runtime.disconnect(peer));
  });
  runtime.start();
  for (const member of data.members.slice(1)) runtime.connect(member.id, "floor-main", () => {});
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", error => issues.push(error.message));
  page.on("response", response => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`); });
  await installWorldProbe(page);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await ready(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await capture(page, "office");
  crops.office = await page.evaluate(() => {
    const world = globalThis.avatarWorld!.stage.children![0]!;
    const start = world.toGlobal({ x: 464, y: 208 });
    const end = world.toGlobal({ x: 1328, y: 880 });
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { left: Math.floor((canvas.x + start.x) * 2), top: Math.floor((canvas.y + start.y) * 2), width: Math.floor((end.x - start.x) * 2), height: Math.floor((end.y - start.y) * 2) };
  });
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await capture(page, "build");
  await page.getByRole("button", { name: "Close build tools", exact: true }).click();
  await page.getByRole("button", { name: "Customize avatar", exact: true }).click();
  await page.getByRole("tab", { name: "Tops", exact: true }).click();
  await page.getByRole("button", { name: "Sunset crop top", exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Use character", exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLCanvasElement>(".character-option canvas")].every(canvas => {
    const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels?.some((value, index) => index % 4 === 3 && value > 0);
  }));
  await capture(page, "avatar");
  for (const outfit of ["sunset", "frog", "starlight"] as const) {
    const png = await page.evaluate(async ({ outfit, appearance }) => {
      const rendererPath = "/src/character-renderer.ts";
      const { renderCharacter } = await import(rendererPath);
      const canvas = await renderCharacter({ ...appearance, upperBody: outfit, lowerBody: outfit, shoes: outfit,
        hairstyle: outfit === "frog" ? "braid" : outfit === "starlight" ? "longbraid" : "bob" },
      { x: 24, y: 0, width: 72, height: 120 });
      return canvas.toDataURL("image/png").split(",")[1];
    }, { outfit, appearance: DEFAULT_CHARACTER_APPEARANCE });
    await writeFile(`${output}/character-${outfit}.png`, Buffer.from(png, "base64"));
  }
  await context.close();

  const gameContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, colorScheme: "light" });
  await games.install(gameContext);
  const database = new MemoryDatabase();
  await gameContext.routeWebSocket(/\/v1\//, socket => {
    const send = (event: ServerEvent) => socket.send(JSON.stringify(event));
    const peerId = games.runtime.connect("user-maya", "floor-studio", send);
    socket.onMessage(async message => {
      const command = clientCommandSchema.parse(JSON.parse(String(message)));
      if (command.type === "work.update") await saveWorkObject(command, { peerId, store: games.store, runtime: games.runtime, database,
        persist: () => database.saveWorkspaceState({ players: games.runtime.serializePlayers(), store: games.store.exportMutableState() }), send });
      else games.runtime.handleCommand(peerId, command);
    });
    socket.onClose(() => games.runtime.disconnect(peerId));
  });
  const gamePage = await gameContext.newPage();
  gamePage.setDefaultTimeout(20_000);
  gamePage.on("pageerror", error => issues.push(error.message));
  await installWorldProbe(gamePage);
  await gamePage.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await ready(gamePage);
  games.position(544, 576);
  await gamePage.waitForFunction(() => Boolean(document.querySelector('select[aria-label="Active interaction"] option[value="object-product-board"]')) || document.querySelector(".interaction-panel button.primary-button")?.textContent === "Open board");
  const nearby = gamePage.getByRole("combobox", { name: "Active interaction" });
  if (await nearby.count()) await nearby.selectOption("object-product-board");
  await gamePage.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Open board", exact: true }).click();
  for (const [title, text, status] of [
    ["Sketch the idea", "Explore a few directions together.", "todo"],
    ["Try it out", "Build a small prototype.", "doing"],
    ["Share with the team", "Collect feedback and next steps.", "done"],
  ]) {
    await gamePage.getByRole("button", { name: "Sticky note", exact: true }).click();
    await gamePage.getByRole("textbox", { name: "Title", exact: true }).fill(title!);
    await gamePage.locator(".whiteboard-card-editor textarea").fill(text!);
    await gamePage.getByRole("combobox", { name: "Status", exact: true }).selectOption(status!);
    await gamePage.getByRole("button", { name: "Close card editor", exact: true }).click();
  }
  await gamePage.getByRole("button", { name: "Board", exact: true }).click();
  await gamePage.getByRole("button", { name: "Save", exact: true }).click();
  await gamePage.getByText("Saved", { exact: true }).waitFor();
  await capture(gamePage, "whiteboard");
  await gamePage.getByRole("button", { name: "Close board", exact: true }).click();
  games.position(1330, 780);
  await gamePage.waitForFunction(() => Boolean(document.querySelector('select[aria-label="Active interaction"] option[value="object-chess"]')) || Boolean(document.querySelector(".chess-lobby")));
  if (!await gamePage.locator(".chess-lobby").isVisible()) await nearby.selectOption("object-chess");
  await gamePage.locator(".chess-lobby").getByRole("button", { name: "Play", exact: true }).click();
  await gamePage.locator(".chess-game").waitFor();
  await gamePage.getByRole("gridcell", { name: "white pawn on e2", exact: true }).click();
  await gamePage.getByRole("gridcell", { name: "e4", exact: true }).click();
  await gamePage.locator(".chess-moves strong").filter({ hasText: /^e4$/ }).waitFor();
  await capture(gamePage, "chess");
  await gameContext.close();
  assert.deepEqual(issues, []);
  await writeFile(`${output}/crops.json`, JSON.stringify(crops, null, 2) + "\n");
  await writeFile(`${artifacts}/capture-results.json`, JSON.stringify({
    source: "Current client modules and artwork from the running Vite service; in-memory workspace/domain fixtures with intercepted API and WebSocket requests",
    realBackend: "Unauthenticated sign-in only; no accounts created, credentials used or persistence changed",
    images: ["office", "build", "avatar", "whiteboard", "chess"], issues,
  }, null, 2));
  console.log("Captured current office, building tools, avatar editor and chess; isolated fixtures only.");
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: `${artifacts}/capture-failure.png` });
      console.error(await page.locator("body").innerText());
    }
  }
  console.error(games.events.filter(event => event.type === "command.error"));
  throw error;
} finally {
  await browser.close();
  runtime.stop();
  games.stop();
}
