import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "../apps/server/src/seeding/workplace.js";
import type { ApplicationContext } from "../apps/server/src/app.js";
import type { BootstrapData, Position } from "../packages/shared/src/index.js";
import { startWorkspaceBrowserFixture } from "./workspace-browser-fixture.js";
import { installWorldProbe } from "./characters/playwright-animation.js";

const output = fileURLToPath(new URL("../artifacts/workplace/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];

async function pageFor(origin: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 2240, height: 1500 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => {
    if (/\/(world-assets|characters)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await installWorldProbe(page);
  await page.goto(origin);
  return page;
}

async function ready(page: Page): Promise<void> {
  try {
    await page.locator(".world-canvas canvas").waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: `${output}/failure.png` });
    throw new Error(`${String(error)}\n${errors.join("\n")}\n${await page.locator("body").innerText()}`);
  }
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  await page.waitForTimeout(800);
  if (await page.locator(".world-artwork-error").count()) {
    await page.screenshot({ path: `${output}/failure.png` });
    throw new Error(`Artwork failed: ${errors.join("\n")}`);
  }
}

async function move(page: Page, app: ApplicationContext, userId: string, point: Position): Promise<void> {
  const screen = await page.evaluate((point) => {
    const world = globalThis.avatarWorld!.stage.children![0]!;
    const position = world.toGlobal(point);
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: canvas.x + position.x, y: canvas.y + position.y };
  }, point);
  await page.mouse.click(screen.x, screen.y);
  const deadline = Date.now() + 15_000;
  while (true) {
    const player = app.runtime.serializePlayers().find((player) => player.userId === userId)!;
    if (Math.hypot(player.x - point.x, player.y - point.y) < 6) break;
    assert(Date.now() < deadline, `Could not walk to ${point.x},${point.y}`);
    await page.waitForTimeout(80);
  }
  await page.waitForFunction((point) => {
    const player = globalThis.findAvatar("You")?.parent?.parent;
    return player && Math.hypot(player.x - point.x, player.y - point.y) < 3;
  }, point);
  await page.waitForTimeout(600);
}

try {
  const starter = await startWorkspaceBrowserFixture();
  try {
    const page = await pageFor(starter.origin);
    await page.getByLabel("Username", { exact: true }).fill("house-owner");
    await page.getByLabel("Email", { exact: true }).fill("house-owner@example.test");
    await page.getByLabel("Password", { exact: true }).fill(crypto.randomUUID());
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await ready(page);
    const data = await (await page.request.get(`${starter.origin}/v1/bootstrap`)).json() as BootstrapData;
    assert.equal(data.members.length, 1);
    for (const rows of [data.messages, data.meetings, data.invitations, data.scores, data.organisation.units]) assert.deepEqual(rows, []);
    assert(data.layouts[0]!.rooms.every((room) => room.access.mode === "open"));
    await page.screenshot({ path: `${output}/starting-house.png` });
    await move(page, starter.application, data.currentUserId, { x: 896, y: 784 });
    await move(page, starter.application, data.currentUserId, { x: 896, y: 608 });
    await page.reload();
    await ready(page);
    assert.equal(starter.application.store.getMembers().length, 1);
    await page.context().close();
  } finally {
    await Promise.all(browser.contexts().map((context) => context.close()));
    await starter.close();
  }

  const workspace = createSimulatedWorkplace();
  process.stdout.write("Starting house verified. Loading the simulated workplace.\n");
  const { auth, credentials } = await createWorkplaceAccounts(workspace);
  const database = new MemoryDatabase();
  await database.saveWorkspaceState(workspace);
  await database.saveAuthState(auth);
  const simulation = await startWorkspaceBrowserFixture(database);
  try {
    const page = await pageFor(simulation.origin);
    const owner = credentials.find(({ username }) => username === "owner")!;
    await page.getByLabel("Username or email", { exact: true }).fill(owner.username);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await ready(page);
    await page.getByRole("button", { name: "Close people", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    for (const floor of workspace.store.floors) {
      await page.getByLabel("Floor", { exact: true }).selectOption(floor.id);
      await ready(page);
      await move(page, simulation.application, "person-rowan", { x: 896, y: 576 });
      await page.screenshot({ path: `${output}/${floor.id}.png` });
      process.stdout.write(`Verified ${floor.name}.\n`);
    }
    await page.getByLabel("Floor", { exact: true }).selectOption("floor-workplace");
    await ready(page);
    await move(page, simulation.application, "person-rowan", { x: 1408, y: 464 });
    assert(simulation.application.store.getMeetings().every((meeting) => !meeting.participantIds.includes("person-rowan")));
    assert(!simulation.application.runtime.serializePlayers().find((player) => player.userId === "person-rowan")?.proximity);
    await page.getByRole("button", { name: "Meetings", exact: true }).click();
    await page.getByRole("heading", { name: "Release review", exact: true }).waitFor();
    await page.locator(".meeting-card").filter({ has: page.getByRole("heading", { name: "Release review", exact: true }) })
      .getByRole("button", { name: "Start", exact: true }).click();
    const deadline = Date.now() + 10_000;
    while (!simulation.application.store.getMeeting("meeting-release-review")!.participantIds.includes("person-rowan")) {
      assert(Date.now() < deadline, "Starting the scheduled room meeting was not acknowledged");
      await page.waitForTimeout(80);
    }
    await page.screenshot({ path: `${output}/room-meeting.png` });
    await page.context().close();
    const disconnectDeadline = Date.now() + 10_000;
    while (simulation.application.store.getMeetings().some((meeting) => meeting.participantIds.includes("person-rowan"))) {
      assert(Date.now() < disconnectDeadline, "Disconnecting did not remove the meeting participant");
      await delay(80);
    }
  } finally {
    await Promise.all(browser.contexts().map((context) => context.close()));
    await simulation.close();
  }
  assert.deepEqual(errors, []);
  process.stdout.write("Starter registration, outdoor navigation and reload; all three simulation floors; inert meeting-room entry and explicit meeting start passed.\n");
} finally { await browser.close(); }
