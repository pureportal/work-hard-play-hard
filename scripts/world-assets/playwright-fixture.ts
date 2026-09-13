import type { BrowserContext } from "playwright-core";
import type { ClientCommand, Position, WorldPlayer } from "../../packages/shared/src/index.js";
import { DemoStore } from "../../apps/server/src/store.js";
import { WorldRuntime } from "../../apps/server/src/world/world-runtime.js";

export async function installAssetFixture(context: BrowserContext, userId = "user-maya", position?: Position) {
  const store = new DemoStore();
  store.updateGameSettings({ allowPlayerAssetPlacementInPublicRooms: true });
  if (position) store.getMember(userId)!.position = { ...position };
  const runtime = new WorldRuntime(store);
  const commands: ClientCommand[] = [];
  let players: WorldPlayer[] = [];
  await context.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
    } else if (path === "/v1/auth/session") {
      await route.fulfill({ json: { user: { id: userId, username: "asset-review", email: "asset-review@example.test" }, setupRequired: false, registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() }, headers });
    } else if (path === "/v1/bootstrap") {
      await route.fulfill({ json: store.getBootstrap(userId), headers });
    } else {
      await route.fulfill({ status: 404, json: { error: "Unexpected asset review request" }, headers });
    }
  });
  await context.routeWebSocket(/\/v1\//, (socket) => {
    const peer = runtime.connect(userId, "floor-studio", (event) => {
      if (event.type === "world.snapshot") players = event.players;
      socket.send(JSON.stringify(event));
    });
    socket.onMessage((message) => {
      const command = JSON.parse(String(message)) as ClientCommand;
      commands.push(command);
      runtime.handleCommand(peer, command);
    });
    socket.onClose(() => runtime.disconnect(peer));
  });
  runtime.start();
  return { store, commands, getPlayer: (id: string) => players.find((player) => player.userId === id), stop: () => runtime.stop() };
}
