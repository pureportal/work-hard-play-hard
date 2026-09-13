import {
  type ChessMatchSettings,
  type ChessMatchView,
  type ChessMoveInput,
  type ServerEvent,
  type WorldPlayer,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { ChessMultiplayerRuntime, elapsedClockMs } from "./chess-multiplayer.js";
import type { GameEventDelivery } from "./game-event-delivery.js";

const STANDARD_OPEN: ChessMatchSettings = {
  timeControl: "standard",
  pauseWeekends: false,
  access: "open",
};

describe("ChessMultiplayerRuntime", () => {
  it("enforces turns and legal moves before completing checkmate", () => {
    const game = activeMatch(STANDARD_OPEN);

    expect(latestMatch(game.runtime.open("user-maya", game.matchId)).legalMoves).toEqual(
      expect.arrayContaining([{ from: "e2", to: "e4" }]),
    );
    expect(() => game.runtime.move("user-leo", game.matchId, move("e7", "e5"))).toThrow("CHESS_NOT_YOUR_TURN");
    expect(() => game.runtime.move("user-maya", game.matchId, move("e2", "e5"))).toThrow("CHESS_MOVE_ILLEGAL");

    play(game, [
      ["user-maya", "f2", "f3"],
      ["user-leo", "e7", "e5"],
      ["user-maya", "g2", "g4"],
      ["user-leo", "d8", "h4"],
    ]);

    const match = game.store.getChessMatches().find(({ id }) => id === game.matchId)!;
    expect(match).toMatchObject({
      status: "completed",
      outcome: { result: "checkmate", winnerUserId: "user-leo" },
    });
    expect(match.moves.map(({ san }) => san)).toEqual(["f3", "e5", "g4", "Qh4#"]);
  });

  it("supports castling, en passant, and every promotion choice", () => {
    const castling = activeMatch(STANDARD_OPEN);
    play(castling, [
      ["user-maya", "e2", "e4"],
      ["user-leo", "e7", "e5"],
      ["user-maya", "g1", "f3"],
      ["user-leo", "b8", "c6"],
      ["user-maya", "f1", "e2"],
      ["user-leo", "g8", "f6"],
      ["user-maya", "e1", "g1"],
    ]);
    const castled = latestMatch(castling.runtime.open("user-maya", castling.matchId));
    expect(castled.board).toEqual(expect.arrayContaining([
      expect.objectContaining({ square: "g1", color: "white", type: "king" }),
      expect.objectContaining({ square: "f1", color: "white", type: "rook" }),
    ]));
    expect(castled.moves.at(-1)?.san).toBe("O-O");

    const enPassant = activeMatch(STANDARD_OPEN);
    play(enPassant, [
      ["user-maya", "e2", "e4"],
      ["user-leo", "a7", "a6"],
      ["user-maya", "e4", "e5"],
      ["user-leo", "d7", "d5"],
      ["user-maya", "e5", "d6"],
    ]);
    const captured = latestMatch(enPassant.runtime.open("user-maya", enPassant.matchId));
    expect(captured.board).toContainEqual(expect.objectContaining({ square: "d6", color: "white", type: "pawn" }));
    expect(captured.board.some(({ square }) => square === "d5")).toBe(false);
    expect(captured.moves.at(-1)).toMatchObject({ san: "exd6", captured: "pawn" });

    const promotion = activeMatch(STANDARD_OPEN);
    play(promotion, [
      ["user-maya", "a2", "a4"],
      ["user-leo", "h7", "h5"],
      ["user-maya", "a4", "a5"],
      ["user-leo", "h5", "h4"],
      ["user-maya", "a5", "a6"],
      ["user-leo", "h4", "h3"],
      ["user-maya", "a6", "b7"],
      ["user-leo", "h3", "g2"],
    ]);
    const beforePromotion = latestMatch(promotion.runtime.open("user-maya", promotion.matchId));
    expect(beforePromotion.legalMoves.filter(({ from, to }) => from === "b7" && to === "a8")).toEqual([
      { from: "b7", to: "a8", promotion: "knight" },
      { from: "b7", to: "a8", promotion: "bishop" },
      { from: "b7", to: "a8", promotion: "rook" },
      { from: "b7", to: "a8", promotion: "queen" },
    ]);
    promotion.runtime.move("user-maya", promotion.matchId, move("b7", "a8", "queen"));
    const promoted = latestMatch(promotion.runtime.open("user-maya", promotion.matchId));
    expect(promoted.board).toContainEqual(expect.objectContaining({ square: "a8", color: "white", type: "queen" }));
  });

  it("requires a repetition claim and supports agreed draws and resignation", () => {
    const repeated = activeMatch(STANDARD_OPEN);
    play(repeated, [
      ["user-maya", "g1", "f3"],
      ["user-leo", "g8", "f6"],
      ["user-maya", "f3", "g1"],
      ["user-leo", "f6", "g8"],
      ["user-maya", "g1", "f3"],
      ["user-leo", "g8", "f6"],
      ["user-maya", "f3", "g1"],
      ["user-leo", "f6", "g8"],
    ]);
    expect(repeated.store.getChessMatches()[0]?.status).toBe("active");
    expect(() => repeated.runtime.claimDraw("user-leo", repeated.matchId)).toThrow("CHESS_NOT_YOUR_TURN");
    repeated.runtime.claimDraw("user-maya", repeated.matchId);
    expect(repeated.store.getChessMatches()[0]).toMatchObject({
      status: "completed",
      outcome: { result: "threefold_repetition" },
    });

    const agreed = activeMatch(STANDARD_OPEN);
    agreed.runtime.offerDraw("user-maya", agreed.matchId);
    const drawState = latestMatch(agreed.runtime.open("user-leo", agreed.matchId));
    expect(drawState.drawOfferByUserId).toBe("user-maya");
    agreed.runtime.respondToDraw("user-leo", agreed.matchId, true);
    expect(agreed.store.getChessMatches()[0]).toMatchObject({ status: "completed", outcome: { result: "agreement" } });

    const resigned = activeMatch(STANDARD_OPEN);
    resigned.runtime.resign("user-maya", resigned.matchId);
    expect(resigned.store.getChessMatches()[0]).toMatchObject({
      status: "completed",
      outcome: { result: "resignation", winnerUserId: "user-leo" },
    });
  });

  it("supports open seats and rejects anyone outside a locked pair", () => {
    const lockedSettings: ChessMatchSettings = {
      timeControl: "standard",
      pauseWeekends: false,
      access: "locked",
      opponentUserId: "user-leo",
    };
    const store = new DemoStore();
    const runtime = new ChessMultiplayerRuntime(store);
    const players = [nearby("user-maya"), nearby("user-leo"), nearby("user-priya")];
    runtime.syncLobby(players, new Set(players.map(({ userId }) => userId)));
    const matchId = createdMatchId(runtime.create("user-maya", lockedSettings), "user-maya");

    expect(() => runtime.join("user-priya", matchId)).toThrow("CHESS_MATCH_LOCKED");
    expect(latestMatch(runtime.join("user-leo", matchId))).toMatchObject({
      whiteUserId: "user-maya",
      blackUserId: "user-leo",
      settings: { access: "locked" },
    });

    const open = activeMatch(STANDARD_OPEN, "user-priya");
    expect(open.store.getChessMatches()[0]?.blackUserId).toBe("user-priya");
  });

  it("runs rapid clocks and excludes paused weekends from 24-hour turns", () => {
    let now = new Date("2026-09-04T12:00:00.000Z");
    const rapid = activeMatch({ timeControl: "rapid", pauseWeekends: false, access: "open" }, "user-leo", () => now);
    now = new Date("2026-09-04T12:10:00.001Z");
    rapid.runtime.update();
    expect(rapid.store.getChessMatches()[0]).toMatchObject({
      status: "completed",
      outcome: { result: "timeout", winnerUserId: "user-leo" },
    });

    now = new Date("2026-09-04T23:00:00.000Z");
    const daily = activeMatch({ timeControl: "daily", pauseWeekends: true, access: "open" }, "user-leo", () => now);
    now = new Date("2026-09-05T12:00:00.000Z");
    const paused = latestMatch(daily.runtime.open("user-maya", daily.matchId));
    expect(paused.clock).toMatchObject({
      whiteRemainingMs: 23 * 60 * 60 * 1_000,
      running: false,
      pausedForWeekend: true,
    });
    now = new Date("2026-09-07T01:00:00.000Z");
    daily.runtime.update();
    const state = latestMatch(daily.runtime.open("user-maya", daily.matchId));
    expect(state.clock.whiteRemainingMs).toBe(22 * 60 * 60 * 1_000);
    expect(state.status).toBe("active");
    expect(elapsedClockMs(
      Date.parse("2026-09-04T23:00:00.000Z"),
      Date.parse("2026-09-07T01:00:00.000Z"),
      true,
    )).toBe(2 * 60 * 60 * 1_000);
  });

  it("restores the full position and keeps matches active across disconnects", () => {
    const source = activeMatch(STANDARD_OPEN);
    source.runtime.move("user-maya", source.matchId, move("e2", "e4"));
    source.runtime.close("user-maya", source.matchId);
    source.runtime.disconnect("user-maya");

    expect(source.store.getChessMatches()[0]).toMatchObject({ status: "active", moves: [{ san: "e4" }] });
    const saved = source.store.exportMutableState();
    const restoredStore = new DemoStore();
    restoredStore.restoreMutableState(saved);
    const restoredRuntime = new ChessMultiplayerRuntime(restoredStore);
    const players = [nearby("user-maya"), nearby("user-leo")];
    restoredRuntime.syncLobby(players, new Set(players.map(({ userId }) => userId)));
    const restored = latestMatch(restoredRuntime.open("user-maya", source.matchId));

    expect(restored.moves.map(({ san }) => san)).toEqual(["e4"]);
    expect(restored.turn).toBe("black");
    expect(restored.board).toContainEqual(expect.objectContaining({ square: "e4", color: "white", type: "pawn" }));
  });

  it("preserves repetition counts on restart and validates an intended-move claim", () => {
    const game = activeMatch(STANDARD_OPEN);
    expect(() => game.runtime.claimDraw("user-maya", game.matchId)).toThrow("CHESS_DRAW_UNAVAILABLE");
    play(game, [
      ["user-maya", "g1", "f3"], ["user-leo", "g8", "f6"],
      ["user-maya", "f3", "g1"], ["user-leo", "f6", "g8"],
      ["user-maya", "g1", "f3"], ["user-leo", "g8", "f6"],
      ["user-maya", "f3", "g1"],
    ]);
    const restored = new ChessMultiplayerRuntime(game.store);
    restored.claimDraw("user-leo", game.matchId, { from: "f6", to: "g8" });
    expect(game.store.getChessMatches()[0]).toMatchObject({
      status: "completed",
      outcome: { result: "threefold_repetition" },
    });
    expect(game.store.getChessMatches()[0]?.moves).toHaveLength(7);
  });

  it("keeps a draw offer through the offering player's move", () => {
    const game = activeMatch(STANDARD_OPEN);
    game.runtime.offerDraw("user-maya", game.matchId);
    game.runtime.move("user-maya", game.matchId, move("e2", "e4"));
    expect(game.store.getChessMatches()[0]?.drawOfferByUserId).toBe("user-maya");
    game.runtime.move("user-leo", game.matchId, move("e7", "e5"));
    expect(game.store.getChessMatches()[0]?.drawOfferByUserId).toBeUndefined();
  });

  it("charges only the active rapid clock and expires an offline match when reopened", () => {
    let now = new Date("2026-09-04T12:00:00Z");
    const game = activeMatch({ timeControl: "rapid", pauseWeekends: false, access: "open" }, "user-leo", () => now);
    now = new Date("2026-09-04T12:02:00Z");
    game.runtime.update();
    game.runtime.move("user-maya", game.matchId, move("e2", "e4"));
    expect(game.store.getChessMatches()[0]?.clock).toMatchObject({ whiteRemainingMs: 480_000, blackRemainingMs: 600_000 });
    const restored = new ChessMultiplayerRuntime(game.store, () => now);
    now = new Date("2026-09-04T12:12:00Z");
    restored.syncLobby([nearby("user-maya")], new Set(["user-maya"]));
    expect(latestMatch(restored.open("user-maya", game.matchId))).toMatchObject({
      status: "completed", outcome: { result: "timeout", winnerUserId: "user-maya" }, legalMoves: [],
    });
    expect(() => restored.move("user-leo", game.matchId, move("e7", "e5"))).toThrow("CHESS_MATCH_NOT_ACTIVE");
  });

  it("allows weekend moves and resets the next daily turn across a restart", () => {
    let now = new Date("2026-09-04T23:00:00Z");
    const game = activeMatch({ timeControl: "daily", pauseWeekends: true, access: "open" }, "user-leo", () => now);
    now = new Date("2026-09-05T12:00:00Z");
    game.runtime.update();
    game.runtime.move("user-maya", game.matchId, move("e2", "e4"));
    const restored = new ChessMultiplayerRuntime(game.store, () => now);
    now = new Date("2026-09-07T01:00:00Z");
    restored.syncLobby([nearby("user-leo")], new Set(["user-leo"]));
    expect(latestMatch(restored.open("user-leo", game.matchId)).clock).toMatchObject({
      whiteRemainingMs: 86_400_000,
      blackRemainingMs: 82_800_000,
      running: true,
      pausedForWeekend: false,
    });
  });

  it("charges weekends when daily clock pauses are disabled", () => {
    let now = new Date("2026-09-05T12:00:00Z");
    const game = activeMatch({ timeControl: "daily", pauseWeekends: false, access: "open" }, "user-leo", () => now);
    expect(latestMatch(game.runtime.open("user-maya", game.matchId)).clock.running).toBe(true);
    now = new Date("2026-09-06T12:00:00Z");
    game.runtime.update();
    expect(game.store.getChessMatches()[0]).toMatchObject({
      status: "completed", outcome: { result: "timeout", winnerUserId: "user-leo" },
    });
  });

  it("completes a timed match when its table has been removed", () => {
    let now = new Date("2026-09-04T12:00:00Z");
    const game = activeMatch({ timeControl: "rapid", pauseWeekends: false, access: "open" }, "user-leo", () => now);
    const layout = structuredClone(game.store.getLayout("floor-studio")!);
    layout.objects = layout.objects.filter((object) => object.id !== "object-chess");
    layout.revision += 1;
    game.store.replaceLayout(layout);
    now = new Date("2026-09-04T12:10:00Z");
    expect(() => game.runtime.update()).not.toThrow();
    expect(game.store.getChessMatches()[0]?.status).toBe("completed");
  });
});

function activeMatch(
  settings: ChessMatchSettings,
  opponentUserId = "user-leo",
  now?: () => Date,
) {
  const store = new DemoStore();
  const runtime = new ChessMultiplayerRuntime(store, now);
  const players = [nearby("user-maya"), nearby(opponentUserId)];
  runtime.syncLobby(players, new Set(players.map(({ userId }) => userId)));
  const matchId = createdMatchId(runtime.create("user-maya", settings), "user-maya");
  runtime.join(opponentUserId, matchId);
  runtime.open("user-maya", matchId);
  return { store, runtime, matchId };
}

function createdMatchId(deliveries: GameEventDelivery[], userId: string): string {
  const lobby = deliveries.find((delivery) => (
    delivery.scope === "users"
    && delivery.userIds.includes(userId)
    && delivery.event.type === "chess.lobby_updated"
  ))?.event;
  if (lobby?.type !== "chess.lobby_updated") {
    throw new Error("Chess lobby event missing");
  }
  return lobby.lobby.matches[0]!.id;
}

function latestMatch(deliveries: GameEventDelivery[]): ChessMatchView {
  const event = deliveries.map(({ event }) => event).findLast((candidate): candidate is Extract<ServerEvent, { type: "chess.match_state" }> => (
    candidate.type === "chess.match_state"
  ));
  if (!event) {
    throw new Error("Chess match state missing");
  }
  return event.match;
}

function play(
  game: ReturnType<typeof activeMatch>,
  moves: Array<[string, ChessMoveInput["from"], ChessMoveInput["to"], ChessMoveInput["promotion"]?]>,
): void {
  for (const [userId, from, to, promotion] of moves) {
    game.runtime.move(userId, game.matchId, move(from, to, promotion));
  }
}

function move(
  from: ChessMoveInput["from"],
  to: ChessMoveInput["to"],
  promotion?: ChessMoveInput["promotion"],
): ChessMoveInput {
  return { from, to, ...(promotion ? { promotion } : {}) };
}

function nearby(userId: string): WorldPlayer {
  return {
    userId,
    floorId: "floor-studio",
    x: 1_330,
    y: 780,
    facing: "down",
    availability: "available",
    connected: true,
  };
}
