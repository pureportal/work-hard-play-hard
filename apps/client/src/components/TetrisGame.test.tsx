import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameRoundState, GameState, TetrisCommand } from "@workhard/shared";
import { TetrisGame } from "./TetrisGame";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TetrisGame", () => {
  it("shows hold, next pieces, ghost cells, and the current statistics", () => {
    const { container } = renderGame(vi.fn());

    expect(screen.getByRole("img", { name: "Held T piece" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "O piece next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hold" })).not.toHaveProperty("disabled", true);
    expect(container.querySelectorAll(".tetris-cell.is-ghost")).toHaveLength(4);
    expect(screen.getByLabelText("Game statistics").textContent).toContain("1,240");
  });

  it("keeps horizontal repeat active while rotating and across state rerenders", () => {
    vi.useFakeTimers();
    const firstCommandHandler = vi.fn();
    const secondCommandHandler = vi.fn();
    const result = renderGame(firstCommandHandler);

    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    expect(firstCommandHandler).toHaveBeenCalledWith("left");

    result.rerender(gameElement(secondCommandHandler, { ...createState(), score: 1_241 }));
    fireEvent.keyDown(window, { code: "ArrowUp", key: "ArrowUp" });
    act(() => vi.advanceTimersByTime(111));
    fireEvent.keyUp(window, { code: "ArrowUp", key: "ArrowUp" });
    fireEvent.keyUp(window, { code: "ArrowLeft", key: "ArrowLeft" });

    expect(secondCommandHandler.mock.calls.map(([command]) => command)).toEqual(["rotate", "left"]);
  });

  it("uses the most recently pressed horizontal direction and resumes the held direction on release", () => {
    vi.useFakeTimers();
    const onCommand = vi.fn();
    renderGame(onCommand);

    fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
    fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" });
    fireEvent.keyUp(window, { code: "ArrowRight", key: "ArrowRight" });
    fireEvent.keyUp(window, { code: "ArrowLeft", key: "ArrowLeft" });

    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["left", "right", "left"]);
  });

  it("sends one hold command per physical key press", () => {
    const onCommand = vi.fn();
    renderGame(onCommand);

    fireEvent.keyDown(window, { code: "KeyC", key: "c" });
    fireEvent.keyDown(window, { code: "KeyC", key: "c", repeat: true });
    fireEvent.keyUp(window, { code: "KeyC", key: "c" });

    expect(onCommand).toHaveBeenCalledOnce();
    expect(onCommand).toHaveBeenCalledWith("hold");
  });
});

function renderGame(onCommand: (command: TetrisCommand) => void) {
  return render(gameElement(onCommand, createState()));
}

function gameElement(onCommand: (command: TetrisCommand) => void, state: GameState) {
  return (
    <TetrisGame
      state={state}
      round={round}
      members={[]}
      currentUserId="user-maya"
      onCommand={onCommand}
      onClose={vi.fn()}
    />
  );
}

function createState(): GameState {
  const grid = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
  for (const column of [3, 4, 5, 6]) {
    grid[0]![column] = 1;
  }
  return {
    type: "game.state",
    roundId: "round-test",
    definitionId: "game-tetris",
    grid,
    score: 1_240,
    lines: 8,
    level: 2,
    running: true,
    paused: false,
    activePiece: "I",
    activeCells: [3, 4, 5, 6].map((column) => ({ row: 0, column })),
    ghostCells: [3, 4, 5, 6].map((column) => ({ row: 19, column })),
    heldPiece: "T",
    nextPieces: ["O", "S", "J", "L", "Z"],
    canHold: true,
  };
}

const round: GameRoundState = {
  id: "round-test",
  definitionId: "game-tetris",
  floorId: "floor-studio",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "playing",
  participants: [
    { userId: "user-maya", score: 1_240, lines: 8, level: 2, status: "playing" },
  ],
};
