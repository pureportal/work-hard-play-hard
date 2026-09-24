import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { createOrganisation, type GameGuideStatus } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { createStartingHouse } from "../apps/server/src/world/starting-house.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { synchronizeRoomMeetings } from "../apps/server/src/meetings/room-meetings.js";

const output = "../../artifacts/daily-bonus";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const checks: string[] = [];
let currentPage: Page | undefined;
let runtime: WorldRuntime | undefined;

async function fits(page: Page, selector: string) {
  const element = page.locator(selector);
  const rect = await element.boundingBox();
  const viewport = page.viewportSize()!;
  assert(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1, `${selector} fits viewport`);
  assert(await element.evaluate(node => node.scrollWidth <= node.clientWidth), `${selector} has no horizontal overflow`);
}

try {
  for (const scenario of [
    { name: "desktop", width: 1440, height: 1000, dark: false },
    { name: "mobile", width: 390, height: 844, dark: false },
    { name: "small-dark", width: 360, height: 640, dark: true },
    { name: "landscape", width: 667, height: 375, dark: true },
    { name: "reduced-motion", width: 1280, height: 800, dark: false },
  ]) {
    if (process.argv[2] && process.argv[2] !== scenario.name) continue;
    const data = createTestData();
    const house = createStartingHouse();
    const userId = "user-jonas";
    data.floors = [house.floor];
    data.layouts = [house.layout];
    data.members = data.members.filter(member => ["user-maya", userId].includes(member.id));
    for (const member of data.members) { member.floorId = house.floor.id; member.position = house.floor.spawn; }
    data.organisation = createOrganisation();
    data.meetings = [];
    synchronizeRoomMeetings([], house.layout.rooms, data.meetings, data.conversations);
    const store = new WorkspaceStore(data);
    runtime = new WorldRuntime(store);
    runtime.start();
    const world = runtime;
    let guideStatus: GameGuideStatus | null = null;
    let rejectClaim = scenario.name === "desktop";
    const commands: string[] = [];
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.width < 700, reducedMotion: scenario.name === "reduced-motion" ? "reduce" : "no-preference" });
    await context.addInitScript(dark => localStorage.setItem("northstar-color-theme", dark ? "dark" : "light"), scenario.dark);
    await context.route("**/v1/**", async route => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
      if (route.request().method() === "OPTIONS") await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, PUT" } });
      else if (path === "/v1/auth/session") await route.fulfill({ headers, json: { user: { id: userId, username: userId, email: `${userId}@example.test` }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() } });
      else if (path === "/v1/bootstrap") await route.fulfill({ headers, json: store.getBootstrap(userId) });
      else if (path === "/v1/me/game-guide") {
        if (route.request().method() === "PUT") guideStatus = route.request().postDataJSON().status;
        await route.fulfill({ headers, json: { status: guideStatus } });
      } else await route.fulfill({ headers, status: 404, json: { error: "Unexpected request" } });
    });
    await context.routeWebSocket(/\/v1\//, socket => {
      const peer = world.connect(userId, house.floor.id, event => socket.send(JSON.stringify(event)));
      socket.onMessage(message => {
        const command = clientCommandSchema.parse(JSON.parse(String(message)));
        commands.push(command.type);
        if (command.type === "economy.claim_daily" && rejectClaim) {
          rejectClaim = false;
          socket.send(JSON.stringify({ type: "command.error", requestId: command.requestId, message: "Bonus could not be collected. Try again." }));
        } else world.handleCommand(peer, command);
      });
      socket.onClose(() => world.disconnect(peer));
    });
    const page = await context.newPage();
    currentPage = page;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    const dialog = page.getByRole("dialog", { name: "Daily bonus", exact: true });
    await dialog.waitFor();
    await fits(page, ".daily-bonus-dialog");
    if (scenario.name === "landscape") await fits(page, ".daily-bonus-claim");
    assert.equal(await page.locator(".game-guide-tooltip").count(), 0, "Bonus precedes guide");
    assert(await dialog.evaluate(node => node.contains(document.activeElement)), "Dialog takes focus");
    await page.screenshot({ path: `${output}/${scenario.name}-bonus.png` });
    if (scenario.name === "reduced-motion") assert(await dialog.evaluate(node => getComputedStyle(node).animationName === "none"));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.locator('.game-guide-tooltip[data-guide-step="coins"]').waitFor();
    await fits(page, ".game-guide-tooltip");
    await page.locator(".game-guide-tooltip").getByRole("button", { name: "Next", exact: true }).click();
    const dailyStep = page.locator('.game-guide-tooltip[data-guide-step="daily"]');
    await dailyStep.waitFor();
    await fits(page, ".game-guide-tooltip");
    await fits(page, '[data-guide="daily"]');
    assert(await dailyStep.innerText().then(text => text.includes("gift button")));
    await page.screenshot({ path: `${output}/${scenario.name}-guide.png` });
    await page.keyboard.press("Escape");
    await page.locator(".game-guide-tooltip").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Daily bonus", exact: true }).click();
    await dialog.waitFor();
    const claim = dialog.getByRole("button", { name: "Claim 10 coins", exact: true });
    await claim.focus();
    await page.keyboard.press("Tab");
    assert(await dialog.getByRole("button", { name: "Close daily bonus" }).evaluate(node => node === document.activeElement), "Focus wraps");
    await page.keyboard.press("Shift+Tab");
    assert(await claim.evaluate(node => node === document.activeElement));
    const balance = store.getPlayerEconomy(userId).coinBalance;
    if (scenario.name === "desktop") {
      await claim.click();
      await dialog.waitFor({ state: "hidden" });
      await page.locator(".toast").filter({ hasText: "Try again" }).waitFor();
      assert.equal(store.getPlayerEconomy(userId).coinBalance, balance);
      await page.getByRole("button", { name: "Daily bonus", exact: true }).click();
    }
    await claim.focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(store.getPlayerEconomy(userId).coinBalance, balance + 10);
    await page.getByRole("button", { name: "Daily bonus", exact: true }).click();
    await dialog.getByText("In your pocket!", { exact: true }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: /^Claim/ }).count(), 0);
    assert.equal(await dialog.locator(".daily-bonus-reward strong").innerText(), "+10coins", "Shows claimed reward, not tomorrow's 15 coins");
    await page.screenshot({ path: `${output}/${scenario.name}-claimed.png` });
    await dialog.getByRole("button", { name: "Let’s play", exact: true }).click();
    await page.getByRole("button", { name: "How to play", exact: true }).click();
    const stepIds: string[] = [];
    for (let step = 0; step < 12; step++) {
      const tooltip = page.locator(".game-guide-tooltip");
      await tooltip.waitFor();
      const id = (await tooltip.getAttribute("data-guide-step"))!;
      stepIds.push(id);
      await fits(page, ".game-guide-tooltip");
      if (id === "daily") assert((await tooltip.innerText()).includes("already claimed"));
      const finish = tooltip.getByRole("button", { name: "Let’s play", exact: true });
      if (await finish.isVisible()) { await finish.click(); break; }
      await tooltip.getByRole("button", { name: "Next", exact: true }).click();
      await page.locator(`.game-guide-tooltip[data-guide-step="${id}"]`).waitFor({ state: "hidden" });
    }
    assert.equal(stepIds.at(-1), "explore", "Guide completes");
    await page.waitForFunction(async () => (await (await fetch("/v1/me/game-guide")).json()).status === "completed");
    await page.reload();
    await page.getByRole("button", { name: "How to play", exact: true }).waitFor();
    assert.equal(await dialog.count(), 0, "Claimed bonus does not auto-open on rejoin");
    assert.equal(await page.locator(".game-guide-tooltip").count(), 0, "Completed guide stays closed");
    await page.getByRole("button", { name: "Daily bonus", exact: true }).click();
    await dialog.getByText("In your pocket!", { exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Close daily bonus" }).click();
    assert(!commands.some(command => /layout\.|player_asset\.|movement\.move|meeting\.open/.test(command)), "Dialogs do not change gameplay");
    checks.push(`${scenario.name}: auto-open, close, reopen, keyboard, claim, guide sequence/completion, rejoin, and viewport fit passed`);
    console.log(checks.at(-1));
    await context.close();
    world.stop();
    runtime = undefined;
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/${process.argv[2] ? `${process.argv[2]}-results` : "results"}.json`, JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    console.log(await currentPage.locator("body").innerText());
    await currentPage.screenshot({ path: `${output}/failure.png` });
  }
  throw error;
} finally {
  runtime?.stop();
  await browser.close();
}
