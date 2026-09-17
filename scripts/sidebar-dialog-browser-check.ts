import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Locator, type WebSocketRoute } from "playwright-core";
import puppeteer from "puppeteer";
import type { Application } from "../apps/client/node_modules/pixi.js";
import { createOrganisation, createPublicEconomy, detectLayoutRooms, getPlacedAssetInteractions, type ClientCommand, type ServerEvent } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { installWorldProbe, worldReady } from "./characters/playwright-animation.js";

const output = fileURLToPath(new URL("../artifacts/sidebar-dialog-review/", import.meta.url));
await mkdir(output, { recursive: true });
const baseline = process.argv.includes("--baseline");
const data = createTestData();
data.organisation = { ...createOrganisation(), ceoIds: ["user-maya"] };
data.publicEconomy = createPublicEconomy("hierarchical");
const store = new WorkspaceStore(data);
store.purchaseAsset("user-maya", "chair-office", "review-chair");
const runtime = new WorldRuntime(store);
const commands: ClientCommand[] = [];
const errors: string[] = [];
const checks: string[] = [];
const events: ServerEvent[] = [];
let pauseCommand: ClientCommand["type"] | undefined;
let heldRequest: { requestId: string; socket: WebSocketRoute } | undefined;
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
const sourceRevision = String(Date.now());
await context.route(/\/src\/.*\.(tsx?|css)(?:\?|$)/, async (route) => {
  const url = new URL(route.request().url());
  url.searchParams.set("review", sourceRevision);
  await route.fulfill({ response: await route.fetch({ url: url.toString() }) });
});
await context.route("**/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/v1/auth/session") await route.fulfill({ json: {
    user: { id: "user-maya", username: "maya", email: "maya@example.test" }, setupRequired: false,
    registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity(),
  } });
  else if (path === "/v1/bootstrap") await route.fulfill({ json: store.getBootstrap("user-maya") });
  else await route.fulfill({ status: 404, json: { error: "Unexpected sidebar review request" } });
});
await context.routeWebSocket(/\/v1\/realtime/, (socket) => {
  const peer = runtime.connect("user-maya", "floor-studio", (event) => {
    if (event.type !== "world.snapshot") events.push(event);
    socket.send(JSON.stringify(event));
  });
  socket.onMessage((message) => {
    const command = clientCommandSchema.parse(JSON.parse(String(message)));
    commands.push(command);
    if (command.type === pauseCommand && "requestId" in command) {
      heldRequest = { requestId: command.requestId, socket };
      return;
    }
    runtime.handleCommand(peer, command);
  });
  socket.onClose(() => runtime.disconnect(peer));
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (error) => errors.push(error.message));
await installWorldProbe(page);
runtime.start();

async function capture(name: string) {
  await page.locator(".deferred-content-status").waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    const artwork = [...document.querySelectorAll<SVGImageElement>(".side-panel image, .workspace-dialog image, .confirmation-dialog image")]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.width && rect.bottom > 0 && rect.top < innerHeight; });
    await Promise.all(artwork.map(async (element) => {
      const image = new Image();
      image.src = element.href.baseVal;
      await image.decode();
    }));
  });
  await page.screenshot({ path: `${output}/${baseline ? "before" : "after"}-${name}.png` });
}

async function click(name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function assertFits(locator: Locator) {
  const size = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight,
      overflow: element.scrollWidth > element.clientWidth + 1 };
  });
  assert(size.left >= 0 && size.top >= 0 && size.right <= size.width + 1 && size.bottom <= size.height + 1 && !size.overflow, JSON.stringify(size));
}

async function worldPoint(x: number, y: number) {
  return page.evaluate((point) => {
    const app = globalThis.avatarWorld as unknown as Application;
    const position = app.stage.children[0]!.toGlobal(point);
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + position.x * canvas.width / app.screen.width, y: canvas.y + position.y * canvas.height / app.screen.height };
  }, { x, y });
}

async function position(x: number, y: number) {
  runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya" ? { ...player, x, y } : player));
  await page.waitForFunction(({ x, y }) => {
    const player = globalThis.findAvatar("You")?.parent?.parent;
    return player && Math.hypot(player.x - x, player.y - y) < 2;
  }, { x, y });
}

function failHeldRequest() {
  assert(heldRequest, `No intercepted ${pauseCommand} request`);
  heldRequest.socket.send(JSON.stringify({ type: "command.error", requestId: heldRequest.requestId,
    code: "REQUEST_FAILED", message: "Could not complete the action. Try again." }));
  heldRequest = undefined;
  pauseCommand = undefined;
}

try {
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await worldReady(page);
  await capture("people");
  await click("Meetings");
  await capture("meetings");
  await click("Build");
  await click("Personal");
  await capture("personal");
  await click("Shared");
  await capture("build");
  await click("Funds & votes");
  await page.getByRole("dialog", { name: "Funds & votes", exact: true }).waitFor();
  await capture("funds");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("funds-mobile");
  await click("Back to build");
  await capture("build-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await click("Room settings");
  await capture("rooms");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("rooms-mobile");
  if (!baseline) {
    await click("Close room settings");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await click("Build");
    await click("Funds & votes");
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        const dialog = page.getByRole("dialog", { name: "Funds & votes", exact: true });
        assert.equal(await dialog.locator(".fund-overview").evaluate((element) => element.parentElement?.getAttribute("role")), "tabpanel");
        await assertFits(dialog);
        await assertFits(dialog.locator(".surface-header"));
        const votes = page.getByRole("tab", { name: "Votes", exact: true });
        await votes.focus();
        await page.keyboard.press("End");
        const selected = page.getByRole("tab", { name: "Settings", exact: true });
        assert.equal(await selected.getAttribute("aria-selected"), "true");
        await assertFits(selected);
        await page.getByRole("tab", { name: "Donate", exact: true }).click();
        await page.getByRole("spinbutton", { name: "Donation", exact: true }).fill("100");
        await click("Review donation");
        const confirmation = page.getByRole("dialog", { name: "Donate 100 coins to Workspace?", exact: true });
        await assertFits(confirmation);
        assert(await confirmation.getByRole("button", { name: "Edit amount" }).evaluate((button) => button === document.activeElement));
        await page.keyboard.press("Shift+Tab");
        assert(await confirmation.getByRole("button", { name: "Donate coins" }).evaluate((button) => button === document.activeElement));
        await page.keyboard.press("Escape");
        await confirmation.waitFor({ state: "hidden" });
        assert(await dialog.isVisible());
        await assertFits(dialog.locator(".surface-header"));
        assert(await page.getByRole("button", { name: "Review donation", exact: true }).evaluate((button) => {
          const action = button.getBoundingClientRect();
          const content = button.closest(".dialog-tab-content")!.getBoundingClientRect();
          return document.activeElement === button && action.top >= content.top && action.bottom <= content.bottom;
        }), "Closing the confirmation should restore a fully visible action");
        await capture(`funds-${theme}-${viewport.width}x${viewport.height}`);
        await click("Back to build");
        await assertFits(page.getByRole("complementary", { name: "Build", exact: true }));
        await capture(`build-${theme}-${viewport.width}x${viewport.height}`);
        await click("Funds & votes");
      }
    }
    checks.push("Light/dark desktop, tablet, mobile, 320px and short-screen layouts; keyboard tabs, modal focus and nested Escape.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("tab", { name: "Donate", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Donation", exact: true }).fill("100");
    await click("Review donation");
    pauseCommand = "economy.donate";
    await click("Donate coins");
    const donation = page.getByRole("dialog", { name: "Donate 100 coins to Workspace?", exact: true });
    assert(await donation.getByRole("button", { name: "Donate coins" }).isDisabled());
    await page.keyboard.press("Escape");
    assert(await donation.isVisible());
    failHeldRequest();
    await donation.getByRole("alert").waitFor();
    await click("Donate coins");
    await donation.waitFor({ state: "hidden" });
    assert.equal(store.getPlayerEconomy("user-maya").coinBalance, 80);
    assert.equal(store.getPublicEconomy().funds[0]!.balance, 100);
    await click("Back to build");
    await click("Personal");
    await page.locator(".inventory-asset").getByRole("button", { name: "Donate", exact: true }).click();
    const assetDonation = page.getByRole("dialog", { name: "Donate Office chair?", exact: true });
    await page.keyboard.press("Enter");
    await assetDonation.waitFor({ state: "hidden" });
    assert.equal(store.getPublicEconomy().inventory.length, 0);
    await page.locator(".inventory-asset").getByRole("button", { name: "Donate", exact: true }).click();
    await click("Donate item");
    await assetDonation.waitFor({ state: "hidden" });
    assert.equal(store.getPublicEconomy().inventory.length, 1);
    assert.equal(store.getPlayerEconomy("user-maya").coinBalance, 80);
    await click("Funds & votes");
    await page.getByRole("tab", { name: "Shared items", exact: true }).click();
    assert(await page.getByRole("button", { name: "Place", exact: true }).isVisible());
    await capture("shared-items");
    await click("Close funds & votes");
    checks.push("Donation confirmation prevents cancellation while pending, recovers from failure, and separates private coins/assets from shared funds/inventory.");

    const chair = store.getLayout("floor-studio")!.objects.find((object) => object.id === "object-chair-maya")!;
    const seat = getPlacedAssetInteractions(chair)[0]!;
    const seatPoint = await worldPoint(seat.center.x, seat.center.y);
    await page.mouse.click(seatPoint.x, seatPoint.y);
    const selectedObject = page.getByRole("region", { name: "Selected place", exact: true });
    await selectedObject.getByRole("button", { name: "Sit", exact: true }).click();
    await selectedObject.waitFor({ state: "hidden" });
    checks.push("Selecting an object action dismisses its action menu immediately.");

    await position(768, 384);
    const meeting = page.getByRole("region", { name: "Product crit meeting", exact: true });
    await meeting.waitFor();
    pauseCommand = "meeting.join";
    await meeting.getByRole("button", { name: "Open Small", exact: true }).click();
    await meeting.waitFor({ state: "hidden" });
    failHeldRequest();
    await meeting.waitFor();
    await meeting.getByRole("button", { name: "Open Small", exact: true }).click();
    await page.getByRole("dialog", { name: "Product crit", exact: true }).waitFor();
    await page.setViewportSize({ width: 768, height: 800 });
    await click("People");
    await click("Close people");
    await click("Leave meeting");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await position(1216, 480);
    const door = page.getByRole("region", { name: "Focus Suite door", exact: true });
    await door.waitFor();
    pauseCommand = "movement.set_destination";
    await door.getByRole("button", { name: "Enter", exact: true }).click();
    await door.waitFor({ state: "hidden" });
    failHeldRequest();
    await door.waitFor();
    await door.getByRole("button", { name: "Enter", exact: true }).click();
    await door.waitFor({ state: "hidden" });
    checks.push("Meeting and private-door actions dismiss immediately, restore after a rejected request, and succeed on retry; small meetings leave the tablet sidebar clickable.");

    const layout = detectLayoutRooms({ floorId: "floor-studio", revision: store.getLayout("floor-studio")!.revision + 1, objects: [], tiles: [], rooms: [], walls: [
      { id: "top", start: { x: 320, y: 320 }, end: { x: 576, y: 320 } },
      { id: "bottom", start: { x: 320, y: 576 }, end: { x: 576, y: 576 } },
      { id: "left", start: { x: 320, y: 320 }, end: { x: 320, y: 576 } },
      { id: "right", start: { x: 576, y: 320 }, end: { x: 576, y: 576 } },
    ], openings: [{ id: "private-door", wallId: "bottom", type: "door", offset: 96, width: 64 }] }, store.getFloors()[0]!);
    layout.rooms[0]!.access = { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: true };
    layout.rooms[0]!.build = { mode: "assigned", assignedPersonIds: ["user-maya"] };
    store.replaceLayout(layout);
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya" ? { ...player, x: 640, y: 640 } : player));
    await page.reload();
    await worldReady(page);
    await click("Build");
    await click("Shared");
    await click("Wall");
    const start = await worldPoint(672, 928);
    const end = await worldPoint(800, 928);
    await page.mouse.click(start.x, start.y);
    await page.mouse.move(end.x, end.y);
    await capture("wall-placement-preview");
    await page.mouse.click(end.x, end.y);
    await page.getByRole("textbox", { name: "Project name", exact: true }).waitFor();
    assert.equal(store.getLayout(layout.floorId)!.walls.length, 4);
    assert.equal(store.getPublicEconomy().funds[0]!.balance, 100);
    await capture("wall-draft");
    await click("Discard");
    await click("Select");
    const wall = await worldPoint(576, 448);
    await page.mouse.click(wall.x, wall.y);
    const selection = page.getByRole("region", { name: "Selected Wall", exact: true });
    await selection.waitFor();
    await page.locator(".build-asset-scroll").evaluate((element) => element.scrollTop = element.scrollHeight);
    await assertFits(selection);
    await selection.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /private|privacy|access/i }).waitFor();
    assert(events.some((event) => event.type === "command.error" && event.code === "ROOM_PRIVACY_PROTECTED"));
    assert.deepEqual(store.getLayout(layout.floorId)!.walls, layout.walls);
    assert.equal(store.getPublicEconomy().funds[0]!.balance, 100);
    assert.equal(store.getPlayerEconomy("user-maya").coinBalance, 80);
    await capture("private-wall-protected");
    checks.push("Wall placement remains a paid draft; private-room boundary removal is rejected for the owner/CEO without changing layout or balances, and selected actions stay visible while browsing assets.");
  }
  assert.deepEqual(errors, []);
  checks.push("Captured sidebar and dialog layouts from the running Vite app with isolated in-memory test data.");
} catch (error) {
  await capture("failure");
  console.error(await page.locator("body").innerText());
  console.error(JSON.stringify({ commands: commands.filter((command) => !["movement.input", "session.ping"].includes(command.type)).slice(-10),
    failures: events.filter((event) => event.type === "command.error") }, null, 2));
  throw error;
} finally {
  await browser.close();
  runtime.stop();
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors }, null, 2));
}
