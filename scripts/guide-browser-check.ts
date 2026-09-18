import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { createOrganisation, createPublicEconomy, type GameGuideStatus } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { createStartingHouse } from "../apps/server/src/world/starting-house.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { PublicEconomyStore } from "../apps/server/src/economy/public-economy-store.js";
import { synchronizeRoomMeetings } from "../apps/server/src/meetings/room-meetings.js";

const output = "../../artifacts/guide";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const checks: string[] = [];
const runtimes: WorldRuntime[] = [];
const targets: Record<string, string> = { coins: "wallet", daily: "daily", items: "assets", approvals: "proposals", "shared-rooms": "room-directory", "room-access": "room-directory", meetings: "meetings", explore: "world" };

interface Scenario {
  name: string;
  width?: number;
  height?: number;
  dark?: boolean;
  restricted?: boolean;
  empty?: boolean;
  ceo?: boolean;
  claimed?: boolean;
  proposals?: boolean;
  touch?: boolean;
  claim?: "keyboard" | "touch";
  ceoRoomAccess?: boolean;
  blockedGuideStorage?: boolean;
  delayedConnection?: boolean;
  hiddenWallet?: boolean;
}

async function connect(scenario: Scenario) {
  const userId = scenario.ceo ? "user-maya" : "user-jonas";
  const data = createTestData();
  const house = createStartingHouse();
  data.floors = [house.floor];
  data.layouts = [house.layout];
  data.members = data.members.filter(member => ["user-maya", "user-jonas"].includes(member.id));
  for (const member of data.members) {
    member.floorId = house.floor.id;
    member.position = house.floor.spawn;
  }
  data.meetings = [];
  data.organisation = createOrganisation(scenario.ceo ? userId : undefined);
  data.gameSettings.roomBuild = { mode: scenario.restricted ? "none" : "open", assignedPersonIds: [] };
  if (scenario.restricted) for (const room of house.layout.rooms) {
    if (room.id !== "room-main") room.access = { mode: "none", assignedPersonIds: [], knockable: true };
  }
  if (scenario.ceoRoomAccess) for (const room of house.layout.rooms) {
    if (room.id !== "room-main") room.access = { mode: "assigned", assignedPersonIds: [], ceos: true, knockable: false };
  }
  if (scenario.empty) { house.layout.rooms = []; house.layout.walls = []; house.layout.objects = []; house.layout.openings = []; }
  synchronizeRoomMeetings([], house.layout.rooms, data.meetings, data.conversations);
  const publicEconomy = new PublicEconomyStore(createPublicEconomy(scenario.ceo ? "hierarchical" : "equal"));
  if (scenario.proposals) publicEconomy.propose("user-maya", "Open building access", { kind: "game.settings", settings: data.gameSettings }, "workspace", data.organisation, data.members.map(member => member.id));
  data.publicEconomy = publicEconomy.view();
  const store = new WorkspaceStore(data);
  if (scenario.claimed) store.claimDailyReward(userId, `guide-${scenario.name}`);
  const runtime = new WorldRuntime(store);
  runtime.start();
  runtimes.push(runtime);
  const commands: string[] = [];
  const context = await browser.newContext({ viewport: { width: scenario.width ?? 1440, height: scenario.height ?? 1000 }, hasTouch: scenario.touch ?? false, isMobile: scenario.touch ?? false });
  await context.addInitScript(({ dark, blockedGuideStorage }) => {
    localStorage.setItem("northstar-color-theme", dark ? "dark" : "light");
    if (blockedGuideStorage) {
      const read = Storage.prototype.getItem;
      const write = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith("game-guide:")) throw new DOMException("Storage blocked", "SecurityError");
        return read.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("game-guide:")) throw new DOMException("Storage full", "QuotaExceededError");
        write.call(this, key, value);
      };
    }
  }, { dark: scenario.dark, blockedGuideStorage: scenario.blockedGuideStorage });
  let guideStatus: GameGuideStatus | null = null;
  await context.route("**/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
    if (route.request().method() === "OPTIONS") await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
    else if (path === "/v1/auth/session") await route.fulfill({ headers, json: { user: { id: userId, username: userId, email: `${userId}@example.test` }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
    else if (path === "/v1/bootstrap") await route.fulfill({ headers, json: store.getBootstrap(userId) });
    else if (path === "/v1/me/game-guide") {
      if (route.request().method() === "PUT") guideStatus = route.request().postDataJSON().status;
      await route.fulfill({ headers, json: { status: guideStatus } });
    }
    else await route.fulfill({ headers, status: 404, json: { error: "Unexpected guide check request" } });
  });
  let releaseConnection: () => void = () => undefined;
  const connectionReady = new Promise<void>(resolve => { releaseConnection = resolve; });
  if (!scenario.delayedConnection) releaseConnection();
  let disconnect: () => void = () => undefined;
  await context.routeWebSocket(/\/v1\//, async socket => {
    await connectionReady;
    const peer = runtime.connect(userId, house.floor.id, event => socket.send(JSON.stringify(event)));
    disconnect = () => { socket.close({ code: 1012, reason: "Connection test" }); runtime.disconnect(peer); };
    socket.onMessage(message => {
      const command = clientCommandSchema.parse(JSON.parse(String(message)));
      commands.push(command.type);
      runtime.handleCommand(peer, command);
    });
    socket.onClose(() => runtime.disconnect(peer));
  });
  const page = await context.newPage();
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  if (scenario.hiddenWallet) await page.addStyleTag({ content: '[data-guide="wallet"] { display: none !important; }' });
  if (!scenario.delayedConnection) await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  await page.locator(".world-canvas canvas").waitFor();
  if (!scenario.claimed) {
    const bonus = page.getByRole("dialog", { name: "Daily bonus", exact: true });
    await bonus.waitFor();
    if (scenario.claim) {
      const balance = store.getPlayerEconomy(userId).coinBalance;
      const claim = bonus.getByRole("button", { name: /^Claim \d+/ });
      if (scenario.claim === "keyboard") { await claim.focus(); await page.keyboard.press("Enter"); }
      else await claim.tap();
      await bonus.getByText("In your pocket!", { exact: true }).waitFor();
      assert.equal(store.getPlayerEconomy(userId).coinBalance, balance + 10);
    }
    await bonus.getByRole("button", { name: "Close daily bonus" }).click();
  }
  return { page, commands, store, userId, releaseConnection, disconnect: () => disconnect() };
}

async function closeBonusAfterRejoin(page: Page) {
  const bonus = page.getByRole("dialog", { name: "Daily bonus", exact: true });
  if (await bonus.isVisible()) await bonus.getByRole("button", { name: "Close daily bonus" }).click();
}

async function verifyStep(page: Page, id: string) {
  const tooltip = page.locator(`.game-guide-tooltip[data-guide-step="${id}"]`);
  const targetSelector = id === "meetings" ? '[data-guide="meetings"] [data-guide-room="room-meeting"]' : `[data-guide="${targets[id]}"]`;
  await tooltip.waitFor();
  await page.waitForFunction(({ targetSelector, centered }) => {
    let element: HTMLElement | null = document.querySelector(".game-guide-tooltip");
    if (!element) return false;
    while (element) { if (Number(getComputedStyle(element).opacity) < 1) return false; element = element.parentElement; }
    if (centered) return true;
    const path = document.querySelector('[data-testid="spotlight"] path:nth-child(2)');
    const target = document.querySelector(targetSelector)?.getBoundingClientRect();
    const spotlight = path?.getBoundingClientRect();
    return path && getComputedStyle(path).opacity === "0" && target && spotlight
      && Math.abs(spotlight.x - target.x + 6) < 2 && Math.abs(spotlight.y - target.y + 6) < 2
      && Math.abs(spotlight.width - target.width - 12) < 2 && Math.abs(spotlight.height - target.height - 12) < 2;
  }, { targetSelector, centered: id === "explore" });
  const rect = await tooltip.boundingBox();
  const viewport = page.viewportSize()!;
  assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, `${id}: tooltip fits viewport ${JSON.stringify({ rect, viewport })}`);
  const target = page.locator(targetSelector);
  assert(await target.isVisible(), `${id}: target is visible`);
  const targetRect = await target.boundingBox();
  assert(targetRect && targetRect.x < viewport.width && targetRect.y < viewport.height && targetRect.x + targetRect.width > 0 && targetRect.y + targetRect.height > 0, `${id}: target is in viewport`);
  assert(await page.locator('[data-testid="spotlight"]').isVisible(), `${id}: spotlight is present`);
  if (id !== "explore") {
    const cutout = page.locator('[data-testid="spotlight"] path').nth(1);
    const spotlight = await cutout.boundingBox();
    assert(spotlight && Math.abs(spotlight.x - targetRect.x + 6) < 2 && Math.abs(spotlight.y - targetRect.y + 6) < 2
      && Math.abs(spotlight.width - targetRect.width - 12) < 2 && Math.abs(spotlight.height - targetRect.height - 12) < 2,
    `${id}: spotlight aligns with the actual target ${JSON.stringify({ spotlight, targetRect })}`);
  }
  if (["coins", "daily", "items", "meetings"].includes(id)) {
    const overlapWidth = Math.max(0, Math.min(rect.x + rect.width, targetRect.x + targetRect.width) - Math.max(rect.x, targetRect.x));
    const overlapHeight = Math.max(0, Math.min(rect.y + rect.height, targetRect.y + targetRect.height) - Math.max(rect.y, targetRect.y));
    assert(overlapWidth * overlapHeight < 1, `${id}: tooltip does not cover the highlighted control ${JSON.stringify({ rect, targetRect })}`);
  }
  assert(await tooltip.evaluate(element => element.scrollWidth <= element.clientWidth), `${id}: text does not overflow horizontally`);
  await tooltip.getByRole("button", { name: id === "explore" ? "Let’s play" : "Next", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert(await tooltip.evaluate((element, interactive) => element.contains(document.activeElement)
    || interactive && Boolean(document.querySelector('[data-guide="daily"]')?.contains(document.activeElement)), id === "daily"), `${id}: focus stays in guide or interactive target`);
  await page.keyboard.press("Shift+Tab");
  assert(await tooltip.getByRole("button", { name: id === "explore" ? "Let’s play" : "Next", exact: true }).evaluate(element => element === document.activeElement), `${id}: reverse tab returns to Next`);
}

async function waitForGuideStatus(page: Page, status: GameGuideStatus) {
  await page.waitForFunction(async expected => {
    const response = await fetch("/v1/me/game-guide");
    return (await response.json()).status === expected;
  }, status);
}

async function verifyGuideButton(page: Page) {
  const button = page.getByRole("button", { name: "How to play", exact: true });
  const rect = await button.boundingBox();
  const viewport = page.viewportSize()!;
  assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height, "Guide button fits viewport");
  if (viewport.width > 700) assert.equal(await button.innerText(), "How to play");
  await button.click({ trial: true });
  assert(await page.locator(".top-bar-actions").evaluate(element => {
    const toolbar = element.closest(".top-bar")!.getBoundingClientRect();
    const actions = element.getBoundingClientRect();
    return actions.left >= toolbar.left && actions.right <= toolbar.right;
  }), "Guide button and toolbar actions fit the header");
}

async function completeTour(page: Page, scenario: Scenario, backwards = false) {
  const ids: string[] = [];
  for (let index = 0; index < 12; index++) {
    const tooltip = page.locator(".game-guide-tooltip");
    await tooltip.waitFor();
    const id = (await tooltip.getAttribute("data-guide-step"))!;
    await verifyStep(page, id);
    if (backwards && ids.length) {
      await tooltip.getByRole("button", { name: "Back", exact: true }).click();
      await verifyStep(page, ids.at(-1)!);
      await page.locator(".game-guide-tooltip").getByRole("button", { name: "Next", exact: true }).click();
      await verifyStep(page, id);
    }
    ids.push(id);
    if (id === "daily" && scenario.claim) await tooltip.getByText(/Today’s bonus is already claimed/).waitFor();
    await page.screenshot({ path: `${output}/${scenario.name}-${id}.png` });
    const finish = tooltip.getByRole("button", { name: "Let’s play", exact: true });
    if (await finish.isVisible()) { if (scenario.touch) await finish.tap(); else await finish.click(); break; }
    const next = tooltip.getByRole("button", { name: "Next", exact: true });
    if (scenario.touch) await next.tap(); else await next.click();
    await page.locator(`.game-guide-tooltip[data-guide-step="${id}"]`).waitFor({ state: "hidden" });
  }
  await page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
  assert.equal(ids.at(-1), "explore");
  checks.push(`${scenario.name}: ${ids.join(" → ")}; targets, placement, focus, and completion passed.`);
  return ids;
}

let currentPage: Page | undefined;
try {
  for (const scenario of [
    { name: "desktop", proposals: true, claim: "keyboard" },
    { name: "desktop-dark", dark: true },
    { name: "mobile-light", width: 390, height: 844, touch: true, claim: "touch" },
    { name: "mobile-dark", width: 390, height: 844, dark: true, claimed: true, touch: true },
    { name: "small-restricted", width: 360, height: 640, restricted: true, touch: true },
    { name: "ceo-landscape", width: 844, height: 390, ceo: true, ceoRoomAccess: true, touch: true },
    { name: "landscape-dark", width: 667, height: 375, dark: true, touch: true, claim: "touch" },
    { name: "ceo-restricted", ceo: true, restricted: true },
    { name: "empty", empty: true },
  ] satisfies Scenario[]) {
    if (process.argv[2] && process.argv[2] !== scenario.name) continue;
    console.log(`Checking ${scenario.name}`);
    const { page, commands, store, userId } = await connect(scenario);
    currentPage = page;
    const initialBalance = store.getPlayerEconomy(userId).coinBalance;
    await verifyStep(page, "coins");
    const ids = await completeTour(page, scenario, scenario.name === "desktop");
    assert.equal(store.getPlayerEconomy(userId).coinBalance, initialBalance);
    assert(!commands.some(command => /public_economy|project\.|layout\.|player_asset\.|movement\.move|meeting\.open/.test(command)), "Tour does not change gameplay");
    if (scenario.restricted || scenario.empty) assert(!ids.includes("meeting-room") && !ids.includes("meetings"));
    if (scenario.restricted) assert(ids.includes("room-access"));
    if (scenario.empty) assert.equal(ids.length, 5);
    if (!scenario.restricted && !scenario.empty) assert.deepEqual(ids, ["coins", "daily", "items", "approvals", "shared-rooms", "meetings", "explore"]);
    assert.equal(await page.locator('[data-guide="assets"]').count(), 0, "Completion restores the original map");
    await waitForGuideStatus(page, "completed");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await closeBonusAfterRejoin(page);
    assert.equal(await page.locator(".game-guide-tooltip").count(), 0);
    await verifyGuideButton(page);
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.keyboard.press("Escape");
    await page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    for (let index = 0; index < 3; index++) await page.locator(".game-guide-tooltip").getByRole("button", { name: "Next", exact: true }).click();
    await verifyStep(page, "approvals");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Approvals", exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.locator(".game-guide-tooltip").getByRole("button", { name: "Skip guide", exact: true }).click();
    await page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.mouse.click(2, 2);
    await page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
    checks.push(`${scenario.name}: claim state, reload persistence, replay, close button, Escape from map and dialog, and unchanged game state passed.`);
    await page.context().close();
  }
  if (!process.argv[2] || process.argv[2] === "recovery") {
    const { page } = await connect({ name: "skip-auto" });
    currentPage = page;
    await verifyStep(page, "coins");
    await page.getByRole("button", { name: "Skip guide", exact: true }).click();
    await waitForGuideStatus(page, "skipped");
    await page.reload();
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await closeBonusAfterRejoin(page);
    assert.equal(await page.locator(".game-guide-tooltip").count(), 0);
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Shared", exact: true }).click();
    await page.getByRole("button", { name: "Wall", exact: true }).click();
    assert(await page.getByRole("button", { name: "How to play", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Close build tools", exact: true }).click();
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.keyboard.press("Escape");
    checks.push("Skipped automatic guide stays skipped after reload; replay remains available; an active building tool prevents the guide from interrupting.");
    await page.getByRole("button", { name: "Build", exact: true }).click();
    await page.getByRole("button", { name: "Shared", exact: true }).click();
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await completeTour(page, { name: "restore-shared" });
    await page.getByRole("button", { name: "Wall", exact: true }).waitFor();
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Wall", exact: true }).waitFor();
    await page.getByRole("button", { name: "Close build tools", exact: true }).click();
    checks.push("Completion and dismissal restore the previous Shared build view.");
    const hiddenTarget = await page.addStyleTag({ content: '[data-guide="wallet"] { display: none !important; }' });
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await page.locator('[data-guide="assets"]').waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "How to play", exact: true }).waitFor();
    assert(await page.getByRole("button", { name: "How to play", exact: true }).isEnabled());
    assert.equal(await page.getByRole("alert").filter({ hasText: "The guide could not open this screen" }).count(), 0);
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await page.getByRole("dialog", { name: "Opening guide", exact: true }).getByRole("button", { name: "Skip guide", exact: true }).click();
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "The guide could not open this screen" }).waitFor();
    await hiddenTarget.evaluate(element => element.remove());
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(page, "coins");
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyStep(page, "coins");
    await page.locator(".game-guide-tooltip").getByRole("button", { name: "Next", exact: true }).click();
    await verifyStep(page, "daily");
    await page.setViewportSize({ width: 844, height: 390 });
    await verifyStep(page, "daily");
    assert(await page.getByRole("button", { name: "Daily bonus", exact: true }).isVisible());
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyStep(page, "daily");
    await page.keyboard.press("Escape");
    checks.push("Escape cancels a waiting transition; a missing target exits with recovery; replay and resizing during a step work.");
    await page.context().close();
  }
  if (!process.argv[2] || process.argv[2] === "startup") {
    const delayed = await connect({ name: "delayed", delayedConnection: true });
    currentPage = delayed.page;
    assert(await delayed.page.getByRole("button", { name: "How to play", exact: true }).isDisabled());
    assert.equal(await delayed.page.locator(".game-guide-tooltip").count(), 0);
    delayed.releaseConnection();
    await verifyStep(delayed.page, "coins");
    delayed.disconnect();
    await delayed.page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
    await delayed.page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    assert.equal(await delayed.page.locator(".game-guide-tooltip").count(), 0);
    await delayed.page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(delayed.page, "coins");
    await delayed.page.keyboard.press("Escape");
    await delayed.page.context().close();
    checks.push("Automatic startup waits for the realtime connection; disconnect closes the guide; reconnect does not restart it; replay works.");

    const blocked = await connect({ name: "blocked-storage", blockedGuideStorage: true });
    currentPage = blocked.page;
    await verifyStep(blocked.page, "coins");
    await blocked.page.getByRole("button", { name: "Skip guide", exact: true }).click();
    await blocked.page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(blocked.page, "coins");
    await blocked.page.keyboard.press("Escape");
    await blocked.page.context().close();
    checks.push("Guide-specific storage read/write failures do not block automatic startup, Skip, or replay.");

    const loading = await connect({ name: "startup-loading", delayedConnection: true, hiddenWallet: true });
    currentPage = loading.page;
    loading.releaseConnection();
    await loading.page.getByRole("dialog", { name: "Opening guide", exact: true }).getByRole("button", { name: "Skip guide", exact: true }).click();
    assert(await loading.page.getByRole("button", { name: "How to play", exact: true }).isEnabled());
    await loading.page.reload();
    await loading.page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await closeBonusAfterRejoin(loading.page);
    await loading.page.getByRole("button", { name: "How to play", exact: true }).click();
    await verifyStep(loading.page, "coins");
    await loading.page.keyboard.press("Escape");
    await loading.page.context().close();
    checks.push("Automatic startup can be skipped while its target is loading; skip persists across reload and replay recovers.");
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/${process.argv[2] ? `${process.argv[2]}-results` : "results"}.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.join("\n"));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    console.log(await currentPage.locator("body").innerText());
    await currentPage.screenshot({ path: `${output}/failure.png` });
  }
  throw error;
} finally {
  for (const runtime of runtimes) runtime.stop();
  await browser.close();
}
