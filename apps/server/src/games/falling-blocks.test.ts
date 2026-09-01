import { describe, expect, it } from "vitest";
import { FallingBlocksGame } from "./falling-blocks.js";

describe("FallingBlocksGame", () => {
  it("starts with a complete empty-sized board and an active piece", () => {
    const game = new FallingBlocksGame();

    expect(game.state.grid).toHaveLength(20);
    expect(game.state.grid.every((row) => row.length === 10)).toBe(true);
    expect(game.state.grid.flat().some((cell) => cell > 0)).toBe(true);
    expect(game.state.running).toBe(true);
  });

  it("scores a hard drop on the authoritative state", () => {
    const game = new FallingBlocksGame();

    game.command("drop");

    expect(game.state.score).toBeGreaterThan(0);
    expect(game.state.running).toBe(true);
  });

  it("pauses falling until resumed", () => {
    const game = new FallingBlocksGame();
    game.command("pause");
    const before = game.state.grid;

    game.update(2_000);

    expect(game.state.paused).toBe(true);
    expect(game.state.grid).toEqual(before);
  });
});
