import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import puppeteer from "puppeteer";
import { createApplication } from "../apps/server/src/app.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

process.env.NODE_ENV = "production";
const root = fileURLToPath(new URL("../", import.meta.url));
const distribution = resolve(root, process.env.NORTHSTAR_CLIENT_DIST ?? "apps/client/dist");
const output = resolve(root, "artifacts/native-client");
const nativeOrigin = "https://tauri.localhost";
const tauriConfig = JSON.parse(await readFile(resolve(root, "apps/client/src-tauri/tauri.conf.json"), "utf8"));
const contentSecurityPolicy = Object.entries(tauriConfig.app.security.csp).map(([name, value]) => `${name} ${value}`).join("; ");
const origins = ["https://first.example.test", "https://second.example.test"];
const password = "native-client-test-password";
const servers = new Map(await Promise.all(origins.map(async (origin, index) => {
  const server = await createApplication({ database: new MemoryDatabase(), clientUrl: origin, spotifyConfig: null, githubConfig: null });
  const response = await server.app.inject({ method: "POST", url: "/v1/auth/register",
    headers: { origin: nativeOrigin }, payload: { username: `player-${index}`, email: `player-${index}@example.test`, password } });
  assert.equal(response.statusCode, 201);
  const image = await readFile(resolve(root, "apps/client/src-tauri/icons/32x32.png"));
  const cookie = response.cookies.map(item => `${item.name}=${item.value}`).join("; ");
  const logo = await server.app.inject({ method: "PUT", url: "/v1/admin/corporate-identity/logo",
    headers: { origin: nativeOrigin, cookie, "content-type": "image/png" }, payload: image });
  assert.equal(logo.statusCode, 200);
  return [origin, server] as const;
})));
const nativeEndpoint = process.env.NORTHSTAR_NATIVE_CDP;
const browser = nativeEndpoint ? await chromium.connectOverCDP(nativeEndpoint)
  : await chromium.launch({ headless: true, executablePath: puppeteer.executablePath({ headless: "shell" }),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const context = nativeEndpoint ? browser.contexts()[0]! : await browser.newContext({ viewport: { width: 1280, height: 900 } });
const requests: { origin: string; path: string; cookie: string | undefined }[] = [];
const connections: { origin: string; closed: boolean }[] = [];
const errors: string[] = [];
let failSession = false;
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

if (!nativeEndpoint) await context.addInitScript(() => { Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {} }); });
await context.route("**/*", async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === nativeOrigin) {
    assert(!url.pathname.startsWith("/v1/"), "API request sent to the app origin");
    if (nativeEndpoint) {
      await route.continue();
      return;
    }
    const file = resolve(distribution, url.pathname === "/" ? "index.html" : `.${decodeURIComponent(url.pathname)}`);
    assert(file.startsWith(distribution + sep));
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream",
      headers: { "content-security-policy": contentSecurityPolicy } });
    return;
  }
  const server = servers.get(url.origin);
  assert(server, `Unexpected origin: ${url.origin}`);
  const headers = await request.allHeaders();
  requests.push({ origin: url.origin, path: url.pathname, cookie: headers.cookie });
  if (failSession && url.pathname === "/v1/auth/session") {
    await route.abort("connectionfailed");
    return;
  }
  const response = await server.app.inject({ method: request.method() as "GET" | "POST" | "PUT" | "DELETE" | "OPTIONS",
    url: url.pathname + url.search, headers, ...(request.postDataBuffer() ? { payload: request.postDataBuffer()! } : {}) });
  await route.fulfill({ status: response.statusCode, body: response.rawPayload,
    headers: Object.fromEntries(Object.entries(response.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join("\n") : String(value)])) });
});
await context.routeWebSocket(/\/v1\/realtime/, async socket => {
  const url = new URL(socket.url());
  const origin = `https://${url.host}`;
  const server = servers.get(origin);
  assert(server, `Unexpected realtime origin: ${origin}`);
  const connection = { origin, closed: false };
  connections.push(connection);
  const cookies = await context.cookies(origin);
  const peer = await server.app.injectWS(url.pathname + url.search, { headers: {
    origin: nativeOrigin, cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; "),
  } }, { onInit: ws => ws.on("message", message => socket.send(message.toString())) });
  socket.onMessage(message => peer.send(message));
  socket.onClose(() => { connection.closed = true; peer.close(); });
  peer.on("close", () => { connection.closed = true; socket.close(); });
});

try {
  await mkdir(output, { recursive: true });
  const page = nativeEndpoint
    ? context.pages()[0] ?? await context.waitForEvent("page", { timeout: 30_000 })
    : await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  await page.goto(nativeOrigin);
  await page.getByRole("heading", { name: "Connect to your server" }).waitFor();
  assert.equal(requests.length, 0);
  assert.equal(await page.getByRole("button", { name: "Use default" }).count(), 0);
  if (!nativeEndpoint) {
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, "first-launch-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.getByLabel("Server URL").fill(origins[0]!);
  assert.equal(requests.length, 0);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Username or email").fill("player-0");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.locator(".world-canvas canvas").waitFor();
  assert(requests.some(request => request.origin === origins[0] && request.path === "/v1/bootstrap" && request.cookie));
  const logo = page.locator(".brand-nav-item .corporate-logo");
  await logo.evaluate((image: HTMLImageElement) => image.decode());
  assert((await logo.getAttribute("src"))!.startsWith(origins[0]!));
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Server:" }).click();
  await page.getByLabel("Server URL").fill(origins[1]!);
  assert.equal(await page.evaluate(() => localStorage.getItem("northstar.serverOrigin")), origins[0]);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert(connections.filter(connection => connection.origin === origins[0]).every(connection => connection.closed));
  const firstCookie = (await context.cookies(origins[0]))[0]!;
  assert(firstCookie.secure && firstCookie.httpOnly && firstCookie.sameSite === "None");
  assert(requests.filter(request => request.origin === origins[1]).every(request => !request.cookie?.includes(firstCookie.value)));
  await page.getByLabel("Username or email").fill("player-1");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  assert(connections.some(connection => connection.origin === origins[1] && !connection.closed));
  await page.locator(".world-canvas canvas").waitFor();
  await logo.evaluate((image: HTMLImageElement) => image.decode());
  assert((await logo.getAttribute("src"))!.startsWith(origins[1]!));
  await page.reload();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.locator(".world-canvas canvas").waitFor();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".avatar-character canvas");
    const pixels = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels?.some((value, index) => index % 4 === 3 && value > 0);
  });
  assert.equal(await page.evaluate(() => localStorage.getItem("northstar.serverOrigin")), origins[1]);
  await page.screenshot({ path: resolve(output, nativeEndpoint ? "windows-connected.png" : "connected.png") });
  failSession = true;
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Server could not be reached." }).waitFor();
  failSession = false;
  await page.getByLabel("Server URL").fill(origins[0]!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("northstar.serverOrigin")), origins[0]);
  assert.deepEqual(errors, []);
  const result = { checks: ["explicit first connection", "draft isolation", "secure cookie login", "realtime authentication", "game canvas and character artwork render under the native security policy", "branding loads from the selected server", "server switching closes the old socket", "cookies remain scoped to each server", "saved server and session survive reload", "offline server can be replaced"], requests: requests.length, connections };
  await writeFile(resolve(output, nativeEndpoint ? "windows-connection-results.json" : "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (!nativeEndpoint) await context.close();
  await browser.close();
  await Promise.all([...servers.values()].map(server => server.app.close()));
}
