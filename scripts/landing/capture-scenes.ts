import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import puppeteer from "puppeteer";
import { EconomyStore } from "../../apps/server/src/economy/economy-store.js";
import { MemoryDatabase } from "../../apps/server/src/persistence/memory-database.js";
import { createSimulatedWorkplace, createWorkplaceAccounts } from "../../apps/server/src/seeding/workplace.js";
import { WorkspaceStore } from "../../apps/server/src/store.js";
import { DEFAULT_CORPORATE_IDENTITY, WORKSPACE_FUND_ID, getPlacedAssetInteractions, type ClientCommand, type WhiteboardColor, type WhiteboardStatus } from "../../packages/shared/src/index.js";
import { installWorldProbe } from "../characters/playwright-animation.js";
import { startWorkspaceBrowserFixture } from "../workspace-browser-fixture.js";

const output = resolve(process.env.LANDING_CAPTURE_DIR ?? "../../artifacts/landing/scenes");
const only = process.env.LANDING_SCENES?.split(",");
await mkdir(output, { recursive: true });

const owner = "person-rowan";
const ground = "floor-workplace";
const workspace = createSimulatedWorkplace();
workspace.store.corporateIdentity = { ...workspace.store.corporateIdentity, ...DEFAULT_CORPORATE_IDENTITY };
workspace.store.economy.gameSettings.roomBuild = { mode: "open", assignedPersonIds: [] };
const economy = new EconomyStore([]);
economy.restoreState(workspace.store.economy);
economy.grantSeedCoins(owner, 4_830);
workspace.store.economy = economy.exportState();
Object.assign(workspace.store.members.find(({ id }) => id === "person-rich")!, { name: "Noah Fischer", initials: "NF", title: "Account Manager" });
const discovery = workspace.store.layouts.flatMap(({ objects }) => objects).find(({ id }) => id === `${ground}-design-board`)!;
const discoveryCards: [title: string, text: string, color: WhiteboardColor, status: WhiteboardStatus, dueDate: string][] = [
  ["Interview two more customers", "Focus on teams that switch projects often.", "yellow", "todo", "2026-12-02"],
  ["Test the new handoff", "Two variations with support and design.", "pink", "todo", "2026-12-04"],
  ["Share findings at the review", "Three themes, one recommendation each.", "lavender", "todo", ""],
  ["Keep context between tasks", "Prototype a quick return to the last open item.", "mint", "doing", "2026-11-27"],
  ["Simplify onboarding notes", "One page for new teammates.", "blue", "doing", ""],
  ["Make handoffs clearer", "Owner and next step on every card.", "blue", "done", ""],
  ["Six customer interviews", "Notes are in the research folder.", "yellow", "done", ""],
  ["Support themes", "Three recurring questions from this week.", "mint", "done", ""],
];
discovery.workState = { kind: "whiteboard", revision: 4, document: {
  text: "Research synthesis\nSix interviews completed. Next: test the handoff flow with support and two customers.",
  cards: discoveryCards.map(([title, text, color, status, dueDate], index) => ({ id: `discovery-${index}`, kind: "note", title, text, color, status, dueDate,
    x: 32 + index % 4 * 300, y: 28 + Math.floor(index / 4) * 236, width: 268, height: 200 })),
} };
const seeded = new WorkspaceStore();
seeded.restoreMutableState(workspace.store);
for (const [userId, amount] of [["person-rich", 12_000], ["person-soren", 140], ["person-yuki", 90], ["person-imani", 120]] as const) {
  seeded.donateMoney(userId, WORKSPACE_FUND_ID, amount, `landing-donation-${userId}`);
}
workspace.store = seeded.exportMutableState();
const placement: Record<string, { x: number; y: number; floorId?: string; availability?: "available" | "busy" | "dnd" | "away" }> = {
  [owner]: { x: 896, y: 576, floorId: ground },
  "person-lucia": { x: 1328, y: 300, floorId: ground },
  "person-imani": { x: 1408, y: 300, floorId: ground },
  "person-rich": { x: 1408, y: 900 },
  "person-omar": { x: 240, y: 860 },
  "person-nina": { x: 900, y: 900 },
  "person-elise": { x: 1060, y: 880 },
  "person-rafael": { x: 520, y: 576, availability: "available" },
};
for (const member of workspace.store.members) {
  const target = placement[member.id];
  if (!target) continue;
  member.floorId = target.floorId ?? member.floorId;
  member.position = { x: target.x, y: target.y };
  if (target.availability) member.availability = target.availability;
}
for (const player of workspace.players) {
  const target = placement[player.userId];
  if (!target) continue;
  Object.assign(player, { x: target.x, y: target.y, floorId: target.floorId ?? player.floorId });
  if (target.availability) Object.assign(player, { availability: target.availability, connected: true });
}

const { auth, credentials } = await createWorkplaceAccounts(workspace);
const database = new MemoryDatabase();
await database.saveWorkspaceState(workspace);
await database.saveAuthState(auth);
const simulation = await startWorkspaceBrowserFixture(database);
const { runtime, store } = simulation.application;
const browser = await chromium.launch({ headless: true, executablePath: puppeteer.executablePath() });
const errors: string[] = [];
const peers = new Map<string, string>();

function command(userId: string, value: ClientCommand) {
  runtime.handleCommand(peers.get(userId)!, value);
}

function sit(userId: string, objectId: string) {
  const object = store.getLayout(ground)!.objects.find(({ id }) => id === objectId)!;
  command(userId, { type: "asset.interact", requestId: crypto.randomUUID(), objectId, interactionId: getPlacedAssetInteractions(object)[0]!.id });
}

async function settle(page: Page, frames = 40) {
  await page.mouse.move(1919, 540);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLCanvasElement>(".avatar canvas")].filter((canvas) => canvas.checkVisibility()).every((canvas) => {
    const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels?.some((value, index) => index % 4 === 3 && value > 0);
  }), undefined, { timeout: 30_000 });
  await page.evaluate(async (frames) => {
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll("img")].filter((image) => image.checkVisibility()).map((image) => image.decode().catch(() => undefined)));
    for (let frame = 0; frame < frames; frame++) await new Promise(requestAnimationFrame);
  }, frames);
  await page.waitForTimeout(700);
}

async function shot(page: Page, name: string) {
  await settle(page);
  assert.equal(await page.locator(".world-artwork-error, .character-preview-error").count(), 0, `${name}: artwork error`);
  await page.screenshot({ path: `${output}/${name}.png` });
  console.log(`captured ${name}`);
}

async function clickWorld(page: Page, x: number, y: number) {
  const screen = await page.evaluate((point) => {
    const world = globalThis.avatarWorld!.stage.children![0]!;
    const position = world.toGlobal(point);
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: canvas.x + position.x, y: canvas.y + position.y };
  }, { x, y });
  await page.mouse.click(screen.x, screen.y);
}

async function useObject(page: Page, x: number, y: number, action: string, approach?: string) {
  await clickWorld(page, x, y);
  const target = page.getByRole("button", { name: action, exact: true });
  if (approach) {
    const walkButton = page.getByRole("button", { name: approach, exact: true });
    await target.or(walkButton).first().waitFor();
    if (await walkButton.isVisible()) {
      await walkButton.click();
      await page.waitForTimeout(4000);
      await clickWorld(page, x, y);
    }
  }
  await target.click();
}

async function teleport(page: Page, x: number, y: number) {
  runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === owner ? { ...player, x, y, seat: undefined, destination: undefined } : player));
  await page.waitForTimeout(1500);
}

async function panel(page: Page, name: string, open: boolean) {
  const button = page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name, exact: true });
  if ((await button.getAttribute("aria-pressed") === "true") !== open) await button.click();
  await page.waitForTimeout(500);
}

const scenes: Record<string, (page: Page) => Promise<void>> = {
  async office(page) {
    await shot(page, "office");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await shot(page, "office-zoom");
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  },
  async people(page) {
    await panel(page, "People", true);
    await shot(page, "people");
    await panel(page, "People", false);
  },
  async messages(page) {
    await panel(page, "Messages", true);
    await shot(page, "messages");
    await panel(page, "Messages", false);
  },
  async whiteboard(page) {
    await useObject(page, 928, 150, "Open board", "Walk to board");
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await shot(page, "whiteboard");
    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    await page.getByRole("group", { name: "Canvas zoom" }).getByRole("button").nth(1).click();
    await shot(page, "whiteboard-canvas");
    await page.getByRole("button", { name: "Close board", exact: true }).click();
    await page.keyboard.press("Escape");
  },
  async chess(page) {
    await teleport(page, 1400, 576);
    await useObject(page, 1504, 880, "Open chess");
    await page.locator(".chess-lobby").waitFor({ timeout: 30_000 });
    await shot(page, "chess-lobby");
    await page.locator(".chess-lobby").getByRole("button", { name: "Play", exact: true }).click();
    await page.locator(".chess-game").waitFor();
    for (const [from, to] of [["white pawn on e2", "e4"], ["white knight on g1", "f3"], ["white bishop on f1", "c4"]] as const) {
      await page.getByRole("gridcell", { name: from, exact: true }).click();
      await page.getByRole("gridcell", { name: to, exact: true }).click();
      await page.waitForTimeout(2500);
    }
    await shot(page, "chess");
    await page.keyboard.press("Escape");
  },
  async build(page) {
    await teleport(page, 896, 576);
    await panel(page, "Build", true);
    await shot(page, "build");
    await page.getByRole("button", { name: "Preview Three-seat sofa", exact: true }).click();
    let placed = false;
    for (const [x, y] of [[1000, 760], [880, 960], [1060, 960], [700, 960], [960, 700]]) {
      const screen = await page.evaluate((point) => {
        const world = globalThis.avatarWorld!.stage.children![0]!;
        const position = world.toGlobal(point);
        const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
        return { x: canvas.x + position.x, y: canvas.y + position.y };
      }, { x, y });
      await page.mouse.move(screen.x, screen.y);
      await page.waitForTimeout(400);
      if (await page.locator(".placement-confirm").isEnabled()) { placed = true; break; }
    }
    assert(placed, "No valid sofa preview point");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${output}/build-preview.png` });
    console.log("captured build-preview");
    await page.getByRole("button", { name: "Cancel placement", exact: true }).click();
    await panel(page, "Build", false);
  },
};

try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light", timezoneId: "America/Los_Angeles", locale: "en-US" });
  await context.route("**/v1/me/game-guide", (route) => route.fulfill({ json: { status: "completed" } }));
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await installWorldProbe(page);
  await page.goto(simulation.origin);
  const account = credentials.find(({ username }) => username === "owner")!;
  await page.getByLabel("Username or email", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator(".world-canvas canvas").waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.length));
  for (const member of store.getMembers()) {
    if (member.id === owner || member.availability === "away") continue;
    peers.set(member.id, runtime.connect(member.id, member.floorId ?? ground, () => {}));
  }
  for (const [userId, chair] of [["person-soren", "soren"], ["person-mei", "mei"], ["person-dev", "dev"], ["person-yuki", "yuki"], ["person-ines", "ines"], ["person-celia", "celia"]] as const) {
    sit(userId, `${ground}-${chair}-chair`);
  }
  sit("person-lucia", `${ground}-juniper-seat-nw`);
  sit("person-imani", `${ground}-juniper-seat-ne`);
  sit("person-rich", `${ground}-games-beanbag`);
  sit("person-omar", `${ground}-cafe-seat-n`);
  for (const [userId, x, y] of [["person-rafael", 560, 330]] as const) {
    command(userId, { type: "movement.set_destination", requestId: crypto.randomUUID(), floorId: ground, x, y });
  }
  await page.waitForTimeout(8000);
  const claim = page.getByRole("button", { name: /^Claim \d+ coins$/ });
  if (await claim.isVisible()) {
    await claim.click();
    await page.waitForTimeout(1200);
    await page.keyboard.press("Escape");
  }
  const closePeople = page.getByRole("button", { name: "Close people", exact: true });
  if (await closePeople.isVisible()) await closePeople.click();
  for (const [name, scene] of Object.entries(scenes)) {
    if (only && !only.includes(name)) continue;
    await scene(page);
  }
  console.log(errors.length ? `Console errors:\n${errors.join("\n")}` : "No console errors.");
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  runtime.stop();
  await simulation.close();
}
