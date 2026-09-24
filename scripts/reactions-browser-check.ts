import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import type { ServerEvent } from "../packages/shared/src/index.js";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

declare global {
  var reactionEvents: ServerEvent[];
  var reactionWorld: { stage: ReactionNode } | undefined;
  var findReactionNode: (label: string) => ReactionNode | undefined;
}

interface ReactionNode {
  label?: string;
  visible: boolean;
  children?: ReactionNode[];
  rotation?: number;
  scale?: { x: number };
  texture?: { source?: { width: number } };
}

const directory = fileURLToPath(new URL("../apps/client/dist", import.meta.url));
const artifacts = fileURLToPath(new URL("../artifacts/reactions", import.meta.url));
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
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
application.app.get("/*", async (request, reply) => {
  const pathname = new URL(request.url, origin).pathname;
  const path = resolve(directory, pathname === "/" ? "index.html" : `.${pathname}`);
  if (!path.startsWith(directory + sep)) return reply.code(403).send();
  try {
    return reply.type(types[extname(path)] ?? "application/octet-stream").send(await readFile(path));
  } catch {
    return reply.code(404).send();
  }
});
application.runtime.restorePlayers(application.runtime.serializePlayers().map((player) => {
  if (player.userId === "user-maya") return { ...player, x: 410, y: 650 };
  if (player.userId === "user-leo") return { ...player, x: 460, y: 750 };
  return player;
}));
await application.app.listen({ host: "127.0.0.1", port });
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
await mkdir(artifacts, { recursive: true });

async function login(identifier: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.reactionEvents = [];
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (message) => globalThis.reactionEvents.push(JSON.parse(String(message.data)) as ServerEvent));
      }
    };
    (globalThis as typeof globalThis & { __PIXI_APP_INIT__: (app: { stage: ReactionNode }) => void }).__PIXI_APP_INIT__ = (app) => { globalThis.reactionWorld = app; };
    globalThis.findReactionNode = (label) => {
      const queue = globalThis.reactionWorld ? [globalThis.reactionWorld.stage] : [];
      for (const node of queue) {
        if (node.label === label) return node;
        queue.push(...node.children ?? []);
      }
      return undefined;
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator('input[name="identifier"]').fill(identifier);
  await page.locator('input[name="password"]').fill("northstar");
  await page.locator('button[type="submit"]').click();
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  const dailyBonus = page.getByRole("button", { name: "Close daily bonus", exact: true });
  if (await dailyBonus.isVisible()) await dailyBonus.click();
  const tourSkip = page.getByRole("button", { name: /^Skip( guide)?$/ }).first();
  await tourSkip.waitFor({ timeout: 120_000 });
  await tourSkip.click();
  for (const panel of ["build", "people"]) {
    const close = page.getByRole("button", { name: new RegExp(`Close ${panel}`) });
    if (await close.count()) await close.click();
  }
  return page;
}

async function react(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "React", exact: true }).click();
  await page.getByRole("button", { name }).click();
}

async function expectEffect(page: Page, kind: "high_five" | "love"): Promise<void> {
  await page.waitForFunction((kind) => globalThis.reactionEvents.some((event) => event.type === "interaction.group_reaction" && event.kind === kind), kind);
  await page.waitForFunction((kind) => {
    const node = globalThis.findReactionNode(`world-group-reaction:${kind}`);
    return node?.visible && node.children?.some((child) => child.texture?.source?.width === 32);
  }, kind);
  const motion = await page.evaluate(async (kind) => {
    const node = globalThis.findReactionNode(`world-group-reaction:${kind}`)!;
    const icon = node.children!.find((child) => child.texture?.source?.width === 32)!;
    const first = kind === "love" ? icon.scale!.x : icon.rotation!;
    await new Promise((resolve) => setTimeout(resolve, 110));
    const second = kind === "love" ? icon.scale!.x : icon.rotation!;
    return Math.abs(second - first);
  }, kind);
  assert(motion > 0.001, `${kind} should animate`);
  assert(await page.evaluate(() => !globalThis.findReactionNode("world-reaction:user-maya")?.visible));
  assert(await page.evaluate(() => !globalThis.findReactionNode("world-reaction:user-leo")?.visible));
}

async function expectEffectEnds(page: Page, kind: "high_five" | "love"): Promise<void> {
  await page.waitForTimeout(850);
  assert(await page.evaluate((kind) => globalThis.findReactionNode(`world-group-reaction:${kind}`)?.visible, kind));
  await page.waitForFunction((kind) => !globalThis.findReactionNode(`world-group-reaction:${kind}`), kind);
  assert(await page.evaluate(() => !globalThis.findReactionNode("world-reaction:user-maya")?.visible));
  assert(await page.evaluate(() => !globalThis.findReactionNode("world-reaction:user-leo")?.visible));
}

try {
  const maya = await login("maya");
  const leo = await login("leo");
  await maya.getByRole("button", { name: "React", exact: true }).click();
  const picker = maya.getByRole("group", { name: "Reactions" });
  assert.equal(await picker.locator("img").count(), 6);
  assert(await picker.locator("img").evaluateAll((images) => images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 32)));
  await picker.screenshot({ path: resolve(artifacts, "reaction-picker.png") });
  await maya.getByRole("button", { name: "Use dark mode" }).click();
  await maya.getByRole("button", { name: "React", exact: true }).click();
  await picker.screenshot({ path: resolve(artifacts, "reaction-picker-dark.png") });
  await maya.getByRole("button", { name: "Wave (1)" }).click();
  await maya.waitForFunction(() => {
    const bubble = globalThis.findReactionNode("world-reaction:user-maya");
    return bubble?.visible && bubble.children?.some((child) => child.texture?.source?.width === 32);
  });
  await maya.locator(".world-canvas canvas").screenshot({ path: resolve(artifacts, "wave-world.png") });
  await react(leo, "Wave (1)");
  await expectEffect(maya, "high_five");
  await maya.waitForTimeout(250);
  await maya.locator(".world-canvas canvas").screenshot({ path: resolve(artifacts, "high-five.png") });
  await expectEffectEnds(maya, "high_five");

  await react(maya, "Heart (2)");
  await react(leo, "Heart (2)");
  await expectEffect(maya, "love");
  await maya.waitForTimeout(250);
  await maya.locator(".world-canvas canvas").screenshot({ path: resolve(artifacts, "love.png") });
  await expectEffectEnds(maya, "love");
  assert.deepEqual(errors, []);
  console.log(`Two-player reaction picker, world sprites, high five, love, and effect timing verified. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
  application.runtime.stop();
  await application.app.close();
}
