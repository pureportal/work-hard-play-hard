import { createTestData } from "../apps/server/src/testing/workspace-data.js";
import type { BrowserContext } from "playwright-core";
import type { ClientCommand, ServerEvent } from "../packages/shared/src/index.js";
import { WorkspaceStore } from "../apps/server/src/store.js";
import { WorldRuntime } from "../apps/server/src/world/world-runtime.js";
import { clientCommandSchema } from "../apps/server/src/protocol.js";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

export function createArcadeReviewFixture() {
  const store = new WorkspaceStore(createTestData());
  const runtime = new WorldRuntime(store);
  const events: ServerEvent[] = [];
  const commands: ClientCommand[] = [];
  runtime.start();

  async function install(context: BrowserContext, userId = "user-maya") {
    if (process.env.ARCADE_PRODUCTION === "1") {
      const directory = process.env.ARCADE_BUILD_DIR ?? fileURLToPath(new URL("../apps/client/dist/", import.meta.url));
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp" };
      await context.route("http://127.0.0.1:5173/**", async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.startsWith("/v1/")) return route.fallback();
        const path = resolve(directory, pathname === "/" ? "index.html" : `.${pathname}`);
        if (!path.startsWith(resolve(directory) + sep)) throw new Error("Asset path outside client build");
        await route.fulfill({ path, contentType: types[extname(path)] ?? "application/octet-stream" });
      });
    }
    await context.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": route.request().headers().origin ?? "*", "access-control-allow-credentials": "true" };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { ...headers, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" } });
      } else if (path === "/v1/auth/session") {
        await route.fulfill({ json: { user: { id: userId, username: "arcade-review", email: "arcade-review@example.test" }, setupRequired: false,
          registration: { enabled: false, invitationRequired: true }, magicLinkEnabled: false, corporateIdentity: store.getCorporateIdentity() }, headers });
      } else if (path === "/v1/bootstrap") {
        await route.fulfill({ json: store.getBootstrap(userId), headers });
      } else {
        throw new Error(`Unexpected arcade review request: ${path}`);
      }
    });
    await context.routeWebSocket(/\/v1\//, (socket) => {
      const peer = runtime.connect(userId, "floor-studio", (event) => {
        if (event.type !== "world.snapshot") events.push(event);
        socket.send(JSON.stringify(event));
      });
      socket.onMessage((message) => {
        const command = clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand;
        commands.push(command);
        runtime.handleCommand(peer, command);
      });
      socket.onClose(() => runtime.disconnect(peer));
    });
  }

  function position(x: number, y: number, userId = "user-maya") {
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === userId ? { ...player, x, y } : player));
  }

  return { store, runtime, events, commands, install, position, stop: () => runtime.stop() };
}
