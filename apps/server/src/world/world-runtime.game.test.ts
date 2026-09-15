import { createTestData } from "../testing/workspace-data.js";
import { CHESS_DEFINITION_ID, FALLING_BLOCKS_DEFINITION_ID, TIC_TAC_TOE_DEFINITION_ID } from "@workhard/shared";
import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime Falling Blocks multiplayer", () => {
  it("gathers players through movement, starts one round, and records its winner", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));

    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "gather-maya",
      floorId: "floor-studio",
      x: 1_050,
      y: 620,
    });
    send(runtime, leoPeer, {
      type: "movement.set_destination",
      requestId: "gather-leo",
      floorId: "floor-studio",
      x: 1_250,
      y: 620,
    });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestLobby(mayaEvents)?.participantIds).toEqual(["user-maya", "user-leo"]);
    expect(latestLobby(leoEvents)?.participantIds).toEqual(["user-maya", "user-leo"]);

    send(runtime, mayaPeer, {
      type: "game.start",
      requestId: "start-together",
      definitionId: FALLING_BLOCKS_DEFINITION_ID, objectId: "object-falling-blocks",
    });

    const mayaRound = latestRound(mayaEvents);
    const leoRound = latestRound(leoEvents);
    expect(mayaRound?.id).toBe(leoRound?.id);
    expect(mayaRound?.participants.map((participant) => participant.userId)).toEqual(["user-maya", "user-leo"]);

    send(runtime, mayaPeer, { type: "game.command", roundId: mayaRound!.id, requestId: "maya-drop", command: "drop" });
    send(runtime, leoPeer, { type: "game.end", roundId: mayaRound!.id, requestId: "leo-finish" });
    send(runtime, mayaPeer, { type: "game.end", roundId: mayaRound!.id, requestId: "maya-finish" });

    const completion = mayaEvents.findLast((event) => event.type === "game.round_completed");
    expect(completion?.type === "game.round_completed" && completion.round.id).toBe(mayaRound?.id);
    expect(completion?.type === "game.round_completed" && completion.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", mode: "multiplayer", placement: 1, won: true }),
      expect.objectContaining({ userId: "user-leo", mode: "multiplayer", placement: 2, won: false }),
    ]);
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-maya")).toMatchObject({
      multiplayerGamesPlayed: 1,
      multiplayerWins: 1,
    });
    expect(store.getGameStatistics().find((statistics) => statistics.userId === "user-leo")).toMatchObject({
      multiplayerGamesPlayed: 2,
      multiplayerWins: 0,
    });

    runtime.stop();
  });
});

describe("WorldRuntime chess multiplayer", () => {
  it("excludes active chess viewers from overlapping games and restores entry on close", () => {
    const runtime = new WorldRuntime(new WorkspaceStore(createTestData()));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    gatherAtChess(runtime, mayaPeer, "maya", 1_330, 716);
    gatherAtChess(runtime, leoPeer, "leo", 1_320, 720);
    for (let tick = 0; tick < 700; tick += 1) runtime.runTickForTest();

    send(runtime, mayaPeer, {
      type: "chess.match_create", requestId: "solo-chess",
      settings: { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "easy" } },
    });
    const matchId = latestChessMatch(mayaEvents)!.id;
    const lobby = leoEvents.findLast((event) => event.type === "game.lobby_updated" && event.lobby.definitionId === TIC_TAC_TOE_DEFINITION_ID);
    expect(lobby?.type === "game.lobby_updated" && lobby.lobby.participantIds).toEqual(["user-leo"]);
    send(runtime, mayaPeer, { type: "game.start", requestId: "overlap", definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: "classic", bot: { difficulty: "easy" } });
    expect(mayaEvents.findLast((event) => event.type === "command.error")).toMatchObject({ requestId: "overlap", code: "GAME_IN_PROGRESS" });

    send(runtime, mayaPeer, { type: "chess.match_close", requestId: "close-chess", matchId });
    send(runtime, mayaPeer, { type: "game.start", requestId: "solo-tic", definitionId: TIC_TAC_TOE_DEFINITION_ID, objectId: "object-tic-tac-toe", variantId: "classic", bot: { difficulty: "easy" } });
    expect(mayaEvents.findLast((event) => event.type === "game.state")).toMatchObject({ definitionId: TIC_TAC_TOE_DEFINITION_ID, bot: { difficulty: "easy" } });
    send(runtime, mayaPeer, { type: "chess.match_open", requestId: "overlap-chess", matchId });
    expect(mayaEvents.findLast((event) => event.type === "command.error")).toMatchObject({ requestId: "overlap-chess", code: "GAME_IN_PROGRESS" });
    runtime.stop();
  });

  it("routes locked matches, legal moves, and reconnects through the realtime protocol", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    let mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
    const priyaPeer = runtime.connect("user-priya", "floor-studio", (event) => priyaEvents.push(event));

    gatherAtChess(runtime, mayaPeer, "maya", 1_330, 748);
    gatherAtChess(runtime, leoPeer, "leo", 1_330, 782);
    gatherAtChess(runtime, priyaPeer, "priya", 1_330, 816);
    for (let tick = 0; tick < 700; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestChessLobby(mayaEvents)?.definitionId).toBe(CHESS_DEFINITION_ID);
    send(runtime, mayaPeer, {
      type: "chess.match_create",
      requestId: "locked-match",
      settings: {
        timeControl: "standard",
        pauseWeekends: false,
        access: "locked",
        opponentUserId: "user-leo",
      },
    });
    const matchId = latestChessLobby(mayaEvents)?.matches.find((match) => match.status === "waiting")?.id;
    expect(matchId).toBeTruthy();

    send(runtime, priyaPeer, { type: "chess.match_join", requestId: "wrong-player", matchId: matchId! });
    expect(priyaEvents.findLast((event) => event.type === "command.error")).toMatchObject({
      type: "command.error",
      requestId: "wrong-player",
      code: "CHESS_MATCH_LOCKED",
    });

    send(runtime, leoPeer, { type: "chess.match_join", requestId: "join-match", matchId: matchId! });
    send(runtime, mayaPeer, { type: "chess.match_open", requestId: "open-match", matchId: matchId! });
    send(runtime, mayaPeer, {
      type: "chess.move",
      requestId: "white-move",
      matchId: matchId!,
      move: { from: "e2", to: "e4" },
    });
    send(runtime, leoPeer, {
      type: "chess.move",
      requestId: "black-move",
      matchId: matchId!,
      move: { from: "e7", to: "e5" },
    });
    expect(latestChessMatch(mayaEvents)?.moves.map(({ san }) => san)).toEqual(["e4", "e5"]);

    runtime.disconnect(mayaPeer);
    mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    expect(latestChessLobby(mayaEvents)?.matches.some((match) => match.id === matchId)).toBe(true);
    send(runtime, mayaPeer, { type: "chess.match_open", requestId: "resume-match", matchId: matchId! });
    expect(latestChessMatch(mayaEvents)).toMatchObject({
      id: matchId,
      status: "active",
      turn: "white",
      moves: [{ san: "e4" }, { san: "e5" }],
    });

    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function latestLobby(events: ServerEvent[]) {
  const event = events.findLast((candidate) =>
    candidate.type === "game.lobby_updated" && candidate.lobby.definitionId === FALLING_BLOCKS_DEFINITION_ID,
  );
  return event?.type === "game.lobby_updated" ? event.lobby : undefined;
}

function latestRound(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "game.round_started");
  return event?.type === "game.round_started" ? event.round : undefined;
}

function gatherAtChess(
  runtime: WorldRuntime,
  peerId: string,
  requestId: string,
  x: number,
  y: number,
): void {
  send(runtime, peerId, {
    type: "movement.set_destination",
    requestId: `gather-${requestId}`,
    floorId: "floor-studio",
    x,
    y,
  });
}

function latestChessLobby(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "chess.lobby_updated");
  return event?.type === "chess.lobby_updated" ? event.lobby : undefined;
}

function latestChessMatch(events: ServerEvent[]) {
  const event = events.findLast((candidate) => candidate.type === "chess.match_state");
  return event?.type === "chess.match_state" ? event.match : undefined;
}
