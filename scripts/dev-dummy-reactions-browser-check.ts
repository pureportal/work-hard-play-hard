import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import type { ServerEvent } from "../packages/shared/src/index.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "../apps/server/src/seeding/workplace.js";
import { startWorkspaceBrowserFixture } from "./workspace-browser-fixture.js";

interface ReactionNode {
  label?: string;
  visible: boolean;
  children?: ReactionNode[];
  texture?: { source?: { width: number } };
}

declare global {
  var dummyReactionEvents: ServerEvent[];
  var dummyReactionWorld: { stage: ReactionNode } | undefined;
  var findDummyReactionNode: (label: string) => ReactionNode | undefined;
}

const artifacts = fileURLToPath(new URL("../artifacts/reactions/", import.meta.url));
const workspace = createSimulatedWorkplace();
workspace.players = workspace.players.map((player) => player.userId === "person-mei"
  ? { ...player, x: 390, y: 304 }
  : player);
const { auth } = await createWorkplaceAccounts(workspace);
const database = new MemoryDatabase();
await database.saveWorkspaceState(workspace);
await database.saveAuthState(auth);
const fixture = await startWorkspaceBrowserFixture(database);
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];

try {
  const players = fixture.application.runtime.serializePlayers();
  const player = players.find((candidate) => candidate.userId === "person-soren")!;
  const dummy = players.find((candidate) => candidate.userId === "person-mei")!;
  assert(player.connected && dummy.connected);
  assert.equal(player.roomId, dummy.roomId);
  assert(Math.hypot(player.x - dummy.x, player.y - dummy.y) <= 96);

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.dummyReactionEvents = [];
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (message) => globalThis.dummyReactionEvents.push(JSON.parse(String(message.data)) as ServerEvent));
      }
    };
    (globalThis as typeof globalThis & { __PIXI_APP_INIT__: (app: { stage: ReactionNode }) => void }).__PIXI_APP_INIT__ = (app) => {
      globalThis.dummyReactionWorld = app;
    };
    globalThis.findDummyReactionNode = (label) => {
      const queue = globalThis.dummyReactionWorld ? [globalThis.dummyReactionWorld.stage] : [];
      for (const node of queue) {
        if (node.label === label) return node;
        queue.push(...node.children ?? []);
      }
      return undefined;
    };
  });
  await page.goto(fixture.origin);
  await page.getByLabel("Username or email", { exact: true }).fill("member2");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const dailyBonus = page.getByRole("button", { name: "Close daily bonus", exact: true });
  if (await dailyBonus.isVisible()) await dailyBonus.click();
  const skipGuide = page.getByRole("button", { name: /^Skip( guide)?$/ }).first();
  await skipGuide.waitFor({ timeout: 120_000 });
  await skipGuide.click();
  for (const panel of ["build tools", "people"]) {
    const closePanel = page.getByRole("button", { name: `Close ${panel}`, exact: true });
    if (await closePanel.isVisible()) await closePanel.click();
  }

  if (!await page.getByRole("button", { name: "React", exact: true }).count()) {
    await mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: `${artifacts}/dev-dummy-debug.png` });
    const buttons = await page.locator("button").evaluateAll((items) => items.map((item) => ({
      text: item.textContent?.trim(), label: item.getAttribute("aria-label"),
    })));
    throw new Error(`Reaction control missing: ${JSON.stringify(buttons.filter((button) => button.label?.includes("Close") || button.label?.includes("React")))}`);
  }

  async function react(label: string) {
    await page.getByRole("button", { name: "React", exact: true }).click();
    await page.getByRole("button", { name: label }).click();
  }

  await mkdir(artifacts, { recursive: true });
  for (const [label, reaction] of [["Clap (6)", "clap"], ["Celebrate (3)", "celebrate"],
    ["Thumbs up (4)", "thumbs_up"], ["Laugh (5)", "laugh"]] as const) {
    await react(label);
    await page.waitForFunction((reaction) => globalThis.dummyReactionEvents.some((event) => event.type === "interaction.reaction"
      && event.userId === "person-mei" && event.reaction === reaction), reaction);
    await page.waitForFunction(() => {
      const node = globalThis.findDummyReactionNode("world-reaction:person-mei");
      return node?.visible && node.children?.some((child) => child.texture?.source?.width === 32);
    });
    await page.waitForTimeout(280);
    await page.locator(".world-canvas canvas").screenshot({ path: `${artifacts}/dev-dummy-${reaction}.png` });
    await page.waitForTimeout(450);
  }

  await page.waitForTimeout(600);
  for (const [label, kind] of [["Wave (1)", "high_five"], ["Heart (2)", "love"]] as const) {
    await react(label);
    await page.waitForFunction((kind) => globalThis.dummyReactionEvents.some((event) => event.type === "interaction.group_reaction"
      && event.kind === kind && event.userIds.includes("person-mei")), kind);
    await page.waitForFunction((kind) => globalThis.findDummyReactionNode(`world-group-reaction:${kind}`)?.visible, kind);
    await page.waitForTimeout(300);
    await page.locator(".world-canvas canvas").screenshot({ path: `${artifacts}/dev-dummy-${kind}.png` });
    await page.waitForTimeout(850);
    assert(await page.evaluate((kind) => globalThis.findDummyReactionNode(`world-group-reaction:${kind}`)?.visible, kind));
    await page.waitForFunction((kind) => !globalThis.findDummyReactionNode(`world-group-reaction:${kind}`), kind);
    assert(await page.evaluate(() => !globalThis.findDummyReactionNode("world-reaction:person-soren")?.visible));
    assert(await page.evaluate(() => !globalThis.findDummyReactionNode("world-reaction:person-mei")?.visible));
  }
  assert.deepEqual(errors, []);
  process.stdout.write(`All six nearby dev dummy reactions, high five, love, and effect timing verified. Screenshots: ${artifacts}\n`);
} finally {
  await browser.close();
  await fixture.close();
}
