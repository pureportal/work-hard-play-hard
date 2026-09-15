import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createServer, type AddressInfo } from "node:net";
import puppeteer, { type Page, type HTTPRequest } from "puppeteer";
import { DEFAULT_CHARACTER_APPEARANCE, getOutdoorBounds } from "../packages/shared/src/index.js";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import { playbackBody, spotifyRecord, spotifyTestConfig } from "../apps/server/src/spotify/spotify-test-fixtures.js";
import { SPOTIFY_SCOPES } from "../apps/server/src/spotify/spotify-client.js";

const distribution = resolve("../../apps/client/dist");
const artifacts = resolve("../../artifacts/spotify");
await mkdir(artifacts, { recursive: true });
const database = new MemoryDatabase();
await database.saveSpotifyConnection(spotifyRecord("user-leo", false));
let playback = playbackBody();
const playCalls: RequestInit[] = [];
const port = await new Promise<number>((resolve, reject) => {
  const reservation = createServer();
  reservation.once("error", reject);
  reservation.listen(0, "127.0.0.1", () => {
    const reserved = (reservation.address() as AddressInfo).port;
    reservation.close((error) => error ? reject(error) : resolve(reserved));
  });
});
const origin = `http://127.0.0.1:${port}`;
const config = { ...spotifyTestConfig, redirectUri: `${origin}/v1/spotify/callback` };
const context = await createTestApplication({
  database, fixture: true, spotifyConfig: config, clientUrl: origin,
  spotifyFetch: async (url, init) => {
    if (String(url).endsWith("/api/token")) return Response.json({ access_token: "browser-access", refresh_token: "browser-refresh", expires_in: 3600, scope: SPOTIFY_SCOPES.join(" ") });
    if (String(url).endsWith("/play")) { playCalls.push(init!); return new Response(null, { status: 204 }); }
    return Response.json(playback);
  },
});
const floor = context.store.getFloor("floor-studio")!;
const state = context.store.exportMutableState();
state.members = state.members.map((member) => ({ ...member, character: { ...DEFAULT_CHARACTER_APPEARANCE } }));
const layout = state.layouts.find((candidate) => candidate.floorId === floor.id)!;
layout.objects = [];
layout.walls = [];
layout.openings = [];
layout.rooms = [];
context.store.restoreMutableState(state);
context.runtime.restorePlayers([
  { userId: "user-maya", floorId: floor.id, x: floor.spawn.x, y: floor.spawn.y, facing: "down", connected: false, availability: "available" },
  { userId: "user-leo", floorId: floor.id, x: floor.spawn.x + 100, y: floor.spawn.y, facing: "down", connected: false, availability: "available" },
]);
context.app.get("/*", async (request, reply) => {
  const url = new URL(request.url, origin);
  const path = resolve(distribution, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  assert(path.startsWith(`${distribution}${sep}`));
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
  return reply.type(types[extname(path)] ?? "application/octet-stream").send(await readFile(path));
});
await context.app.listen({ host: "127.0.0.1", port });
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const issues: string[] = [];

try {
  const maya = await openPlayer("maya");
  const leo = await openPlayer("leo");
  process.stdout.write("Two player sessions connected.\n");
  await maya.bringToFront();
  await maya.click('button[aria-label="Settings"]');
  await maya.locator("button::-p-text(Connect Spotify)").click();
  await maya.waitForSelector('.spotify-settings input[type="checkbox"]', { visible: true });
  process.stdout.write("Spotify authorization callback completed.\n");
  assert.equal(await maya.$eval('.spotify-settings input[type="checkbox"]', (input) => (input as HTMLInputElement).checked), false);
  await maya.click('.spotify-settings input[type="checkbox"]');
  await waitUntil(() => context.spotify.status("user-maya").sharing);
  context.spotify.tick();
  await waitUntil(() => context.spotify.snapshot().length === 1);
  await maya.locator("button::-p-text(Share Jam invite)").click();
  await maya.type("#spotify-jam-url", "https://spotify.link/browserJam");
  await maya.locator("button::-p-text(Share invite)").click();
  await waitUntil(() => context.spotify.status("user-maya").jamUrl !== null);
  await maya.screenshot({ path: resolve(artifacts, "settings.png") });
  process.stdout.write("Sharing and Jam controls verified.\n");
  await closePanel(leo);
  await leo.bringToFront();
  await leo.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await leo.screenshot({ path: resolve(artifacts, "listening-avatars.png") });
  await selectMaya(leo);
  await leo.waitForSelector('.spotify-listening-button', { visible: true });
  assert.equal(await leo.$(".spotify-song"), null);
  await leo.click(".spotify-listening-button");
  await leo.waitForSelector(".spotify-track img", { visible: true });
  await leo.locator("button::-p-text(Play on my Spotify)").click();
  await waitUntil(() => playCalls.length === 1);
  assert.equal((playCalls[0]!.headers as Record<string, string>).authorization, "Bearer test-access-user-leo");
  assert.equal(await leo.$eval('.spotify-song a:last-child', (link) => (link as HTMLAnchorElement).href), "https://spotify.link/browserJam");
  await checkBounds(leo);
  await leo.screenshot({ path: resolve(artifacts, "desktop-song.png") });
  process.stdout.write("Song card and listener playback verified.\n");
  await leo.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await leo.screenshot({ path: resolve(artifacts, "dark-song.png") });
  await leo.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await closeSong(leo);
  await selectMaya(leo);
  await leo.click(".spotify-listening-button");
  await checkBounds(leo);
  await leo.screenshot({ path: resolve(artifacts, "mobile-song.png") });
  await leo.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  assert.equal(await leo.$eval(".spotify-song", (element) => getComputedStyle(element).animationName), "none");
  playback = { ...playbackBody("0VjIjW4GlUZAMYd2vXMi3b"), item: { ...playbackBody("0VjIjW4GlUZAMYd2vXMi3b").item, name: "Next test song" } };
  context.spotify.setOnline("user-maya", true);
  context.spotify.tick();
  await leo.waitForFunction(() => document.querySelector(".spotify-track-text strong")?.textContent === "Next test song");
  playback.is_playing = false;
  context.spotify.setOnline("user-maya", true);
  context.spotify.tick();
  await leo.waitForFunction(() => document.querySelector(".spotify-song")?.textContent?.includes("No listening activity."));
  assert.equal(await leo.$(".spotify-listening-button"), null);
  assert.equal(await leo.$(".spotify-track"), null);
  await leo.screenshot({ path: resolve(artifacts, "paused.png") });
  await maya.locator("button::-p-text(Disconnect Spotify)").click();
  await maya.waitForSelector(".spotify-connect");
  assert.equal((await database.loadSpotifyConnections()).some((record) => record.userId === "user-maya"), false);
  assert.deepEqual([...new Set(issues)], []);
  process.stdout.write("Spotify browser checks passed: OAuth redirect, opt-in sharing, two players, song changes, pause, playback, Jam, disconnect, desktop/mobile/dark/reduced motion.\n");
} catch (error) {
  for (const [index, page] of (await browser.pages()).entries()) {
    await page.screenshot({ path: resolve(artifacts, `failure-${index}.png`) });
    process.stderr.write(`${await page.evaluate(() => document.body.innerText).catch(() => "Page unavailable")}\n`);
  }
  process.stderr.write(`${[...new Set(issues)].join("\n")}\n`);
  throw error;
} finally {
  await browser.close();
  await context.app.close();
}

async function openPlayer(username: string): Promise<Page> {
  const session = await context.auth.authenticate(username, "northstar");
  const browserContext = await browser.createBrowserContext();
  await browserContext.setCookie({ name: "whph_session", value: session!.sessionToken, url: origin, httpOnly: true, sameSite: "Lax" });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => issues.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
  page.on("response", (response) => {
    if (response.status() >= 400) issues.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument("globalThis.__name = (value) => value;");
  await page.evaluateOnNewDocument((serverOrigin) => {
    localStorage.setItem("northstar.serverOrigin", serverOrigin);
    localStorage.setItem("northstar-color-theme", "light");
  }, origin);
  await page.setRequestInterception(true);
  page.on("request", (request) => { void respond(request).catch((error) => issues.push(String(error))); });
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector(".world-canvas canvas");
  await page.waitForFunction(() => document.querySelector('.top-bar [role="status"]')?.textContent === "Connected");
  return page;
}

async function respond(request: HTTPRequest): Promise<void> {
  const url = new URL(request.url());
  if (url.origin === origin) { await request.continue(); return; }
  if (url.hostname === "accounts.spotify.com") {
    await request.respond({ status: 302, headers: { location: `${origin}/v1/spotify/callback?state=${url.searchParams.get("state")}&code=browser-code` } });
    return;
  }
  if (url.hostname === "i.scdn.co") {
    await request.respond({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#29453e"/><circle cx="80" cy="74" r="42" fill="#92b9a0"/><circle cx="100" cy="59" r="39" fill="#29453e"/><path d="M0 135 160 96v64H0" fill="#182f2b"/></svg>' });
    return;
  }
  throw new Error(`Unexpected browser request: ${url.origin}${url.pathname}`);
}

async function closePanel(page: Page): Promise<void> {
  const close = await page.$('button[aria-label="Close people"]');
  if (close) await close.click();
}

async function closeSong(page: Page): Promise<void> {
  await page.click('button[aria-label="Clear selection"]');
}

async function selectMaya(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("World animation did not advance")), 10_000);
    let frames = 0;
    const next = () => { if (++frames > 45) { window.clearTimeout(timeout); resolve(); } else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }));
  const bounds = getOutdoorBounds(floor);
  const rect = await page.$eval(".world-canvas canvas", (canvas) => {
    const box = canvas.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const center = (value: number, start: number, size: number, viewport: number) => viewport >= size
    ? start + size / 2 : Math.max(start + viewport / 2, Math.min(start + size - viewport / 2, value));
  const x = rect.x + rect.width / 2 + (floor.spawn.x - center(floor.spawn.x + 100, bounds.x, bounds.width, rect.width / .78)) * .78;
  const y = rect.y + rect.height / 2 + (floor.spawn.y - center(floor.spawn.y, bounds.y, bounds.height, rect.height / .78)) * .78 - 16;
  await page.mouse.click(x, y);
  await page.waitForSelector('[aria-label="Selected Maya Chen"]');
}

async function checkBounds(page: Page): Promise<void> {
  await page.$eval(".spotify-song", async (card) => {
    await Promise.all(card.getAnimations().map((animation) => animation.finished));
  });
  assert(await page.$eval(".world-actions.contextual", (menu) => {
    const box = menu.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight;
  }), "Song actions are outside the viewport");
  assert(await page.$eval(".spotify-song", (card) => [...card.querySelectorAll("a, button")].every((control) => {
    const box = control.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("a, button") === control;
  })), "Song actions are covered by another control");
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Spotify browser fixture timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
