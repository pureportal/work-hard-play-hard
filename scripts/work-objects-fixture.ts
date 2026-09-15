import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import type { BrowserContext } from "playwright-core";
import type { ClientCommand, ServerEvent } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

export function createWorkFixture() {
  const store = new WorkspaceStore(createTestData());
  store.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });
  const runtime = new WorldRuntime(store);
  const database = new MemoryDatabase();
  const commands: ClientCommand[] = [];
  const errors: ServerEvent[] = [];
  let saving = Promise.resolve();
  runtime.start();

  async function install(context: BrowserContext, userId = "user-maya") {
    await context.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
      } else if (path === "/v1/auth/session") {
        await route.fulfill({ json: { user: { id: userId, username: "work-review", email: "work-review@example.test" }, setupRequired: false,
          registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() }, headers });
      } else if (path === "/v1/bootstrap") {
        await route.fulfill({ json: store.getBootstrap(userId), headers });
      } else {
        await route.fulfill({ status: 404, json: { error: "Unexpected work review request" }, headers });
      }
    });
    await context.routeWebSocket(/\/v1\//, (socket) => {
      const peer = runtime.connect(userId, "floor-studio", (event) => {
        if (event.type === "command.error") errors.push(event);
        socket.send(JSON.stringify(event));
      });
      socket.onMessage((message) => {
        const command = clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand;
        commands.push(command);
        runtime.handleCommand(peer, command);
        const checkpoint = { store: store.exportMutableState(), players: runtime.serializePlayers() };
        saving = saving.then(() => database.saveWorkspaceState(checkpoint));
        if (command.type === "work.update" && !errors.some((event) => "requestId" in event && event.requestId === command.requestId)) {
          void saving.then(() => socket.send(JSON.stringify({ type: "work.saved", requestId: command.requestId })));
        }
      });
      socket.onClose(() => runtime.disconnect(peer));
    });
  }

  async function restore() {
    await saving;
    const checkpoint = await database.loadWorkspaceState();
    if (!checkpoint) throw new Error("No checkpoint saved");
    store.restoreMutableState(checkpoint.store);
    runtime.restorePlayers(checkpoint.players);
  }

  return { store, runtime, commands, errors, install, restore, stop: () => runtime.stop() };
}
