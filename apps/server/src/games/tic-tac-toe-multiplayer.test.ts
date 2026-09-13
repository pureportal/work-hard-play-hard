import {
  TIC_TAC_TOE_DEFINITION_ID,
  TIC_TAC_TOE_VARIANTS,
  type ServerEvent,
  type TicTacToeCommand,
  type WorldPlayer,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import type { GameEventDelivery } from "./game-event-delivery.js";
import { TicTacToeMultiplayerRuntime } from "./tic-tac-toe-multiplayer.js";

describe("TicTacToeMultiplayerRuntime", () => {
  it.each(TIC_TAC_TOE_VARIANTS)("synchronizes $name for participants and rejects unrelated moves", ({ id }) => {
    const runtime = startedRuntime(new DemoStore(), id);
    const session = runtime.getSessionEvents("user-maya");
    const command: TicTacToeCommand = id === "classic"
      ? { kind: "classic.place", cell: 4 }
      : id === "ultimate"
        ? { kind: "ultimate.place", board: 0, cell: 4 }
        : { kind: "stacking.place", cell: 4, size: "large" };

    expect(runtime.getSessionEvents("user-priya")).toEqual([]);
    expect(runtime.getSessionEvents("user-leo")).toEqual(session);
    expect(() => runtime.command("user-priya", command)).toThrow("GAME_NOT_STARTED");
    expect(() => runtime.command("user-leo", command)).toThrow("GAME_NOT_YOUR_TURN");
    expect(() => runtime.command("user-maya", id === "classic"
      ? { kind: "ultimate.place", board: 0, cell: 0 }
      : { kind: "classic.place", cell: 0 })).toThrow("GAME_MOVE_INVALID");
    expect(runtime.getSessionEvents("user-maya")).toEqual(session);

    const deliveries = runtime.command("user-maya", command);
    expect(deliveries.find(({ event }) => event.type === "game.state")).toMatchObject({
      scope: "users", userIds: ["user-maya", "user-leo"],
      event: { variantId: id, moveNumber: 1, turnUserId: "user-leo" },
    });
    expect(runtime.getSessionEvents("user-maya")).toEqual(runtime.getSessionEvents("user-leo"));
  });

  it("keeps every nearby player eligible and removes disconnected players", () => {
    const runtime = new TicTacToeMultiplayerRuntime(new DemoStore());
    const players = [...nearbyPlayers(), nearbyPlayer("user-priya", 1_320, 530)];
    const connected = new Set(players.map(({ userId }) => userId));
    const first = events(runtime.syncLobbies(players, connected)).find((event) => event.type === "game.lobby_updated");
    expect(first?.type === "game.lobby_updated" && first.lobby.participantIds).toEqual(["user-leo", "user-maya", "user-priya"]);

    connected.delete("user-leo");
    const next = events(runtime.syncLobbies(players, connected)).find((event) => event.type === "game.lobby_updated");
    expect(next?.type === "game.lobby_updated" && next.lobby.participantIds).toEqual(["user-maya", "user-priya"]);
    expect(() => runtime.start("user-leo", "classic")).toThrow("GAME_TOO_FAR");
  });

  it("completes once, restores presence, and persists results through the workspace store", async () => {
    const store = new DemoStore();
    const runtime = startedRuntime(store, "stacking");
    const deliveries = runtime.leave("user-maya");
    const statistics = store.getGameStatistics();
    const economy = store.getPlayerEconomy("user-leo");

    expect(events(deliveries).filter((event) => event.type === "game.round_completed")).toHaveLength(1);
    expect(runtime.leave("user-maya")).toEqual([]);
    expect(runtime.leave("user-leo")).toEqual([]);
    expect(runtime.isPlaying("user-maya")).toBe(false);
    expect(runtime.isPlaying("user-leo")).toBe(false);
    expect(runtime.getSessionEvents("user-leo")).toEqual([]);
    expect(store.getMember("user-leo")?.activity).not.toBe("Playing Tic-Tac-Toe");
    expect(store.getGameStatistics()).toEqual(statistics);
    expect(store.getPlayerEconomy("user-leo")).toEqual(economy);

    const database = new MemoryDatabase();
    await database.saveWorkspaceState({ players: [], store: store.exportMutableState() });
    const restored = new DemoStore();
    restored.restoreMutableState((await database.loadWorkspaceState())!.store);
    expect(restored.getGameStatistics()).toEqual(statistics);
    expect(restored.getScores()).toEqual(store.getScores());
    expect(restored.getPlayerEconomy("user-leo")).toEqual(economy);
  });

  it("forms a two-player proximity lobby and starts the selected variant", () => {
    const store = new DemoStore();
    const runtime = new TicTacToeMultiplayerRuntime(store);
    const players = nearbyPlayers();
    const deliveries = runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));

    expect(events(deliveries)).toContainEqual(expect.objectContaining({
      type: "game.lobby_updated",
      lobby: expect.objectContaining({
        definitionId: TIC_TAC_TOE_DEFINITION_ID,
        participantIds: expect.arrayContaining(["user-maya", "user-leo"]),
        capacity: 2,
      }),
    }));

    const started = runtime.start("user-maya", "ultimate");
    expect(started.participantIds).toEqual(["user-maya", "user-leo"]);
    expect(events(started.deliveries)).toContainEqual(expect.objectContaining({
      type: "game.state",
      definitionId: TIC_TAC_TOE_DEFINITION_ID,
      variantId: "ultimate",
      turnUserId: "user-maya",
    }));
    expect(runtime.getSessionEvents("user-leo")).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "game.round_started" }),
      expect.objectContaining({ type: "game.state", variantId: "ultimate" }),
    ]));
  });

  it("rejects starting before a second player arrives", () => {
    const store = new DemoStore();
    const runtime = new TicTacToeMultiplayerRuntime(store);
    const player = nearbyPlayers()[0]!;
    runtime.syncLobbies([player], new Set([player.userId]));

    expect(() => runtime.start(player.userId, "classic")).toThrow("GAME_PLAYERS_REQUIRED");
  });

  it("broadcasts authoritative turns and records the winner", () => {
    const store = new DemoStore();
    const runtime = startedRuntime(store, "classic");
    const moves: Array<[string, TicTacToeCommand]> = [
      ["user-maya", { kind: "classic.place", cell: 0 }],
      ["user-leo", { kind: "classic.place", cell: 3 }],
      ["user-maya", { kind: "classic.place", cell: 1 }],
      ["user-leo", { kind: "classic.place", cell: 4 }],
      ["user-maya", { kind: "classic.place", cell: 2 }],
    ];

    let completion: ServerEvent | undefined;
    moves.forEach(([userId, command]) => {
      completion = events(runtime.command(userId, command)).find((event) => event.type === "game.round_completed")
        ?? completion;
    });

    expect(completion?.type === "game.round_completed" && completion.scores).toEqual([
      expect.objectContaining({ userId: "user-maya", score: 1, placement: 1, won: true }),
      expect.objectContaining({ userId: "user-leo", score: 0, placement: 2, won: false }),
    ]);
    expect(store.getGameStatistics().find((statistics) =>
      statistics.definitionId === TIC_TAC_TOE_DEFINITION_ID && statistics.userId === "user-maya",
    )).toMatchObject({ gamesPlayed: 1, multiplayerGamesPlayed: 1, multiplayerWins: 1 });
  });

  it("records a draw without assigning a winner", () => {
    const store = new DemoStore();
    const runtime = startedRuntime(store, "classic");
    const cells = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    let completion: ServerEvent | undefined;

    cells.forEach((cell, index) => {
      completion = events(runtime.command(
        index % 2 === 0 ? "user-maya" : "user-leo",
        { kind: "classic.place", cell },
      )).find((event) => event.type === "game.round_completed") ?? completion;
    });

    expect(completion?.type === "game.round_completed" && completion.round.winnerUserId).toBeUndefined();
    expect(completion?.type === "game.round_completed" && completion.scores.every((score) => !score.won)).toBe(true);
  });

  it("awards the round to the opponent when a player leaves", () => {
    const store = new DemoStore();
    const runtime = startedRuntime(store, "stacking");

    const completion = events(runtime.leave("user-maya")).find((event) => event.type === "game.round_completed");

    expect(completion?.type === "game.round_completed" && completion.round.winnerUserId).toBe("user-leo");
    expect(completion?.type === "game.round_completed" && completion.scores).toEqual([
      expect.objectContaining({ userId: "user-leo", won: true }),
      expect.objectContaining({ userId: "user-maya", won: false }),
    ]);
    expect(runtime.isPlaying("user-leo")).toBe(false);
  });
});

function startedRuntime(store: DemoStore, variantId: "classic" | "ultimate" | "stacking") {
  const runtime = new TicTacToeMultiplayerRuntime(store);
  const players = nearbyPlayers();
  runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
  runtime.start("user-maya", variantId);
  return runtime;
}

function nearbyPlayers(): WorldPlayer[] {
  return [
    nearbyPlayer("user-maya", 1_300, 540),
    nearbyPlayer("user-leo", 1_350, 540),
  ];
}

function nearbyPlayer(userId: string, x: number, y: number): WorldPlayer {
  return {
    userId,
    floorId: "floor-studio",
    x,
    y,
    facing: "down",
    availability: "available",
    connected: true,
  };
}

function events(deliveries: GameEventDelivery[]): ServerEvent[] {
  return deliveries.map((delivery) => delivery.event);
}
