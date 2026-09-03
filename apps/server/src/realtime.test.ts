import type { AddressInfo } from "node:net";
import { TETRIS_DEFINITION_ID, type ServerEvent } from "@workhard/shared";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApplication, type ApplicationContext } from "./app.js";
import { MemoryDatabase } from "./persistence/memory-database.js";

const applications: ApplicationContext[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
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
    expect(events.findIndex((event) => event.type === "world.snapshot")).toBeLessThan(synchronizedAt);
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

  it("starts and records one Tetris round for players gathered over realtime", async () => {
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
      definitionId: TETRIS_DEFINITION_ID,
    }));
    const [mayaRoundEvent, leoRoundEvent] = await Promise.all([mayaRoundStarted, leoRoundStarted]);
    if (mayaRoundEvent.type !== "game.round_started" || leoRoundEvent.type !== "game.round_started") {
      throw new Error("Tetris round did not start");
    }
    expect(leoRoundEvent.round.id).toBe(mayaRoundEvent.round.id);
    expect(mayaRoundEvent.round.participants.map((participant) => participant.userId)).toEqual([
      "user-maya",
      "user-leo",
    ]);

    const completedForMaya = waitForEvent(mayaSocket, (event) => event.type === "game.round_completed");
    const completedForLeo = waitForEvent(leoSocket, (event) => event.type === "game.round_completed");
    mayaSocket.send(JSON.stringify({ type: "game.command", requestId: "score", command: "drop" }));
    leoSocket.send(JSON.stringify({ type: "game.end", requestId: "finish-leo" }));
    mayaSocket.send(JSON.stringify({ type: "game.end", requestId: "finish-maya" }));
    const [mayaCompletion, leoCompletion] = await Promise.all([completedForMaya, completedForLeo]);
    if (mayaCompletion.type !== "game.round_completed" || leoCompletion.type !== "game.round_completed") {
      throw new Error("Tetris round did not complete");
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

async function listeningApplication(): Promise<ApplicationContext> {
  const context = await createApplication({ database: new MemoryDatabase(), seeded: true });
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
