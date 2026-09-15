import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { chromium, type Page } from "playwright-core";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import type { ClientCommand, ServerEvent } from "../packages/shared/src/index.js";
import { createOrganisation } from "../packages/shared/src/index.js";

export const artifacts = fileURLToPath(new URL("../artifacts/organisation-permissions/", import.meta.url));
const distribution = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
const origin = "http://127.0.0.1:4181";

export async function until(predicate: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(message);
    await setTimeout(20);
  }
}

function createPermissionSeed() {
  const seed = createTestData();
  seed.organisation = createOrganisation(seed.members[0]!.id);
  seed.gameSettings.roomBuild = { mode: "none", assignedPersonIds: [] };
  for (const layout of seed.layouts) {
    layout.objects = [];
    for (const room of layout.rooms) {
      delete room.organisationUnitId;
      room.build = { mode: "default", assignedPersonIds: [] };
    }
  }
  for (const member of seed.members) { member.online = false; member.position = { x: 770, y: 890 }; }
  seed.members.find((member) => member.id === "user-jonas")!.position = { x: 300, y: 300 };
  return seed;
}

export async function createFixture(seed = createPermissionSeed()) {
  const store = new WorkspaceStore(seed);
  const ownedAssetId = store.purchaseAsset("user-jonas", "desk-straight", "fixture-desk").transaction.ownedAssetId!;
  const runtime = new WorldRuntime(store);
  const position = store.getMember("user-jonas")!.position!;
  runtime.restorePlayers([{ userId: "user-jonas", floorId: "floor-studio", x: position.x, y: position.y,
    facing: "down", availability: store.getMember("user-jonas")!.availability, connected: false }]);
  const events = new Map<string, ServerEvent[]>();
  const errors: string[] = [];
  const commands: { userId: string; command: ClientCommand }[] = [];
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  await mkdir(artifacts, { recursive: true });
  runtime.start();
  const open = async (userId: string) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    events.set(userId, []);
    await context.route(`${origin}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/v1/auth/session") {
        await route.fulfill({ json: { user: { id: userId, username: userId, email: `${userId}@example.test` }, setupRequired: false, registration: { enabled: false }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
        return;
      }
      if (path === "/v1/bootstrap") { await route.fulfill({ json: store.getBootstrap(userId) }); return; }
      const file = resolve(distribution, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
      assert(file.startsWith(resolve(distribution) + sep));
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
      await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
    });
    await context.routeWebSocket(`${origin.replace("http:", "ws:")}/v1/realtime*`, (socket) => {
      const peer = runtime.connect(userId, "floor-studio", (event) => { events.get(userId)!.push(event); socket.send(JSON.stringify(event)); });
      socket.onMessage((message) => {
        const command = clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand;
        commands.push({ userId, command });
        runtime.handleCommand(peer, command);
      });
      socket.onClose(() => runtime.disconnect(peer));
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${userId}: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${userId}: ${message.text()}`); });
    page.on("dialog", (dialog) => dialog.accept());
    page.setDefaultTimeout(45_000);
    await page.goto(origin);
    await page.locator(".world-canvas canvas").waitFor();
    return page;
  };
  const send = async (page: Page, userId: string, command: ClientCommand & { requestId: string }, expectedError?: string) => {
    const response = await page.evaluate((value) => new Promise<ServerEvent>((resolve, reject) => {
      const socket = new WebSocket(`${location.origin.replace("http:", "ws:")}/v1/realtime?floorId=floor-studio`);
      const timer = window.setTimeout(() => { socket.close(); reject(new Error("Command response timed out")); }, 15_000);
      socket.addEventListener("message", (message) => {
        const event = JSON.parse(String(message.data)) as ServerEvent;
        if (event.type === "session.synced") socket.send(JSON.stringify(value));
        if ("requestId" in event && event.requestId === value.requestId) {
          window.clearTimeout(timer);
          socket.close();
          resolve(event);
        }
      });
      socket.addEventListener("error", () => { window.clearTimeout(timer); socket.close(); reject(new Error("Command socket failed")); });
    }), command);
    const error = response.type === "command.error" ? response : undefined;
    assert(events.has(userId));
    if (expectedError) assert.equal(error?.type === "command.error" ? error.code : undefined, expectedError);
    else assert.equal(error, undefined);
  };
  return { store, runtime, browser, open, send, ownedAssetId, events, errors, commands,
    close: async () => { runtime.stop(); await browser.close(); } };
}
