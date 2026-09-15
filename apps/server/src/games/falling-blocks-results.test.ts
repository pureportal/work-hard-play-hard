import { createTestData } from "../testing/workspace-data.js";
import { describe, expect, it } from "vitest";
import { FALLING_BLOCKS_DEFINITION_ID, emptyFallingBlocksSpecialCounts, fallingBlocksAverages, type FallingBlocksSpecialCounts, type WorldPlayer } from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { FallingBlocksMultiplayerRuntime } from "./falling-blocks-multiplayer.js";
import type { FallingBlocksGame } from "./falling-blocks.js";
import { prepareTSpinDouble } from "./testing/falling-blocks.js";

describe("Falling Blocks saved results", () => {
  it("aggregates measured games, including zero-special games, and keeps averages accurate after restore", () => {
    const store = new WorkspaceStore(createTestData());
    const counts = { ...emptyFallingBlocksSpecialCounts(), tSpins: 3, tSpinDoubles: 2, quads: 5 };
    record(store, "measured", ["user-leo"], undefined, counts);
    record(store, "empty", ["user-leo"]);
    const statistics = store.getGameStatistics().find((entry) => entry.userId === "user-leo")!;
    expect(statistics.gamesPlayed).toBe(3);
    expect(statistics.fallingBlocks).toEqual({ gamesPlayed: 2, totals: counts });
    expect(fallingBlocksAverages(statistics.fallingBlocks!)).toMatchObject({ tSpins: 1.5, tSpinDoubles: 1, quads: 2.5, tSpinMinis: 0 });
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getGameStatistics()).toEqual(store.getGameStatistics());
    expect(restored.getScores().find((score) => score.roundId === "measured")?.fallingBlocks).toEqual(counts);
    expect(() => record(store, "measured", ["user-leo"])).toThrow("GAME_ROUND_RECORDED");
    expect(store.getGameStatistics().find((entry) => entry.userId === "user-leo")?.fallingBlocks?.gamesPlayed).toBe(2);
  });

  it("issues the first crown in multiplayer and requires its holder in each later contest", () => {
    const store = new WorkspaceStore(createTestData());
    record(store, "solo", ["user-maya"]);
    expect(crownHolder(store)).toBeUndefined();
    record(store, "first", ["user-maya", "user-leo"], "user-maya");
    expect(crownHolder(store)).toBe("user-maya");
    record(store, "absent", ["user-leo", "user-priya"], "user-leo");
    expect(crownHolder(store)).toBe("user-maya");
    record(store, "solo-holder", ["user-maya"]);
    expect(crownHolder(store)).toBe("user-maya");
    record(store, "defense", ["user-maya", "user-priya"], "user-maya");
    expect(crownHolder(store)).toBe("user-maya");
    const result = record(store, "transfer", ["user-maya", "user-leo"], "user-leo");
    expect(crownHolder(store)).toBe("user-leo");
    expect(result.statistics.find((entry) => entry.userId === "user-maya")?.holdsCrown).toBeUndefined();
    expect(result.statistics.find((entry) => entry.userId === "user-leo")?.holdsCrown).toBe(true);
    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    expect(crownHolder(restored)).toBe("user-leo");
    record(restored, "other-table", ["user-maya", "user-priya"], "user-priya");
    expect(crownHolder(restored)).toBe("user-leo");
  });

  it("sends authoritative specials and crown changes to all participants and restored sessions", () => {
    const store = new WorkspaceStore(createTestData());
    record(store, "crown", ["user-maya", "user-leo"], "user-leo");
    const runtime = new FallingBlocksMultiplayerRuntime(store);
    const players: WorldPlayer[] = ["user-maya", "user-leo"].map((userId, index) => ({
      userId, floorId: "floor-studio", x: 1050 + index * 200, y: 620, facing: "down", availability: "available", connected: true,
    }));
    runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
    runtime.start("user-maya", "object-falling-blocks");
    const rounds = Reflect.get(runtime, "rounds") as Map<string, { games: Map<string, FallingBlocksGame> }>;
    const games = [...rounds.values()][0]!.games;
    prepareTSpinDouble(games.get("user-maya")!);
    runtime.command("user-maya", "rotate");
    runtime.command("user-maya", "drop");
    for (const userId of games.keys()) {
      const session = runtime.getSessionEvents(userId).find((event) => event.type === "game.round_started")!;
      expect(session.round.fallingBlocks?.crownUserId).toBe("user-leo");
      expect(session.round.participants.find((player) => player.userId === "user-maya")?.fallingBlocks?.tSpinDoubles).toBe(1);
    }
    runtime.leave("user-leo");
    runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
    expect(runtime.getSessionEvents("user-leo").some((event) => event.type === "game.lobby_updated" && event.lobby.participantIds.includes("user-leo"))).toBe(true);
    const completed = runtime.leave("user-maya").find((delivery) => delivery.event.type === "game.round_completed")!;
    expect(completed.scope).toBe("all");
    expect(completed.event).toMatchObject({
      round: { winnerUserId: "user-maya", fallingBlocks: { crownUserId: "user-maya" } },
      scores: expect.arrayContaining([expect.objectContaining({ userId: "user-maya", fallingBlocks: expect.objectContaining({ tSpinDoubles: 1 }) })]),
    });
    expect(runtime.leave("user-maya")).toEqual([]);
    expect(store.getGameStatistics().find((entry) => entry.userId === "user-maya")?.fallingBlocks?.totals.tSpinDoubles).toBe(1);
  });

  it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid special counts %s atomically", (quads) => {
    const store = new WorkspaceStore(createTestData());
    const before = store.exportMutableState();
    expect(() => record(store, "invalid", ["user-maya"], undefined, { ...emptyFallingBlocksSpecialCounts(), quads })).toThrow("GAME_RESULT_INVALID");
    expect(store.exportMutableState()).toEqual(before);
  });
});

function record(store: WorkspaceStore, roundId: string, userIds: string[], winner?: string, counts: FallingBlocksSpecialCounts = emptyFallingBlocksSpecialCounts()) {
  return store.recordGameRound(roundId, FALLING_BLOCKS_DEFINITION_ID, userIds.map((userId, index) => ({
    userId, score: userId === winner ? 100 : 0, lines: 0, level: 1, order: index, won: userId === winner, fallingBlocks: counts,
  })));
}

function crownHolder(store: WorkspaceStore) {
  const holders = store.getGameStatistics().filter((entry) => entry.definitionId === FALLING_BLOCKS_DEFINITION_ID && entry.holdsCrown);
  expect(holders.length).toBeLessThanOrEqual(1);
  return holders[0]?.userId;
}
