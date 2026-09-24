import { createTestData } from "../testing/workspace-data.js";
import { FALLING_BLOCKS_DEFINITION_ID, FALLING_BLOCKS_GARBAGE_CELL, FALLING_BLOCKS_HARD_CELL, type FallingBlocksSettings, type WorldPlayer } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import type { FallingBlocksGame } from "@workhard/shared";
import { FallingBlocksMultiplayerRuntime } from "./falling-blocks-multiplayer.js";
import { prepareLineClear, prepareTSpinDouble, setFallingBlocksBoard } from "./testing/falling-blocks.js";

describe("Falling Blocks multiplayer attacks", () => {
  it("cancels incoming attacks with a spin and sends only the remaining back-to-back attack", () => {
    const { runtime, games } = setup();
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    const defender = games.get("user-leo")!;
    prepareTSpinDouble(defender);
    runtime.command("user-leo", "rotate");
    runtime.command("user-leo", "drop");
    expect(snapshot(runtime).attacks).toEqual([]);
    prepareLineClear(games.get("user-maya")!, 2);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks[0]?.rows).toBe(1);
    prepareTSpinDouble(defender);
    runtime.command("user-leo", "rotate");
    runtime.command("user-leo", "drop");
    expect(snapshot(runtime).attacks).toEqual([expect.objectContaining({ sourceUserId: "user-leo", targetUserId: "user-priya", rows: 4, remainingMs: 3000 })]);
  });

  it.each([[1, 0], [2, 1], [3, 2], [4, 4]])("sends %i-line clears as %i delayed rows exactly once", (lines, rows) => {
    const { runtime, games } = setup();
    prepareLineClear(games.get("user-maya")!, lines);
    const deliveries = runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks).toHaveLength(rows ? 1 : 0);
    expect(games.get("user-leo")!.stoneCount).toBe(0);
    expect(deliveries).toContainEqual(expect.objectContaining({
      scope: "users", userIds: expect.arrayContaining(["user-maya", "user-leo", "user-priya"]),
      event: expect.objectContaining({ type: "game.round_updated" }),
    }));

    runtime.update(2_999);
    expect(games.get("user-leo")!.stoneCount).toBe(0);
    if (rows) expect(snapshot(runtime).attacks[0]).toMatchObject({ sourceUserId: "user-maya", targetUserId: "user-leo", rows, remainingMs: 1 });
    const applied = runtime.update(1);
    expect(games.get("user-leo")!.stoneCount).toBe(rows * 9);
    expect(games.get("user-priya")!.stoneCount).toBe(0);
    expect(snapshot(runtime).attacks).toEqual([]);
    if (rows) {
      expect(applied).toContainEqual({ scope: "users", userIds: ["user-leo"], event: expect.objectContaining({ type: "game.state", grid: gameState(runtime, "user-leo").grid }) });
      expect(gameState(runtime, "user-leo").grid.flat().filter((cell) => cell === FALLING_BLOCKS_GARBAGE_CELL)).toHaveLength(rows * 9);
    }
    runtime.update(1);
    expect(games.get("user-leo")!.stoneCount).toBe(rows * 9);
  });

  it.each([[0, "user-leo"], [0.999, "user-priya"]] as const)("uses server randomness %s to select %s", (random, targetUserId) => {
    const { runtime, games } = setup({ mode: "classic", attackTarget: "random" }, () => random);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks[0]?.targetUserId).toBe(targetUserId);
  });

  it("selects the fewest settled cells rather than the lowest stack, and retains the chosen target", () => {
    const { runtime, games } = setup({ mode: "classic", attackTarget: "fewest-stones" });
    const lowStack = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
    for (let column = 0; column < 9; column += 1) lowStack[19]![column] = 2;
    setFallingBlocksBoard(games.get("user-leo")!, lowStack);
    const tallStack = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
    for (let row = 14; row < 20; row += 1) tallStack[row]![0] = 3;
    setFallingBlocksBoard(games.get("user-priya")!, tallStack);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks[0]?.targetUserId).toBe("user-priya");
    setFallingBlocksBoard(games.get("user-leo")!, Array.from({ length: 20 }, () => Array<number>(10).fill(0)));
    runtime.update(3_000);
    expect(games.get("user-priya")!.stoneCount).toBe(42);
    expect(games.get("user-leo")!.stoneCount).toBe(0);
  });

  it("breaks fewest-stones ties randomly and excludes the sender and finished players", () => {
    const { runtime, games } = setup({ mode: "classic", attackTarget: "fewest-stones" }, () => 0.999);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks[0]?.targetUserId).toBe("user-priya");
    runtime.leave("user-priya");
    expect(snapshot(runtime).attacks).toEqual([]);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks[0]?.targetUserId).toBe("user-leo");
  });

  it("queues automatic locks and keeps each attack's full delay", () => {
    const { runtime, games } = setup();
    const sender = games.get("user-maya")!;
    prepareLineClear(sender, 4);
    while (sender.command("down")) continue;
    runtime.update(499);
    expect(snapshot(runtime).attacks).toEqual([]);
    runtime.update(1);
    expect(snapshot(runtime).attacks[0]).toMatchObject({ rows: 4, remainingMs: 3_000 });
    runtime.update(1_000);
    prepareLineClear(sender, 2);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks.map(({ remainingMs }) => remainingMs)).toEqual([2_000, 3_000]);
    runtime.update(2_000);
    expect(games.get("user-leo")!.stoneCount).toBe(36);
    expect(snapshot(runtime).attacks).toHaveLength(1);
    runtime.update(1_000);
    expect(games.get("user-leo")!.stoneCount).toBe(45);
    expect(snapshot(runtime).attacks).toEqual([]);
  });

  it("restores identical settings and pending attacks for every participant and reconnect", () => {
    const settings: FallingBlocksSettings = { mode: "sudden-death", attackTarget: "fewest-stones" };
    const { runtime, games } = setup(settings);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    runtime.update(1_000);
    const expected = snapshot(runtime);
    expect(expected.settings).toEqual(settings);
    expect(expected.attacks[0]?.remainingMs).toBe(2_000);
    for (const userId of games.keys()) {
      expect(snapshot(runtime, userId)).toEqual(expected);
      expect(gameState(runtime, userId)).toEqual(games.get(userId)!.state);
      const resumed = runtime.start(userId, "object-falling-blocks", true, { mode: "classic", attackTarget: "random" });
      expect(resumed.deliveries.find((delivery) => delivery.event.type === "game.round_started")?.event).toMatchObject({ round: { fallingBlocks: expected } });
    }
    runtime.update(2_000);
    expect(snapshot(runtime, "user-leo")).toEqual(snapshot(runtime));
    expect(snapshot(runtime).attacks).toEqual([]);
  });

  it("raises the hard floor equally for all players and delivers garbage above it", () => {
    const { runtime, games } = setup({ mode: "sudden-death", attackTarget: "random" });
    runtime.update(29_000);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    runtime.update(3_000);
    for (const game of games.values()) expect(game.state.grid[19]).toEqual(Array(10).fill(FALLING_BLOCKS_HARD_CELL));
    expect(games.get("user-leo")!.state.grid.slice(15, 19).flat().filter((cell) => cell === FALLING_BLOCKS_GARBAGE_CELL)).toHaveLength(36);
    expect(snapshot(runtime).attacks).toEqual([]);
  });

  it("does not advance another player's piece sequence when selecting targets or holes", () => {
    const { runtime, games } = setup();
    const before = [...games.values()].map((game) => [game.state.activePiece, ...game.state.nextPieces]);
    expect(before[1]).toEqual(before[2]);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    runtime.update(3_000);
    expect([games.get("user-leo")!.state.activePiece, ...games.get("user-leo")!.state.nextPieces]).toEqual(before[1]);
  });

  it("cancels attacks on a leaving target and retains attacks from a leaving sender", () => {
    const { runtime, games } = setup();
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    runtime.leave("user-leo");
    expect(snapshot(runtime).attacks).toEqual([]);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    runtime.leave("user-maya");
    runtime.update(3_000);
    expect(games.get("user-priya")!.stoneCount).toBe(45);
    expect(games.get("user-leo")!.stoneCount).toBe(0);
  });

  it("finishes a player topped out by garbage and removes other attacks on that player", () => {
    const { runtime, games } = setup();
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    const board = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
    board[0]![0] = 1;
    setFallingBlocksBoard(games.get("user-leo")!, board);
    const deliveries = runtime.update(3_000);
    expect(games.get("user-leo")!.completed).toBe(true);
    expect(runtime.isPlaying("user-leo")).toBe(false);
    expect(snapshot(runtime).attacks).toEqual([]);
    expect(deliveries.find((delivery) => delivery.event.type === "game.round_updated")?.event).toMatchObject({
      round: { participants: expect.arrayContaining([expect.objectContaining({ userId: "user-leo", status: "finished" })]) },
    });
  });

  it("keeps attacks inside a round and starts solo replays with empty queues and reset timers", () => {
    const { runtime, games, players } = setup({ mode: "speed-up", attackTarget: "random" });
    runtime.update(30_000);
    expect([...games.values()].map((game) => game.state.level)).toEqual([2, 2, 2]);
    prepareLineClear(games.get("user-maya")!, 4);
    runtime.command("user-maya", "drop");
    for (const player of players) runtime.leave(player.userId);
    runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
    runtime.start("user-maya", "object-falling-blocks", true, { mode: "speed-up", attackTarget: "random" });
    expect(snapshot(runtime).attacks).toEqual([]);
    expect(gameState(runtime, "user-maya")).toMatchObject({ level: 1, fallIntervalMs: 665, score: 0, lines: 0 });
    const soloGame = activeGames(runtime).get("user-maya")!;
    prepareLineClear(soloGame, 4);
    runtime.command("user-maya", "drop");
    expect(snapshot(runtime).attacks).toEqual([]);
  });
});

function setup(settings: FallingBlocksSettings = { mode: "classic", attackTarget: "random" }, random = () => 0) {
  const runtime = new FallingBlocksMultiplayerRuntime(new WorkspaceStore(createTestData()), random);
  const players: WorldPlayer[] = ["user-maya", "user-leo", "user-priya"].map((userId, index) => ({
    userId, floorId: "floor-studio", x: 1_080 + index * 50, y: 620, facing: "down", availability: "available", connected: true,
  }));
  runtime.syncLobbies(players, new Set(players.map((player) => player.userId)));
  runtime.start("user-maya", "object-falling-blocks", false, settings);
  return { runtime, games: activeGames(runtime), players };
}

function activeGames(runtime: FallingBlocksMultiplayerRuntime): Map<string, FallingBlocksGame> {
  const rounds = Reflect.get(runtime, "rounds") as Map<string, { games: Map<string, FallingBlocksGame> }>;
  return [...rounds.values()][0]!.games;
}

function snapshot(runtime: FallingBlocksMultiplayerRuntime, userId = "user-maya") {
  return runtime.getSessionEvents(userId).find((event) => event.type === "game.round_started")!.round.fallingBlocks!;
}

function gameState(runtime: FallingBlocksMultiplayerRuntime, userId: string) {
  return runtime.getSessionEvents(userId).find((event) => event.type === "game.state" && event.definitionId === FALLING_BLOCKS_DEFINITION_ID)!;
}
