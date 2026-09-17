import assert from "node:assert/strict";
import type { Browser, Page } from "playwright-core";
import { createTestApplication } from "../apps/server/src/testing/application.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { detectLayoutRooms, getAssetDefinition, getDefaultAssetVariantId, type ClientCommand, type ServerEvent } from "../packages/shared/src/index.js";
import { installWorldProbe } from "./characters/playwright-animation.js";
import { installBuiltAssetClient } from "./world-assets/built-client.js";

export async function createGovernanceRecheckFixture(browser: Browser) {
  const application = await createTestApplication({ fixture: true, spotifyConfig: null, githubConfig: null });
  await application.app.ready();
  const { store, runtime } = application;
  store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });
  const floorId = "floor-studio";
  const original = store.getLayout(floorId)!;
  const definition = getAssetDefinition("plant-floor")!;
  const variantId = getDefaultAssetVariantId(definition);
  const layout = detectLayoutRooms({ ...original, revision: original.revision + 1, objects: [], tiles: [], rooms: [], walls: [
    { id: "top", start: { x: 64, y: 64 }, end: { x: 768, y: 64 } },
    { id: "bottom", start: { x: 64, y: 576 }, end: { x: 768, y: 576 } },
    { id: "left", start: { x: 64, y: 64 }, end: { x: 64, y: 576 } },
    { id: "right", start: { x: 768, y: 64 }, end: { x: 768, y: 576 } },
  ], openings: [{ id: "door", wallId: "bottom", type: "door", offset: 288, width: 64 }] }, store.getFloor(floorId)!);
  layout.rooms[0]!.personalAreas = [{ id: "mayas-area", name: "Maya", ownerUserId: "user-maya", bounds: { x: 96, y: 96, width: 160, height: 160 } }];
  layout.objects = [{ id: "paid-plant", floorId, assetId: definition.id, variantId, rotation: 0, x: 416, y: 192, publicFundId: "workspace" }];
  store.replaceLayout(layout);
  store.donateMoney("user-jonas", "workspace", 100, "recheck-fund");
  store.publicEconomy.record("workspace", "user-jonas", "purchase", -definition.shop!.price, "recheck-plant");
  store.publicEconomy.receipts.push({ key: "asset:paid-plant", floorId, fundId: "workspace", paid: definition.shop!.price });
  const owned = store.purchaseAsset("user-maya", definition.id, "recheck-personal").economy.inventory.at(-1)!;
  const events: ServerEvent[] = [];
  const commands: ClientCommand[] = [];
  const peers = new Map<string, string>();
  const contexts: Awaited<ReturnType<Browser["newContext"]>>[] = [];

  async function login(account: string) {
    const login = await application.auth.authenticate(account, "northstar");
    assert(login);
    const user = application.auth.getUserFromSession(login.sessionToken)!;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await installBuiltAssetClient(context);
    await context.addCookies([{ name: "whph_session", value: login.sessionToken, url: "http://127.0.0.1", httpOnly: true }]);
    await context.route("**/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const response = await application.app.inject({ method: request.method() as "GET" | "PUT" | "POST" | "DELETE", url: url.pathname + url.search,
        headers: request.headers(), payload: request.postDataBuffer() ?? undefined });
      await route.fulfill({ status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)])), body: response.rawPayload });
    });
    await context.routeWebSocket(/\/v1\/realtime/, (socket) => {
      const peer = runtime.connect(user.id, floorId, (event) => { events.push(event); socket.send(JSON.stringify(event)); });
      peers.set(user.id, peer);
      socket.onMessage((message) => {
        const command = clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand;
        commands.push(command);
        runtime.handleCommand(peer, command);
      });
      socket.onClose(() => runtime.disconnect(peer));
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(60_000);
    await installWorldProbe(page);
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /^Connected$/ }).waitFor();
    await page.waitForFunction(() => Boolean(globalThis.findAvatar("You")));
    return page;
  }

  return { store, runtime, floorId, owned, variantId, paidPrice: definition.shop!.price, events, commands, peers, login,
    async close() { for (const context of contexts) await context.close(); await application.app.close(); },
  };
}

export async function clickWorld(page: Page, x: number, y: number) {
  await page.waitForTimeout(250);
  const point = await page.evaluate(({ x, y }) => {
    const layer = globalThis.findAvatar("You")!.parent!.parent!.parent!;
    const point = layer.toGlobal({ x, y });
    const canvas = document.querySelector(".world-canvas canvas")!.getBoundingClientRect();
    return { x: canvas.x + point.x, y: canvas.y + point.y };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}
