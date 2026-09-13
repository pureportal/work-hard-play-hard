import { resolve } from "node:path";
import type { BrowserContext, WebSocketRoute } from "playwright-core";
import type { ClientCommand, ServerEvent } from "../../packages/shared/src/index.js";
import { createApplication } from "../../apps/server/src/app.js";
import { MemoryDatabase } from "../../apps/server/src/persistence/memory-database.js";
import { clientCommandSchema } from "../../apps/server/src/protocol.js";

export async function createReviewFixture(seeded = true) {
  const application = await createApplication({ database: new MemoryDatabase(), seeded,
    clientUrl: "http://127.0.0.1:5173", clientOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:3001"],
    exposeInvitationLinks: true, exposeMagicLinks: true,
    chatImagePath: resolve("../../artifacts/application-design-review/fixture-images"),
  });
  await application.app.ready();
  const events: ServerEvent[] = [];
  const commands: ClientCommand[] = [];
  const ignoredCommands = new Set<ClientCommand["type"]>();
  const sockets = new Map<string, WebSocketRoute>();

  async function install(context: BrowserContext, account?: string) {
    if (account) {
      const login = await application.auth.authenticate(account, "northstar");
      if (!login) throw new Error(`Missing seeded account: ${account}`);
      await context.addCookies([{ name: "whph_session", value: login.sessionToken, url: "http://127.0.0.1", httpOnly: true }]);
    }
    await context.route("**/v1/**", async (route) => {
      const request = route.request();
      const response = await application.app.inject({ method: request.method() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD", url: new URL(request.url()).pathname + new URL(request.url()).search,
        headers: request.headers(), payload: request.postDataBuffer() ?? undefined });
      const headers = Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
        .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : String(value)]));
      await route.fulfill({ status: response.statusCode, headers, body: response.rawPayload });
    });
    await context.routeWebSocket(/\/v1\/realtime/, async (socket) => {
      const session = (await context.cookies()).find((cookie) => cookie.name === "whph_session");
      const user = application.auth.getUserFromSession(session?.value);
      if (!user) return socket.close({ code: 4001, reason: "Session expired" });
      sockets.set(user.id, socket);
      const peer = application.runtime.connect(user.id, new URL(socket.url()).searchParams.get("floorId") ?? "floor-studio", (event) => {
        if (event.type !== "world.snapshot") events.push(event);
        socket.send(JSON.stringify(event));
      });
      socket.onMessage((message) => {
        const command = clientCommandSchema.parse(JSON.parse(String(message))) as ClientCommand;
        commands.push(command);
        if (!ignoredCommands.has(command.type)) application.runtime.handleCommand(peer, command);
      });
      socket.onClose(async () => {
        application.runtime.disconnect(peer);
        await socket.close();
      });
    });
  }

  function position(x: number, y: number, userId = "user-maya") {
    application.runtime.restorePlayers(application.runtime.serializePlayers().map((player) => player.userId === userId ? { ...player, x, y } : player));
  }

  return { ...application, events, commands, ignoredCommands, sockets, install, position, stop: () => application.app.close() };
}
