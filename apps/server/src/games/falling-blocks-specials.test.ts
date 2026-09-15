import { describe, expect, it } from "vitest";
import { TETROMINO_SHAPES, type TetrominoType } from "@workhard/shared";
import { FallingBlocksGame } from "./falling-blocks.js";
import { rotateCells, type FallingBlocksRotation } from "./falling-blocks-rotation.js";
import { prepareLineClear, prepareTSpinDouble } from "./testing/falling-blocks.js";

describe("Falling Blocks rotations and specials", () => {
  it("recognizes a T-spin double after an actual rotation and zero-distance hard drop", () => {
    const game = new FallingBlocksGame("spin");
    prepareTSpinDouble(game);
    expect(game.command("rotate")).toBe(true);
    expect(game.command("left")).toBe(false);
    expect(game.command("down")).toBe(false);
    game.command("drop");
    expect(game.state).toMatchObject({ score: 1200, lines: 2, specials: { tSpins: 1, tSpinDoubles: 1, doubles: 0 }, lastClear: { spin: "full", lines: 2, points: 1200, attackRows: 4 } });
    expect(game.consumeClears()).toHaveLength(1);
    expect(game.consumeClears()).toEqual([]);
  });

  it("recognizes a mini from its front corners and counts it separately", () => {
    const game = new FallingBlocksGame("mini");
    const board = emptyBoard();
    board[17]![5] = 2;
    board[18] = Array.from({ length: 10 }, (_, column) => [3, 4, 5].includes(column) ? 0 : 2);
    board[19]![3] = 2;
    board[19]![5] = 2;
    setPiece(game, "T", 3, 17, 3, board);
    game.command("rotate");
    game.update(500);
    expect(game.state).toMatchObject({ score: 200, lines: 1, specials: { tSpins: 0, tSpinMinis: 1, singles: 0 }, lastClear: { spin: "mini", points: 200 } });
  });

  it.each([false, true])("uses the fifth wall kick for a triple and promotes mini geometry: %s", (miniGeometry) => {
    const game = new FallingBlocksGame("triple");
    const board = emptyBoard();
    for (let row = 17; row < 20; row += 1) {
      board[row] = Array.from({ length: 10 }, (_, column) => column === 4 || (row === 18 && column === 5) ? 0 : 2);
    }
    board[15]![4] = 2;
    if (miniGeometry) board[19]![5] = 0;
    setPiece(game, "T", 4, 15, 0, board);
    expect(game.command("rotate")).toBe(true);
    expect(Reflect.get(game, "lastRotationKick")).toBe(4);
    game.command("drop");
    expect(game.state.lastClear).toMatchObject({ spin: "full", lines: miniGeometry ? 2 : 3, points: miniGeometry ? 1200 : 1600 });
  });

  it("does not award a spin for a T piece placed without a rotation", () => {
    const game = new FallingBlocksGame("no-spin");
    prepareTSpinDouble(game);
    const board = Reflect.get(game, "board") as number[][];
    setPiece(game, "T", 3, 17, 2, board);
    game.command("drop");
    expect(game.state.lastClear).toMatchObject({ spin: "none", lines: 2, points: 300 });
  });

  it.each(["down", "left", "right", "hold"] as const)("clears rotation credit after successful %s", (command) => {
    const game = new FallingBlocksGame("movement");
    setPiece(game, "T", 3, 2, 0);
    game.command("rotate");
    expect(Reflect.get(game, "lastRotationKick")).toBe(0);
    expect(game.command(command)).toBe(true);
    expect(Reflect.get(game, "lastRotationKick")).toBeNull();
  });

  it("clears rotation credit when gravity or incoming rows move the piece", () => {
    const game = new FallingBlocksGame("gravity");
    setPiece(game, "T", 3, 2, 0);
    game.command("rotate");
    game.update(665);
    expect(Reflect.get(game, "lastRotationKick")).toBeNull();
    game.command("rotate");
    game.addGarbageRows(1, 0);
    expect(Reflect.get(game, "lastRotationKick")).toBeNull();
  });

  it("uses I-specific wall kicks in both directions", () => {
    const game = new FallingBlocksGame("i-kick");
    setPiece(game, "I", -2, 4, 1);
    expect(game.command("rotate-counterclockwise")).toBe(true);
    expect(game.state.activeCells.map(({ column }) => column)).toEqual([0, 1, 2, 3]);
    setPiece(game, "I", -2, 4, 1);
    expect(game.command("rotate")).toBe(true);
    expect(game.state.activeCells.map(({ column }) => column)).toEqual([0, 1, 2, 3]);
  });

  it("kicks off the floor and returns to the original cells after four rotations in open space", () => {
    const game = new FallingBlocksGame("floor-kick");
    setPiece(game, "T", 3, 18, 0);
    expect(game.command("rotate")).toBe(true);
    expect(Math.max(...game.state.activeCells.map(({ row }) => row))).toBe(19);
    for (const type of ["I", "J", "L", "S", "T", "Z"] as const) {
      setPiece(game, type, 3, 4, 0);
      const before = game.state.activeCells;
      for (let index = 0; index < 4; index += 1) game.command("rotate");
      expect(game.state.activeCells).toEqual(before);
    }
  });

  it("scores at the level before the line clear crosses the level boundary", () => {
    const game = new FallingBlocksGame("level");
    Object.assign(game, { lines: 7 });
    prepareLineClear(game, 1);
    game.command("drop");
    expect(game.state).toMatchObject({ lines: 8, level: 2, lastClear: { points: 100 } });
  });

  it.each<[FallingBlocksRotation, number, number]>([[0, 18, 1], [3, 17, 666]])("enforces the lock reset limit from rotation %i", (rotation, row, elapsedMs) => {
    const game = new FallingBlocksGame("reset-limit");
    setPiece(game, "T", 3, row, rotation);
    Object.assign(game, { lockResetCount: 14 });
    expect(game.command("rotate")).toBe(true);
    expect(Reflect.get(game, "lockResetCount")).toBe(15);
    game.update(elapsedMs);
    expect(game.stoneCount).toBe(4);
    expect(Reflect.get(game, "lockResetCount")).toBe(0);
  });

  it("awards a perfect clear only when the whole settled board is empty", () => {
    const game = new FallingBlocksGame("perfect");
    prepareLineClear(game, 4);
    (Reflect.get(game, "board") as number[][])[10]![0] = 0;
    game.command("drop");
    expect(game.state.lastClear).toMatchObject({ perfectClear: true, points: 2800, attackRows: 10 });
    expect(game.state.specials).toMatchObject({ quads: 1, perfectClears: 1 });
    prepareLineClear(game, 4, 1);
    game.command("drop");
    expect(game.state.lastClear?.perfectClear).toBe(false);
  });

  it("tops out instead of discarding piece cells locked above the board", () => {
    const game = new FallingBlocksGame("top-out");
    const board = emptyBoard();
    board[1]![3] = 2;
    setPiece(game, "T", 3, -1, 0, board);
    game.command("drop");
    expect(game.state).toMatchObject({ running: false, activePiece: null, score: 0, lastClear: null });
  });
});

function emptyBoard(): number[][] {
  return Array.from({ length: 20 }, () => Array<number>(10).fill(0));
}

function setPiece(game: FallingBlocksGame, type: TetrominoType, x: number, y: number, rotation: FallingBlocksRotation, board = emptyBoard()): void {
  let cells = TETROMINO_SHAPES[type].map((row) => [...row]);
  for (let index = 0; index < rotation; index += 1) cells = rotateCells(cells, 1);
  Object.assign(game, { board, piece: { type, color: 3, cells, x, y, rotation }, lastRotationKick: null, accumulatedMs: 0, groundedMs: 0, lockResetCount: 0 });
}
