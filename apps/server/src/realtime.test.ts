import type { AddressInfo } from "node:net";
import { FALLING_BLOCKS_DEFINITION_ID, type ServerEvent } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { ApplicationContext } from "./app.js";
import { createTestApplication, populateTestWorkspace } from "./testing/application.js";
import { MemoryDatabase } from "./persistence/memory-database.js";
import { PublicEconomyStore } from "./economy/public-economy-store.js";

const applications: ApplicationContext[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  vi.restoreAllMocks();
});

describe("realtime transport", () => {
  it("synchronizes before accepting client commands and correlates invalid requests", async () => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    const socket = connect(context, cookie);
    const events: ServerEvent[] = [];
    socket.on("message", (source) => events.push(JSON.parse(source.toString()) as ServerEvent));

    await waitForEvent(socket, (event) => event.type === "session.synced");

    const synchronizedAt = events.findIndex((event) => event.type === "session.synced");
    expect(events.findIndex((event) => event.type === "world.snapshot")).toBeGreaterThanOrEqual(0);
    expect(events.findIndex((event) => event.type === "world.snapshot")).toBeLessThan(synchronizedAt);
    expect(events.findIndex((event) => event.type === "workspace.snapshot")).toBeGreaterThanOrEqual(0);
    expect(events.findIndex((event) => event.type === "workspace.snapshot")).toBeLessThan(synchronizedAt);

    const invalid = waitForEvent(
      socket,
      (event) => event.type === "command.error" && event.requestId === "invalid-floor",
    );
    socket.send(JSON.stringify({
      type: "movement.set_destination",
      requestId: "invalid-floor",
      floorId: "",
      x: 0,
      y: 0,
    }));
    await expect(invalid).resolves.toMatchObject({
      type: "command.error",
      requestId: "invalid-floor",
      code: "MESSAGE_INVALID",
    });

    const presence = waitForEvent(
      socket,
      (event) => event.type === "presence.changed"
        && event.member.id === "user-maya"
        && event.member.availability === "busy",
    );
    socket.send(JSON.stringify({
      type: "presence.set_availability",
      requestId: "set-busy",
      availability: "busy",
    }));
    await expect(presence).resolves.toMatchObject({
      type: "presence.changed",
      member: { id: "user-maya", availability: "busy" },
    });

    const throttled = new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    });
    for (let sequence = 0; sequence < 205; sequence += 1) {
      socket.send(JSON.stringify({
        type: "movement.input",
        sequence,
        dx: 0,
        dy: 0,
      }));
    }
    await expect(throttled).resolves.toBe(1008);
  });

  it.each([64 * 1024, 4 * 1024 * 1024 - 1])("delivers the initial world snapshot with %i bytes buffered", async (bufferedAmount) => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    context.app.websocketServer.once("connection", (socket) => {
      vi.spyOn(socket, "bufferedAmount", "get").mockReturnValue(bufferedAmount);
    });
    const socket = connect(context, cookie);
    const events: ServerEvent[] = [];
    socket.on("message", (source) => events.push(JSON.parse(source.toString()) as ServerEvent));

    await waitForEvent(socket, (event) => event.type === "session.synced");

    expect(events.find((event) => event.type === "world.snapshot")).toMatchObject({ floorId: "floor-studio" });
    expect(events.findIndex((event) => event.type === "world.snapshot"))
      .toBeLessThan(events.findIndex((event) => event.type === "session.synced"));
    const response = waitForEvent(socket, (event) => event.type === "presence.changed"
      && event.member.id === "user-maya" && event.member.availability === "busy");
    socket.send(JSON.stringify({ type: "presence.set_availability", requestId: "after-sync", availability: "busy" }));
    await expect(response).resolves.toMatchObject({ type: "presence.changed", member: { id: "user-maya", availability: "busy" } });
  });

  it("synchronizes restored economy history on initial connection and reconnect", async () => {
    const database = new MemoryDatabase();
    await populateTestWorkspace(database);
    const state = (await database.loadWorkspaceState())!;
    const economy = new PublicEconomyStore(state.store.publicEconomy);
    for (let index = 0; index < 800; index += 1) {
      economy.record("workspace", "user-maya", "donation", 1, `donation-${index}`);
    }
    state.store.publicEconomy = economy.exportState();
    await database.saveWorkspaceState(state);
    const context = await listeningApplication(database);
    const cookie = await loginCookie(context);
    const economyBytes = Buffer.byteLength(JSON.stringify(context.store.getPublicEconomy()));
    expect(economyBytes).toBeGreaterThan(64 * 1024);
    context.app.websocketServer.on("connection", (socket) => {
      vi.spyOn(socket, "bufferedAmount", "get").mockReturnValue(economyBytes);
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const socket = connect(context, cookie);
      const events: ServerEvent[] = [];
      socket.on("message", (source) => events.push(JSON.parse(source.toString()) as ServerEvent));
      await waitForEvent(socket, (event) => event.type === "session.synced");

      expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
        "public_economy.updated", "session.ready", "world.snapshot", "workspace.snapshot", "session.synced",
      ]));
      expect(events.find((event) => event.type === "workspace.snapshot")?.data.publicEconomy.transactions).toHaveLength(800);
      expect(events.findIndex((event) => event.type === "world.snapshot"))
        .toBeLessThan(events.findIndex((event) => event.type === "session.synced"));
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      socket.close();
      await closed;
    }
  });

  it("drops periodic snapshots under backpressure and resumes after the buffer drains", async () => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    const socket = connect(context, cookie);
    await waitForEvent(socket, (event) => event.type === "session.synced");
    const serverSocket = [...context.app.websocketServer.clients][0]!;
    let bufferedAmount = 64 * 1024;
    vi.spyOn(serverSocket, "bufferedAmount", "get").mockImplementation(() => bufferedAmount);
    const send = vi.spyOn(serverSocket, "send");

    for (let tick = 0; tick < 100; tick += 1) context.runtime.runTickForTest();
    expect(send.mock.calls.map(([payload]) => (JSON.parse(String(payload)) as ServerEvent).type))
      .not.toContain("world.snapshot");

    const snapshot = waitForEvent(socket, (event) => event.type === "world.snapshot");
    bufferedAmount = 0;
    for (let tick = 0; tick < 100; tick += 1) context.runtime.runTickForTest();
    await expect(snapshot).resolves.toMatchObject({ type: "world.snapshot", floorId: "floor-studio" });
  });

  it("still terminates a connection at the hard buffer limit during synchronization", async () => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    context.app.websocketServer.once("connection", (socket) => {
      vi.spyOn(socket, "bufferedAmount", "get").mockReturnValue(4 * 1024 * 1024);
    });
    const socket = connect(context, cookie);
    const closed = new Promise<number>((resolve) => socket.once("close", resolve));

    await expect(closed).resolves.toBe(1006);
  });

  it("closes an unauthenticated websocket with the authentication code", async () => {
    const context = await listeningApplication();
    const socket = connect(context);
    const closed = new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    });

    await expect(closed).resolves.toBe(4_401);
  });

  it("shares the realtime command limit across a user's connections", async () => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    const firstSocket = connect(context, cookie);
    const secondSocket = connect(context, cookie);
    await Promise.all([
      waitForEvent(firstSocket, (event) => event.type === "session.synced"),
      waitForEvent(secondSocket, (event) => event.type === "session.synced"),
    ]);
    const throttled = Promise.race([firstSocket, secondSocket].map((socket) => new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    })));

    for (let sequence = 0; sequence < 110; sequence += 1) {
      firstSocket.send(JSON.stringify({ type: "movement.input", sequence, dx: 0, dy: 0 }));
      secondSocket.send(JSON.stringify({ type: "movement.input", sequence, dx: 0, dy: 0 }));
    }

    await expect(throttled).resolves.toBe(1008);
  });

  it("closes every realtime connection for the session on logout", async () => {
    const context = await listeningApplication();
    const cookie = await loginCookie(context);
    const firstSocket = connect(context, cookie);
    const secondSocket = connect(context, cookie);
    await Promise.all([
      waitForEvent(firstSocket, (event) => event.type === "session.synced"),
      waitForEvent(secondSocket, (event) => event.type === "session.synced"),
    ]);
    const closed = [firstSocket, secondSocket].map((socket) => new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    }));

    const logout = await context.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie },
    });

    expect(logout.statusCode).toBe(200);
    await expect(Promise.all(closed)).resolves.toEqual([1000, 1000]);
  });

  it("closes every session's realtime connection when the password is reset", async () => {
    const context = await listeningApplication();
    const firstCookie = await loginCookie(context);
    const secondCookie = await loginCookie(context);
    const firstSocket = connect(context, firstCookie);
    const secondSocket = connect(context, secondCookie);
    await Promise.all([
      waitForEvent(firstSocket, (event) => event.type === "session.synced"),
      waitForEvent(secondSocket, (event) => event.type === "session.synced"),
    ]);
    const closed = [firstSocket, secondSocket].map((socket) => new Promise<number>((resolve) => {
      socket.once("close", (code) => resolve(code));
    }));
    const reset = await context.auth.createPasswordReset("maya@northstar.studio");
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token: reset!.token, password: "new-password" } });
    expect(response.statusCode).toBe(200);
    await expect(Promise.all(closed)).resolves.toEqual([4_401, 4_401]);
  });

  it("starts and records one Falling Blocks round for players gathered over realtime", async () => {
    const context = await listeningApplication();
    context.runtime.restorePlayers(context.runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 1_050, y: 620 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 1_240, y: 620 };
      }
      return player;
    }));
    const [mayaCookie, leoCookie] = await Promise.all([
      loginCookie(context, "maya"),
      loginCookie(context, "leo"),
    ]);
    const mayaSocket = connect(context, mayaCookie);
    await waitForEvent(mayaSocket, (event) => event.type === "session.synced");
    const sharedLobby = waitForEvent(
      mayaSocket,
      (event) => event.type === "game.lobby_updated" && event.lobby.participantIds.length === 2,
    );
    const leoSocket = connect(context, leoCookie);
    await waitForEvent(leoSocket, (event) => event.type === "session.synced");

    await expect(sharedLobby).resolves.toMatchObject({
      type: "game.lobby_updated",
      lobby: { participantIds: ["user-maya", "user-leo"] },
    });

    const mayaRoundStarted = waitForEvent(mayaSocket, (event) => event.type === "game.round_started");
    const leoRoundStarted = waitForEvent(leoSocket, (event) => event.type === "game.round_started");
    mayaSocket.send(JSON.stringify({
      type: "game.start",
      requestId: "start-together",
      definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: "object-falling-blocks",
    }));
    const [mayaRoundEvent, leoRoundEvent] = await Promise.all([mayaRoundStarted, leoRoundStarted]);
    if (mayaRoundEvent.type !== "game.round_started" || leoRoundEvent.type !== "game.round_started") {
      throw new Error("Falling Blocks round did not start");
    }
    expect(leoRoundEvent.round.id).toBe(mayaRoundEvent.round.id);
    expect(mayaRoundEvent.round.participants.map((participant) => participant.userId)).toEqual([
      "user-maya",
      "user-leo",
    ]);

    const completedForMaya = waitForEvent(mayaSocket, (event) => event.type === "game.round_completed");
    const completedForLeo = waitForEvent(leoSocket, (event) => event.type === "game.round_completed");
    mayaSocket.send(JSON.stringify({ type: "game.command", roundId: mayaRoundEvent.round.id, requestId: "score", command: "drop" }));
    leoSocket.send(JSON.stringify({ type: "game.end", roundId: mayaRoundEvent.round.id, requestId: "finish-leo" }));
    mayaSocket.send(JSON.stringify({ type: "game.end", roundId: mayaRoundEvent.round.id, requestId: "finish-maya" }));
    const [mayaCompletion, leoCompletion] = await Promise.all([completedForMaya, completedForLeo]);
    if (mayaCompletion.type !== "game.round_completed" || leoCompletion.type !== "game.round_completed") {
      throw new Error("Falling Blocks round did not complete");
    }

    expect(leoCompletion.round.id).toBe(mayaRoundEvent.round.id);
    expect(mayaCompletion.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", mode: "multiplayer", placement: 1, won: true }),
      expect.objectContaining({ userId: "user-leo", mode: "multiplayer", placement: 2, won: false }),
    ]);
    expect(context.store.getGameStatistics().find((statistics) => statistics.userId === "user-maya")).toMatchObject({
      multiplayerGamesPlayed: 1,
      multiplayerWins: 1,
    });
  });
});

async function listeningApplication(database = new MemoryDatabase()): Promise<ApplicationContext> {
  const context = await createTestApplication({ database, fixture: true });
  applications.push(context);
  await context.app.listen({ host: "127.0.0.1", port: 0 });
  return context;
}

async function loginCookie(context: ApplicationContext, identifier = "maya"): Promise<string> {
  const response = await context.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { identifier, password: "northstar" },
  });
  const header = response.headers["set-cookie"];
  const source = Array.isArray(header) ? header[0] : header;
  if (!source) {
    throw new Error("Session cookie is missing");
  }
  return source.split(";", 1)[0]!;
}

function connect(context: ApplicationContext, cookie?: string): WebSocket {
  const address = context.app.server.address() as AddressInfo;
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/v1/realtime?floorId=floor-studio`,
    {
      origin: "http://127.0.0.1:5173",
      ...(cookie ? { headers: { cookie } } : {}),
    },
  );
  sockets.push(socket);
  return socket;
}

function waitForEvent(
  socket: WebSocket,
  predicate: (event: ServerEvent) => boolean,
): Promise<ServerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Timed out waiting for realtime event")), 3_000);
    const onMessage = (source: WebSocket.RawData) => {
      const event = JSON.parse(source.toString()) as ServerEvent;
      if (predicate(event)) {
        finish(undefined, event);
      }
    };
    const onClose = () => finish(new Error("Realtime connection closed"));
    const onError = (error: Error) => finish(error);
    const finish = (error?: Error, event?: ServerEvent) => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      socket.off("error", onError);
      if (error) {
        reject(error);
      } else {
        resolve(event!);
      }
    };
    socket.on("message", onMessage);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}
