import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";
import { DEFAULT_CHARACTER_APPEARANCE } from "../packages/shared/src/index.js";

const origin = "http://127.0.0.1:41235";
const distribution = resolve("../../apps/client/dist");
const artifacts = resolve("../../artifacts/github");
await mkdir(artifacts, { recursive: true });
let mergedCount = 1;
let unavailable = false;
const searches: string[] = [];
const database = new MemoryDatabase();
const context = await createTestApplication({ database, fixture: true, spotifyConfig: null, clientUrl: origin,
  githubConfig: { clientId: "Iv1.browser", clientSecret: "fixture-secret", appSlug: "fixture-mailroom", redirectUri: `${origin}/v1/github/callback`, encryptionKey: Buffer.alloc(32, 19) },
  githubFetch: async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path === "/login/oauth/access_token") {
      const body = options!.body as URLSearchParams;
      assert.equal(body.get("client_id"), "Iv1.frontend");
      assert.equal(body.get("client_secret"), "frontend-secret");
      return Response.json({ access_token: "ghu_browser", refresh_token: "ghr_browser", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer", scope: "" });
    }
    if (path === "/user") return Response.json({ login: "maya" });
    if (unavailable) return Response.json({}, { status: 404 });
    if (path === "/user/repos") return Response.json([{ full_name: "studio/office", private: true }]);
    if (path === "/repos/studio/office") return Response.json({ full_name: "studio/office", private: true });
    if (path === "/graphql") {
      const { search, after } = JSON.parse(options!.body as string).variables as { search: string; after: string | null };
      searches.push(search);
      if (after) return Response.json({}, { status: 404 });
      const merged = search.includes("is:merged");
      const rows = [
        { number: 42, title: "Polish the office lighting", isDraft: false, reviewDecision: "APPROVED" },
        { number: 43, title: "Make review links keyboard friendly", isDraft: false, reviewDecision: "REVIEW_REQUIRED" },
        { number: 44, title: "Add a little paperwork", isDraft: true, reviewDecision: null },
      ].slice(0, merged ? mergedCount : 3).map((row) => ({ ...row, author: { login: "maya" }, state: merged ? "MERGED" : "OPEN",
        updatedAt: "2026-09-15T10:00:00Z", mergedAt: merged ? `2026-09-15T${row.number === 42 ? "09" : "10"}:00:00Z` : null,
        repository: { nameWithOwner: "studio/office" } }));
      return Response.json({ data: { search: { issueCount: merged ? rows.length : 26, nodes: rows, pageInfo: { hasNextPage: !merged, endCursor: merged ? null : "next-page" } } } });
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  },
});
const floor = context.store.getFloor("floor-studio")!;
const state = context.store.exportMutableState();
state.members = state.members.map((member) => ({ ...member, character: { ...DEFAULT_CHARACTER_APPEARANCE } }));
const layout = state.layouts.find((candidate) => candidate.floorId === floor.id)!;
layout.rooms = [];
layout.walls = [];
layout.openings = [];
const x = Math.ceil((floor.spawn.x + 32) / 16) * 16;
const y = Math.floor((floor.spawn.y - 16) / 16) * 16;
layout.objects = [
  { id: "mailroom-desk", floorId: floor.id, assetId: "desk-straight", variantId: "oak", rotation: 0, x, y },
  { id: "mailroom-tray", floorId: floor.id, assetId: "decor-pr-tray", variantId: "ivory", rotation: 0, x, y },
];
context.store.restoreMutableState(state);
context.runtime.restorePlayers(context.runtime.serializePlayers().filter((player) => player.userId === "user-maya").map((player) => ({ ...player, x: floor.spawn.x, y: floor.spawn.y })));
const session = await context.auth.authenticate("maya", "northstar");
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
try {
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light" });
  await browserContext.addCookies([{ name: "whph_session", value: session!.sessionToken, url: origin, httpOnly: true, sameSite: "Lax" }]);
  await browserContext.addInitScript("globalThis.__name = (value) => value;");
  await browserContext.routeWebSocket(/\/v1\/realtime/, (socket) => {
    const peer = context.runtime.connect("user-maya", floor.id, (event) => socket.send(JSON.stringify(event)));
    socket.onMessage((message) => context.runtime.handleCommand(peer, JSON.parse(String(message))));
    socket.onClose(() => context.runtime.disconnect(peer));
  });
  await browserContext.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "github.com" && url.pathname === "/login/oauth/authorize") {
      await route.fulfill({ status: 302, headers: { location: `${origin}/v1/github/callback?state=${url.searchParams.get("state")}&code=fixture` } });
      return;
    }
    assert.equal(url.origin, origin);
    if (url.pathname.startsWith("/v1/")) {
      const response = await context.app.inject({ method: request.method() as "GET" | "POST" | "PUT" | "DELETE", url: url.pathname + url.search,
        headers: await request.allHeaders(), ...(request.postData() ? { payload: request.postData()! } : {}) });
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join("\n") : String(value)]));
      await route.fulfill({ status: response.statusCode, headers, body: response.rawPayload });
      return;
    }
    const path = resolve(distribution, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    assert(path.startsWith(distribution + sep));
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };
    await route.fulfill({ contentType: types[extname(path)] ?? "application/octet-stream", body: await readFile(path) });
  });
  const page = await browserContext.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator(".world-canvas canvas").waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Server settings", exact: true }).click();
  await page.getByRole("tab", { name: "GitHub", exact: true }).click();
  await page.getByLabel("Client ID", { exact: true }).fill("Iv1.frontend");
  await page.getByLabel("Client secret", { exact: true }).fill("frontend-secret");
  await page.getByLabel("App slug", { exact: true }).fill("frontend-mailroom");
  await page.getByRole("button", { name: "Save GitHub", exact: true }).click();
  await page.waitForFunction(() => (Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "Save GitHub"))?.disabled);
  assert.equal(await page.getByLabel("Replace client secret", { exact: true }).inputValue(), "");
  const settings = (await database.loadWorkspaceState())!.store.githubAppSettings!;
  assert.equal(settings.clientId, "Iv1.frontend");
  assert.equal(settings.appSlug, "frontend-mailroom");
  assert(!JSON.stringify(settings).includes("frontend-secret"));
  for (const [width, height, name] of [[1440, 960, "light"], [390, 844, "mobile"]] as const) {
    await page.setViewportSize({ width, height });
    assert(await page.getByRole("dialog", { name: "Server settings" }).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
    }), "GitHub settings extend outside the viewport");
    await page.getByRole("button", { name: "Save GitHub", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(artifacts, `server-github-${name}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("tab", { name: "Spotify", exact: true }).click();
  await page.getByRole("tab", { name: "GitHub", exact: true }).click();
  await page.getByLabel("Replace client secret", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Client ID", { exact: true }).inputValue(), "Iv1.frontend");
  assert.equal(await page.getByLabel("Replace client secret", { exact: true }).inputValue(), "");
  await page.getByRole("button", { name: "Close server settings", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Connect GitHub", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect GitHub", exact: true }).waitFor();
  assert.equal(context.github.status("user-maya").connected, true);
  await page.screenshot({ path: resolve(artifacts, "connection.png") });
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.screenshot({ path: resolve(artifacts, "mailroom-world.png") });
  await page.getByRole("button", { name: "Open tray", exact: true }).click();
  await page.getByLabel("Repository", { exact: true }).selectOption("studio/office");
  await page.getByText("Polish the office lighting", { exact: true }).waitFor();
  await checkBounds(page);
  await page.screenshot({ path: resolve(artifacts, "mailroom-light.png") });
  const firstPull = page.getByRole("link", { name: /Polish the office lighting/ });
  await firstPull.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await firstPull.evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
  assert(await firstPull.locator(".github-pull-meta").count());
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("link", { name: /Make review links keyboard friendly/ }).evaluate((element) => element === document.activeElement), true);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({ path: resolve(artifacts, "mailroom-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkBounds(page);
  await page.screenshot({ path: resolve(artifacts, "mailroom-mobile.png") });
  for (const [width, height] of [[320, 568], [844, 390]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await checkBounds(page);
    await page.screenshot({ path: resolve(artifacts, `mailroom-${width}x${height}.png`) });
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Repository unavailable. Check GitHub access or choose another repository." }).waitFor();
  assert.equal(await page.getByText("Polish the office lighting", { exact: true }).count(), 0);
  assert(await page.getByRole("button", { name: "Previous", exact: true }).isEnabled());
  assert(await page.getByRole("button", { name: "Next", exact: true }).isDisabled());
  await checkBounds(page);
  await page.screenshot({ path: resolve(artifacts, "pagination-failure.png") });
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByText("Polish the office lighting", { exact: true }).waitFor();
  for (const [label, filter] of [["Mine", "author:@me"], ["Review requests", "review-requested:@me"], ["Open", "is:open"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByText("Polish the office lighting", { exact: true }).waitFor();
    assert(searches.at(-1)!.includes(filter!));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Merged", exact: true }).click();
  await page.getByText("1 pull request", { exact: true }).waitFor();
  assert.equal(await page.locator(".github-merge-arrival").count(), 0);
  mergedCount = 2;
  await page.getByRole("button", { name: "Refresh pull requests" }).click();
  await page.getByText("Merged #43", { exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".github-merge-arrival svg").evaluate((element) => getComputedStyle(element).animationName), "none");
  await page.screenshot({ path: resolve(artifacts, "merge.png") });
  unavailable = true;
  await page.getByRole("button", { name: "Refresh pull requests" }).click();
  await page.getByText("Repository unavailable. Check GitHub access or choose another repository.", { exact: true }).waitFor();
  assert.equal(await page.getByText("Polish the office lighting", { exact: true }).count(), 0);
  await page.screenshot({ path: resolve(artifacts, "access-removed.png") });
  await page.getByRole("button", { name: "Disconnect GitHub", exact: true }).click();
  await page.getByRole("button", { name: "Connect GitHub", exact: true }).waitFor();
  assert.deepEqual(await database.loadGitHubConnections(), []);
  assert.deepEqual(errors, []);
  process.stdout.write("GitHub browser checks passed: frontend app configuration, simulated OAuth through the real server, world tray, filters, pagination recovery, desktop/mobile/dark layout, merge effect, reduced motion, access removal and disconnect.\n");
} catch (error) {
  process.stderr.write(`${JSON.stringify(errors)}\n`);
  for (const [index, page] of browser.contexts().flatMap((item) => item.pages()).entries()) await page.screenshot({ path: resolve(artifacts, `failure-${index}.png`) });
  throw error;
} finally {
  await browser.close();
  await context.app.close();
}

async function checkBounds(page: Page): Promise<void> {
  assert(await page.locator(".github-mailroom").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
  }), "Mailroom extends outside the viewport");
  assert(await page.getByRole("button", { name: "Close PR tray" }).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("button") === element;
  }), "Close button is hidden while the mailroom is scrolled");
}
