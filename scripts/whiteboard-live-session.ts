import assert from "node:assert/strict";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright-core";
import { getPlacedAssetBounds, type BootstrapData, type ClientCommand, type ServerEvent, type WorldObject } from "../packages/shared/src/index.js";

declare global {
  var whiteboardReview: { socket: WebSocket; events: ServerEvent[]; commands: ClientCommand[] };
}

export const clientUrl = "http://127.0.0.1:5173";
export const serverUrl = "http://127.0.0.1:3001";

export async function launchWhiteboardBrowser() {
  return chromium.launch({ channel: "msedge", headless: true });
}

export async function playerSession(browser: Browser, identifier: string, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  await context.grantPermissions(["local-network-access"], { origin: clientUrl });
  for (let attempt = 0; attempt < 60; attempt++) {
    const ready = await context.request.get(`${serverUrl}/v1/health/ready`, { timeout: 2000 }).then((response) => response.ok(), () => false);
    if (ready) break;
    await new Promise((done) => setTimeout(done, 1000));
  }
  const login = await context.request.post(`${serverUrl}/v1/auth/login`, { data: { identifier, password: "northstar" } });
  assert.equal(login.status(), 200, `Login for ${identifier}`);
  const directory = fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };
  await context.route(`${clientUrl}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith("/v1/")) return route.continue();
    const path = resolve(directory, pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`);
    assert(path.startsWith(resolve(directory) + sep), "Client asset stays inside the build directory");
    await route.fulfill({ path, contentType: types[extname(path)] ?? "application/octet-stream" });
  });
  await context.addInitScript((origin) => {
    localStorage.setItem("northstar.serverOrigin", origin);
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).includes("/v1/realtime")) {
          const review = { socket: this, events: [] as ServerEvent[], commands: [] as ClientCommand[] };
          globalThis.whiteboardReview = review;
          this.addEventListener("message", (event) => review.events.push(JSON.parse(String(event.data)) as ServerEvent));
        }
      }
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === "string" && globalThis.whiteboardReview?.socket === this) globalThis.whiteboardReview.commands.push(JSON.parse(data) as ClientCommand);
        super.send(data);
      }
    };
  }, serverUrl);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error) => console.error(`Browser ${identifier}: ${error.message}`));
  await page.goto(clientUrl);
  try {
    await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  } catch {
    console.error((await page.locator("body").innerText()).slice(0, 1200));
    console.error(await page.evaluate(() => ({ socket: globalThis.whiteboardReview?.socket.url, state: globalThis.whiteboardReview?.socket.readyState, events: globalThis.whiteboardReview?.events.slice(-5).map((event) => event.type) })));
    throw new Error(`Player ${identifier} did not connect`);
  }
  const people = page.getByRole("button", { name: "Close people", exact: true });
  if (await people.count()) await people.click();
  return page;
}

export async function bootstrap(page: Page): Promise<BootstrapData> {
  const response = await page.request.get(`${serverUrl}/v1/bootstrap`);
  assert.equal(response.status(), 200);
  return response.json();
}

export async function command(page: Page, command: ClientCommand) {
  assert("requestId" in command);
  await page.waitForFunction(() => globalThis.whiteboardReview?.socket.readyState === WebSocket.OPEN && document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  await page.evaluate((command) => globalThis.whiteboardReview.socket.send(JSON.stringify(command)), command);
  await page.waitForFunction((id) => globalThis.whiteboardReview.events.some((event) => "requestId" in event && event.requestId === id), command.requestId);
  const error = await page.evaluate((id) => globalThis.whiteboardReview.events.find((event) => event.type === "command.error" && event.requestId === id), command.requestId);
  if (error?.type === "command.error") throw new Error(`${error.code}: ${error.message}`);
}

export async function openBoard(page: Page, board: WorldObject) {
  const { currentUserId } = await bootstrap(page);
  const bounds = getPlacedAssetBounds(board);
  await page.evaluate((boardId) => globalThis.whiteboardReview.socket.send(JSON.stringify({ type: "work.approach", requestId: crypto.randomUUID(), objectId: boardId })), board.id);
  await page.waitForFunction(({ id, currentUserId, bounds }) => {
    const player = globalThis.whiteboardReview.events.filter((event) => event.type === "world.snapshot").at(-1)?.players.find((player) => player.userId === currentUserId);
    if (!player || Math.hypot(player.x - Math.max(bounds.x, Math.min(player.x, bounds.x + bounds.width)), player.y - Math.max(bounds.y, Math.min(player.y, bounds.y + bounds.height))) > 65) return false;
    const selector = document.querySelector<HTMLSelectElement>('[aria-label="Active interaction"]');
    return [...(selector?.options ?? [])].some((option) => option.value === id) || (!selector && document.querySelector('.interaction-panel button.primary-button')?.textContent === "Open board");
  }, { id: board.id, currentUserId, bounds }, { timeout: 60000 });
  const select = page.getByRole("combobox", { name: "Active interaction" });
  if (await select.count()) await select.selectOption(board.id);
  await page.getByRole("region", { name: "Nearby actions" }).getByRole("button", { name: "Open board", exact: true }).click();
  await page.getByRole("dialog").waitFor();
}

export async function saved(page: Page) {
  await page.waitForFunction(() => {
    const status = document.querySelector('.whiteboard-dialog .work-object-save-state')?.textContent;
    return document.querySelector<HTMLButtonElement>('.whiteboard-dialog footer .primary-button')?.disabled === true
      && status !== "Unsaved changes" && status !== "Saving…" && !document.querySelector('.whiteboard-dialog [role="alert"]');
  });
}
