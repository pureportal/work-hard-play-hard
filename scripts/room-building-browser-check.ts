import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import type { ClientCommand } from "../packages/shared/src/index.js";

const origin = "http://127.0.0.1:4179";
const distribution = resolve(process.env.CLIENT_DIST ?? fileURLToPath(new URL("../apps/client/dist/", import.meta.url)));
const artifacts = fileURLToPath(new URL("../artifacts/room-building/", import.meta.url));
const store = new WorkspaceStore(createTestData());
const focusRoom = store.getRoom("room-focus")!;
store.updateRoomSettings(focusRoom.id, { name: focusRoom.name, color: focusRoom.color,
  access: { mode: "assigned", assignedPersonIds: ["user-priya"], knockable: true } });
for (const member of store.getMembers()) member.online = false;
store.getMember("user-maya")!.position = { x: 770, y: 800 };
const runtime = new WorldRuntime(store);
const commands: ClientCommand[] = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await mkdir(artifacts, { recursive: true });
runtime.start();
try {
  await context.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/v1/auth/session") {
      await route.fulfill({ json: {
        user: { id: "user-maya", username: "maya", email: "maya@example.test" },
        setupRequired: false, registration: { enabled: false }, magicLinkEnabled: false,
        corporateIdentity: store.getCorporateIdentity(),
      } });
      return;
    }
    if (path === "/v1/bootstrap") {
      await route.fulfill({ json: store.getBootstrap("user-maya") });
      return;
    }
    const file = resolve(distribution, path === "/" ? "index.html" : `.${decodeURIComponent(path)}`);
    assert(file.startsWith(resolve(distribution) + sep));
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
  });
  await context.routeWebSocket(`${origin.replace("http:", "ws:")}/v1/realtime*`, (socket) => {
    const peer = runtime.connect("user-maya", "floor-studio", (event) => socket.send(JSON.stringify(event)));
    socket.onMessage((message) => {
      const command = clientCommandSchema.parse(JSON.parse(String(message)));
      commands.push(command);
      runtime.handleCommand(peer, command);
    });
    socket.onClose(() => runtime.disconnect(peer));
  });
  page.setDefaultTimeout(15_000);
  await page.goto(origin);
  await page.locator(".world-canvas canvas").waitFor();
  await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("button", { name: "Start point", exact: true }).click();
  const canvas = page.locator(".world-canvas canvas");
  const bounds = (await canvas.boundingBox())!;
  const before = structuredClone(store.getFloor("floor-studio")!.spawn);
  for (const offset of [-120, -80, -40, 40, 80, 120]) {
    await page.mouse.click(bounds.x + bounds.width / 2 + offset, bounds.y + bounds.height / 2 + 64);
    if (commands.some((command) => command.type === "layout.apply" && command.edit.tool === "spawn")) break;
  }
  assert(commands.some((command) => command.type === "layout.apply" && command.edit.tool === "spawn"));
  assert.notDeepEqual(store.getFloor("floor-studio")!.spawn, before);
  await page.screenshot({ path: resolve(artifacts, "start-point-desktop.png") });
  await page.getByRole("button", { name: "Room access", exact: true }).click();
  await page.getByLabel("Player", { exact: true }).selectOption("user-priya");
  await page.getByRole("region", { name: "Studio", exact: true }).getByText(focusRoom.name).waitFor();
  const privateRoom = page.getByRole("region", { name: "Studio", exact: true }).locator("li").filter({ hasText: focusRoom.name });
  await privateRoom.getByText("Can enter", { exact: true }).waitFor();
  await page.getByLabel("Player", { exact: true }).selectOption("user-maya");
  await privateRoom.getByText("No access", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "room-access-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(artifacts, "room-access-mobile.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.getByRole("button", { name: "Back to build", exact: true }).click();
  await page.getByRole("button", { name: "Start point", exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "build-mobile.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ spawn: store.getFloor("floor-studio")!.spawn, selectedPlayerAccess: "passed", mobile: "passed", pageErrors: errors, artifacts }));
} catch (error) {
  await page.screenshot({ path: resolve(artifacts, "failure.png") });
  console.error(JSON.stringify({ errors, text: await page.locator("body").innerText() }));
  throw error;
} finally {
  await context.close();
  runtime.stop();
  await browser.close();
}
