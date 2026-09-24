import { FALLING_BLOCKS_GARBAGE_CELL, FALLING_BLOCKS_HARD_CELL, type FallingBlocksMode } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { FallingBlocksGame } from "@workhard/shared";
import { prepareLineClear, setFallingBlocksBoard } from "./testing/falling-blocks.js";

describe("Falling Blocks modes", () => {
  it("increases fall speed with active time and applies the shorter interval to gravity", () => {
    const game = new FallingBlocksGame("speed", "speed-up");
    const firstCells = game.state.activeCells;
    game.update(664);
    expect(game.state.activeCells).toEqual(firstCells);
    game.update(1);
    expect(game.state.activeCells).toEqual(firstCells.map((cell) => ({ ...cell, row: cell.row + 1 })));

    game.update(30_000 - 665);
    expect(game.state).toMatchObject({ level: 2, lines: 0, fallIntervalMs: 610 });
    game.command("hold");
    const nextCells = game.state.activeCells;
    game.update(609);
    expect(game.state.activeCells).toEqual(nextCells);
    game.update(1);
    expect(game.state.activeCells).toEqual(nextCells.map((cell) => ({ ...cell, row: cell.row + 1 })));
    game.update(30_000 - 610);
    expect(game.state).toMatchObject({ level: 3, fallIntervalMs: 555, running: true });
  });

  it("keeps Classic progression tied to cleared lines and preserves the minimum interval", () => {
    const game = new FallingBlocksGame("classic");
    game.update(30_000);
    expect(game.state).toMatchObject({ level: 1, fallIntervalMs: 665 });
    for (let index = 0; index < 30; index += 1) {
      prepareLineClear(game, 4);
      game.command("drop");
    }
    expect(game.state).toMatchObject({ lines: 120, level: 16, fallIntervalMs: 140 });
    expect(game.state.grid.flat()).not.toContain(FALLING_BLOCKS_HARD_CELL);
  });

  it.each<FallingBlocksMode>(["speed-up", "sudden-death"])("freezes %s timing while paused or finished", (mode) => {
    const game = new FallingBlocksGame("pause", mode);
    game.update(29_999);
    game.command("pause");
    const paused = game.state;
    game.update(60_000);
    expect(game.state).toEqual(paused);
    game.command("pause");
    game.update(1);
    if (mode === "speed-up") expect(game.state.level).toBe(2);
    else expect(game.state.grid[19]).toEqual(Array(10).fill(FALLING_BLOCKS_HARD_CELL));
    game.end();
    const ended = game.state;
    game.update(60_000);
    expect(game.state).toEqual(ended);
  });

  it("raises hard rows at each interval and keeps them through line clears", () => {
    const game = new FallingBlocksGame("hard", "sudden-death");
    game.update(29_999);
    expect(game.state.grid.flat()).not.toContain(FALLING_BLOCKS_HARD_CELL);
    game.update(1);
    expect(game.state.grid[19]).toEqual(Array(10).fill(FALLING_BLOCKS_HARD_CELL));
    expect(game.state.lines).toBe(0);
    game.update(30_000);
    expect(game.state.grid.slice(18)).toEqual(Array.from({ length: 2 }, () => Array(10).fill(FALLING_BLOCKS_HARD_CELL)));
    prepareLineClear(game, 4, 2);
    game.command("drop");
    expect(game.state.lines).toBe(4);
    expect(game.consumeClears()).toEqual([expect.objectContaining({ lines: 4 })]);
    expect(game.state.grid.flat().filter((cell) => cell === FALLING_BLOCKS_HARD_CELL)).toHaveLength(20);
    game.command("drop");
    expect(game.state.lines).toBe(4);
    expect(game.state.grid.slice(18).flat().every((cell) => cell === FALLING_BLOCKS_HARD_CELL)).toBe(true);
  });

  it("inserts clearable attack rows above the hard floor without changing the piece sequence", () => {
    const game = new FallingBlocksGame("garbage", "sudden-death");
    game.update(60_000);
    const floor = game.state.grid.slice(18);
    setFallingBlocksBoard(game, [...Array.from({ length: 18 }, () => Array<number>(10).fill(0)), ...floor]);
    const queue = game.state.nextPieces;
    game.addGarbageRows(4, 4);
    expect(game.state.grid.slice(14, 18)).toEqual(Array.from({ length: 4 }, () => Array.from({ length: 10 }, (_, column) => column === 4 ? 0 : FALLING_BLOCKS_GARBAGE_CELL)));
    expect(game.state.grid.slice(18)).toEqual(floor);
    expect(game.state.nextPieces).toEqual(queue);
    game.command("drop");
    expect(game.state.lines).toBe(4);
    expect(game.state.grid.flat()).not.toContain(FALLING_BLOCKS_GARBAGE_CELL);
    expect(game.state.grid.slice(18)).toEqual(floor);
  });

  it("counts settled cells, including garbage and hard cells, and excludes active and held pieces", () => {
    const game = new FallingBlocksGame("stones");
    expect(game.stoneCount).toBe(0);
    game.command("hold");
    expect(game.stoneCount).toBe(0);
    game.command("drop");
    expect(game.stoneCount).toBe(4);
    game.addGarbageRows(2, 0);
    expect(game.stoneCount).toBe(22);
    prepareLineClear(game, 0, 2);
    expect(game.stoneCount).toBe(20);
  });

  it.each(["overflow", "active-piece"])("ends the game when rising rows cause %s top-out", (scenario) => {
    const game = new FallingBlocksGame("top", "sudden-death");
    const board = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
    if (scenario === "overflow") board[0]![0] = 1;
    else board[4]![4] = 1;
    setFallingBlocksBoard(game, board);
    Object.assign(game, { elapsedMs: 29_999 });
    game.update(1);
    expect(game.state).toMatchObject({ running: false, activePiece: null, lines: 0, score: 0 });
    expect(game.state.grid[19]).toEqual(Array(10).fill(FALLING_BLOCKS_HARD_CELL));
  });

  it("lifts a grounded piece safely when garbage rises underneath it", () => {
    const game = new FallingBlocksGame("lift");
    while (game.command("down")) continue;
    const cells = game.state.activeCells;
    game.addGarbageRows(2, 0);
    expect(game.state.running).toBe(true);
    expect(game.state.activeCells).toEqual(cells.map((cell) => ({ ...cell, row: cell.row - 2 })));
    game.update(500);
    expect(game.state.running).toBe(true);
  });

  it.each<FallingBlocksMode>(["classic", "speed-up", "sudden-death"])("produces the same %s state for small and large time steps", (mode) => {
    const large = new FallingBlocksGame("tick-equivalence", mode);
    const small = new FallingBlocksGame("tick-equivalence", mode);
    large.update(60_000);
    for (let time = 0; time < 60_000; time += 50) small.update(50);
    expect(large.state).toEqual(small.state);
  });
});
