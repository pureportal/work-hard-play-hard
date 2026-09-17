import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { approveProposal } from "../apps/server/src/testing/approved-action.js";
import { getAssetDefinition, getDefaultAssetVariantId, type ClientCommand, type ServerEvent } from "../packages/shared/src/index.js";
import { installBuiltAssetClient } from "./world-assets/built-client.js";
import { installWorldProbe } from "./characters/playwright-animation.js";
import type { Application } from "../apps/client/node_modules/pixi.js";

const output = fileURLToPath(new URL("../artifacts/governance/", import.meta.url));
await mkdir(output, { recursive: true });
const application = await createTestApplication({ fixture: true, spotifyConfig: null, githubConfig: null,
  clientUrl: "http://127.0.0.1:5173", clientOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:3001"] });
await application.app.ready();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors: string[] = [];
const events: ServerEvent[] = [];
const peers = new Map<string, string>();
const checks: string[] = [];
const pages: Page[] = [];

async function login(account: string) {
  const session = await application.auth.authenticate(account, "northstar");
  assert(session);
  const user = application.auth.getUserFromSession(session.sessionToken)!;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
  await context.addCookies([{ name: "whph_session", value: session.sessionToken, url: "http://127.0.0.1", httpOnly: true }]);
  await context.addInitScript(() => localStorage.setItem("northstar.colorTheme", "dark"));
  await installBuiltAssetClient(context);
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await application.app.inject({ method: request.method() as "GET" | "PUT" | "POST" | "DELETE" | "OPTIONS", url: url.pathname + url.search,
      headers: request.headers(), payload: request.postDataBuffer() ?? undefined });
    await route.fulfill({ status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)])), body: response.rawPayload });
  });
  await context.routeWebSocket(/\/v1\/realtime/, (socket) => {
    const peer = application.runtime.connect(user.id, "floor-studio", (event) => { events.push(event); socket.send(JSON.stringify(event)); });
    peers.set(user.id, peer);
    socket.onMessage((message) => application.runtime.handleCommand(peer, clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand));
    socket.onClose(() => application.runtime.disconnect(peer));
  });
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(12_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await installWorldProbe(page);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
  return page;
}

async function capture(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: page overflow`);
  await page.screenshot({ path: `${output}/${name}.png` });
}

try {
  const maya = await login("maya");
  await maya.getByRole("button", { name: "Jonas Berg", exact: true }).click();
  assert.equal(await maya.getByRole("checkbox", { name: "Build office" }).count(), 0);
  await capture(maya, "people-dark");
  await maya.getByRole("button", { name: "Settings", exact: true }).click();
  await maya.getByRole("button", { name: "Server settings", exact: true }).click();
  await maya.getByRole("dialog", { name: "Server settings" }).waitFor();
  await capture(maya, "server-users-dark");
  const organisation = structuredClone(application.store.getOrganisation());
  await maya.getByRole("combobox", { name: "Jonas Berg server role" }).selectOption("admin");
  await maya.waitForFunction(() => (document.querySelector('[aria-label="Jonas Berg server role"]') as HTMLSelectElement)?.disabled === false);
  assert.deepEqual(application.store.getMember("user-jonas")!.permissions, ["manage_members"]);
  assert.deepEqual(application.store.getOrganisation(), organisation);
  await maya.getByRole("combobox", { name: "Jonas Berg server role" }).selectOption("member");
  await maya.getByRole("tab", { name: "Registration", exact: true }).click();
  await maya.getByRole("checkbox", { name: "Allow registrations", exact: true }).waitFor();
  await capture(maya, "server-registration-dark");
  await maya.getByRole("tab", { name: "Appearance", exact: true }).click();
  await maya.getByRole("tabpanel").getByRole("textbox").first().waitFor();
  await capture(maya, "server-appearance-dark");
  await maya.getByRole("tab", { name: "Spotify", exact: true }).click();
  await maya.getByRole("textbox", { name: "Client ID", exact: true }).fill("studio123");
  await maya.getByRole("textbox", { name: "Redirect URI", exact: true }).fill("http://127.0.0.1:3001/v1/spotify/callback");
  await maya.getByRole("button", { name: "Save Spotify", exact: true }).click();
  await maya.waitForFunction(() => (Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Save Spotify'))?.disabled);
  assert.equal(application.store.getSpotifyAppSettings()?.clientId, "studio123");
  await capture(maya, "server-spotify-dark");
  await maya.setViewportSize({ width: 390, height: 844 });
  await capture(maya, "server-spotify-mobile");
  await maya.getByRole("tab", { name: "User roles", exact: true }).click();
  await capture(maya, "server-users-mobile");
  checks.push("Server settings tabs, role changes, Spotify persistence and mobile layout.");
  await maya.setViewportSize({ width: 1440, height: 1000 });
  await maya.getByRole("button", { name: "Close server settings", exact: true }).click();
  await maya.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Approvals", exact: true }).click();
  await maya.getByRole("dialog", { name: "Approvals", exact: true }).waitFor();
  await maya.getByRole("tab", { name: "Game rules", exact: true }).click();
  await maya.getByRole("button", { name: "Room settings", exact: true }).click();
  await maya.getByRole("button", { name: "Product Studio", exact: true }).click();
  await maya.getByRole("button", { name: "Add area", exact: true }).click();
  const map = maya.getByRole("img", { name: "Personal areas in Product Studio" });
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  assert(box);
  await maya.mouse.move(box.x + box.width * .15, box.y + box.height * .25);
  await maya.mouse.down();
  await maya.mouse.move(box.x + box.width * .35, box.y + box.height * .55, { steps: 8 });
  await maya.mouse.up();
  await maya.getByRole("combobox", { name: "Owner", exact: true }).selectOption("user-jonas");
  for (const [label, value] of Object.entries({ Left: "416", Top: "736", Width: "192", Height: "160" })) await maya.getByRole("spinbutton", { name: label, exact: true }).fill(value);
  await maya.getByRole("img", { name: "Personal areas in Product Studio" }).scrollIntoViewIfNeeded();
  await capture(maya, "personal-area-editor");
  await maya.getByRole("button", { name: "Propose changes", exact: true }).click();
  await maya.getByRole("dialog", { name: "Approvals", exact: true }).waitFor();
  assert(application.store.getPublicEconomy().proposals.some((proposal) => proposal.action.kind === "room.settings" && proposal.action.settings.personalAreas?.length));
  await capture(maya, "personal-area-proposal");
  const areaProposal = application.store.getPublicEconomy().proposals.find((proposal) => proposal.action.kind === "room.settings")!;
  approveProposal(application.runtime, application.store.publicEconomy.proposal(areaProposal.id));
  await maya.getByRole("article", { name: areaProposal.title }).getByRole("button", { name: "Apply proposal", exact: true }).click();
  await maya.getByText(/^Past proposals \(\d+\)$/).waitFor();
  assert.equal(application.store.getRoom("room-product")!.personalAreas?.[0]?.ownerUserId, "user-jonas");
  checks.push("Area drawing and assignment produce a team proposal.");

  const jonas = await login("jonas");
  assert.equal(await jonas.getByRole("button", { name: "Server settings" }).count(), 0);
  const store = application.store;
  const runtime = application.runtime;
  const actor = peers.get("user-maya")!;
  const jonasPeer = peers.get("user-jonas")!;
  const personalBalance = store.getPlayerEconomy("user-jonas").coinBalance;
  runtime.handleCommand(jonasPeer, { type: "economy.purchase_asset", requestId: "buy-personal-plant", assetId: "plant-floor" });
  const personal = store.getPlayerEconomy("user-jonas").inventory.at(-1)!;
  await jonas.getByRole("button", { name: "Build", exact: true }).click();
  await jonas.getByRole("button", { name: "Zoom out", exact: true }).click({ clickCount: 3 });
  await jonas.locator(".inventory-asset").filter({ hasText: getAssetDefinition(personal.assetId)!.name }).getByRole("button", { name: "Place", exact: true }).click();
  await jonas.waitForFunction(() => Boolean(globalThis.avatarWorld?.stage.children?.[0]));
  const position = await jonas.evaluate(() => {
    const app = globalThis.avatarWorld as unknown as Application;
    const point = app.stage.children[0]!.toGlobal({ x: 480, y: 800 });
    const canvas = app.canvas.getBoundingClientRect();
    return { x: canvas.x + point.x * canvas.width / app.screen.width, y: canvas.y + point.y * canvas.height / app.screen.height };
  });
  await jonas.mouse.click(position.x, position.y);
  await jonas.locator(".inventory-asset").filter({ hasText: getAssetDefinition(personal.assetId)!.name }).getByText("0 available · 1 placed", { exact: true }).waitFor();
  assert(store.getOwnedAsset("user-jonas", personal.id).placement, JSON.stringify(events.findLast((event) => event.type === "command.error")));
  assert.equal(store.getPlayerEconomy("user-jonas").coinBalance, personalBalance - personal.purchasePrice);
  assert.equal(store.getPublicEconomy().proposals.length, 1);
  await jonas.getByRole("tab", { name: "Placed", exact: true }).click();
  await jonas.getByRole("button", { name: /Focus .*plant in Product Studio/i }).click();
  await capture(jonas, "personal-area-building");
  await jonas.getByRole("button", { name: "Store", exact: true }).click();
  await jonas.getByRole("button", { name: "Store", exact: true }).waitFor({ state: "hidden" });
  assert.equal(store.getOwnedAsset("user-jonas", personal.id).placement, undefined);
  assert.equal(store.getPublicEconomy().proposals.length, 1);
  checks.push("Paid items in an assigned area place immediately and return to their owner's inventory without a vote.");
  store.donateMoney("user-maya", "workspace", 100, "review-donation");
  const owned = store.purchaseAsset("user-maya", "plant-floor", "review-plant").economy.inventory.at(-1)!;
  const variantId = getDefaultAssetVariantId(getAssetDefinition(owned.assetId)!);
  runtime.handleCommand(actor, { type: "project.edit", requestId: "mixed-preview", fundId: "workspace", baseRevision: store.getLayout("floor-studio")!.revision,
    edit: { tool: "personal_asset", ownedAssetId: owned.id, position: { x: 416, y: 768 }, variantId, rotation: 0 } });
  const draft = events.findLast((event) => event.type === "project.preview" && event.requestId === "mixed-preview");
  assert(draft?.type === "project.preview", JSON.stringify(events.findLast((event) => event.type === "command.error")));
  assert.equal(draft.project.quote.structural, false);
  runtime.handleCommand(actor, { type: "project.submit", requestId: "mixed-submit", draftId: draft.project.id, title: "Plant for the product room" });
  await jonas.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Approvals", exact: true }).click();
  const proposalCard = jonas.getByRole("article", { name: "Plant for the product room" });
  await proposalCard.waitFor();
  await proposalCard.getByText("Place · Personal · Maya Chen", { exact: true }).waitFor();
  await capture(jonas, "approval-private-item");
  await jonas.setViewportSize({ width: 390, height: 844 });
  await capture(jonas, "approvals-mobile");
  await jonas.setViewportSize({ width: 1440, height: 1000 });
  await proposalCard.getByRole("button", { name: "View layout", exact: true }).click();
  await jonas.getByRole("button", { name: "Back to approvals", exact: true }).waitFor();
  await capture(jonas, "proposal-layout-preview");
  await jonas.getByRole("button", { name: "Back to approvals", exact: true }).click();
  await jonas.getByRole("article", { name: "Plant for the product room" }).getByRole("button", { name: "Approve", exact: true }).click();
  const proposal = store.getPublicEconomy().proposals.find((item) => item.title === "Plant for the product room")!;
  assert.equal(store.getOwnedAsset("user-maya", owned.id).placement, undefined);
  for (const userId of proposal.electorate) {
    const current = store.publicEconomy.proposal(proposal.id);
    if (current.status !== "open" || current.ballots.some((ballot) => ballot.userId === userId)) continue;
    const voter = runtime.connect(userId, "floor-studio", () => undefined);
    runtime.handleCommand(voter, { type: "public_economy.vote", requestId: crypto.randomUUID(), proposalId: proposal.id, approve: true });
    runtime.disconnect(voter);
  }
  await maya.getByRole("article", { name: "Plant for the product room" }).getByRole("button", { name: "Apply proposal", exact: true }).click();
  await maya.getByText(/^Past proposals \(\d+\)$/).waitFor();
  assert(store.getOwnedAsset("user-maya", owned.id).placement);
  await jonas.setViewportSize({ width: 390, height: 844 });
  await capture(jonas, "approvals-history-mobile");
  checks.push("Private item preview, independent team votes and approved placement preserve ownership.");
  await maya.getByRole("button", { name: "Close approvals", exact: true }).click();
  await maya.getByRole("button", { name: "Use light mode", exact: true }).click();
  await maya.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("button", { name: "Approvals", exact: true }).click();
  await capture(maya, "approvals-light");
  await maya.getByRole("button", { name: "Close approvals", exact: true }).click();
  await maya.getByRole("button", { name: "Organisation", exact: true }).click();
  await maya.getByRole("button", { name: "Add unit", exact: true }).click();
  const unitForm = maya.getByRole("form", { name: "New unit", exact: true });
  await unitForm.getByRole("textbox", { name: "Name", exact: true }).fill("Studio planning");
  await unitForm.getByRole("button", { name: "Propose unit", exact: true }).click();
  await maya.getByRole("dialog", { name: "Approvals", exact: true }).waitFor();
  const unitProposal = store.getPublicEconomy().proposals.find((entry) => entry.action.kind === "organisation")!;
  assert(unitProposal);
  assert(!store.getOrganisation().units.some((unit) => unit.name === "Studio planning"));
  approveProposal(runtime, store.publicEconomy.proposal(unitProposal.id));
  await maya.getByRole("article", { name: unitProposal.title }).getByRole("button", { name: "Apply proposal", exact: true }).click();
  await maya.getByText("Past proposals (3)", { exact: true }).waitFor();
  assert(store.getOrganisation().units.some((unit) => unit.name === "Studio planning"));
  checks.push("Organisation edits use the same team approval hub before changing the tree.");
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: `${output}/failure-${index}.png` });
    await writeFile(`${output}/failure-${index}.txt`, await page.locator("body").innerText());
  }
  throw error;
} finally {
  await browser.close();
  await application.app.close();
}
