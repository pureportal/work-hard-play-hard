import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFallingBlocksSpecialCounts, FALLING_BLOCKS_HARD_CELL, FALLING_BLOCKS_GARBAGE_CELL, type FallingBlocksGameState, type GameRoundState, type FallingBlocksCommand } from "@workhard/shared";
import { FallingBlocksGame } from "./FallingBlocksGame";

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false }))));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("FallingBlocksGame", () => {
  it("shows gameplay controls immediately on touch devices", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    renderGame(vi.fn());
    expect(screen.getByRole("button", { name: "Move left" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Drop" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide controls" }));
    expect(screen.queryByRole("button", { name: "Move left" })).toBeNull();
  });

  it("hides every gameplay button and key hint until controls are toggled", () => {
    const onCommand = vi.fn();
    const { container } = renderGame(onCommand);
    expect(container.querySelectorAll("kbd")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Move left" })).toBeNull();
    fireEvent.keyDown(window, { code: "KeyZ" });
    fireEvent.keyUp(window, { code: "KeyZ" });
    expect(onCommand).toHaveBeenCalledWith("rotate-counterclockwise");
    screen.getByRole("button", { name: "Show controls" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    fireEvent.keyDown(document.activeElement!, { code: "ArrowLeft" });
    fireEvent.keyUp(document.activeElement!, { code: "ArrowLeft" });
    expect(onCommand).toHaveBeenLastCalledWith("left");
    expect(screen.getByRole("button", { name: "Hide controls" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Move left" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide controls" }));
    expect(container.querySelectorAll("kbd")).toHaveLength(0);
  });

  it("stops keyboard repeats on pause and lets focused controls receive keyboard activation", () => {
    vi.useFakeTimers();
    const onCommand = vi.fn();
    const result = renderGame(onCommand);
    fireEvent.keyDown(window, { code: "ArrowLeft" });
    result.rerender(gameElement(onCommand, { ...createState(), paused: true }));
    act(() => vi.advanceTimersByTime(500));
    fireEvent.keyDown(window, { code: "Space" });
    expect(onCommand.mock.calls.map(([command]) => command)).toEqual(["left"]);
    fireEvent.keyDown(window, { code: "KeyP" });
    expect(onCommand).toHaveBeenLastCalledWith("pause");
    fireEvent.keyDown(screen.getByRole("button", { name: "Show controls" }), { code: "Space" });
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("shows a special's awarded points briefly without repeating on ordinary updates", () => {
    vi.useFakeTimers();
    const state: FallingBlocksGameState = { ...createState(), lastClear: { id: 1, lines: 2, spin: "full", points: 1850, combo: 1, backToBack: true, perfectClear: false, attackRows: 5 } };
    const result = render(gameElement(vi.fn(), state));
    expect(screen.getByRole("status").textContent).toContain("T-spin DoubleBack-to-backCombo 1+1,850");
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.queryByRole("status")).toBeNull();
    result.rerender(gameElement(vi.fn(), { ...state, score: 2000 }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("distinguishes hard rows and shows only this player's incoming attacks", () => {
    const state = createState();
    state.grid[19] = Array(10).fill(FALLING_BLOCKS_HARD_CELL);
    state.grid[18] = Array.from({ length: 10 }, (_, column) => column === 0 ? 0 : FALLING_BLOCKS_GARBAGE_CELL);
    const multiplayerRound: GameRoundState = {
      ...round,
      participants: [...round.participants, { userId: "user-leo", score: 0, lines: 0, level: 1, status: "playing" }],
      fallingBlocks: {
        settings: { mode: "sudden-death", attackTarget: "random" },
        attacks: [
          { id: 1, sourceUserId: "user-leo", targetUserId: "user-maya", rows: 4, remainingMs: 3_000 },
          { id: 2, sourceUserId: "user-maya", targetUserId: "user-leo", rows: 2, remainingMs: 3_000 },
        ],
      },
    };
    const result = render(gameElement(vi.fn(), state, multiplayerRound));
    expect(result.container.querySelectorAll(".falling-blocks-cell.is-hard")).toHaveLength(10);
    expect(screen.getByRole("status").textContent).toBe("Incoming4");
    expect(screen.getByText("Sudden death")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    result.rerender(gameElement(vi.fn(), state, { ...multiplayerRound, fallingBlocks: { ...multiplayerRound.fallingBlocks!, attacks: [] } }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows hold, next pieces, ghost cells, and the current statistics", () => {
    const { container } = renderGame(vi.fn());

    expect(screen.getByRole("img", { name: "Held T piece" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "O piece next" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Game controls" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show controls" }));
    expect(screen.getByRole("button", { name: "Hold" })).not.toHaveProperty("disabled", true);
    expect(container.querySelectorAll(".falling-blocks-cell.is-ghost")).toHaveLength(4);
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

function renderGame(onCommand: (command: FallingBlocksCommand) => void) {
  return render(gameElement(onCommand, createState()));
}

function gameElement(onCommand: (command: FallingBlocksCommand) => void, state: FallingBlocksGameState, gameRound: GameRoundState = round) {
  return (
    <FallingBlocksGame
      state={state}
      round={gameRound}
      members={[]}
      currentUserId="user-maya"
      onCommand={onCommand}
      onClose={vi.fn()}
    />
  );
}

function createState(): FallingBlocksGameState {
  const grid = Array.from({ length: 20 }, () => Array<number>(10).fill(0));
  for (const column of [3, 4, 5, 6]) {
    grid[0]![column] = 1;
  }
  return {
    type: "game.state",
    roundId: "round-test",
    definitionId: "game-falling-blocks",
    grid,
    score: 1_240,
    lines: 8,
    level: 2,
    fallIntervalMs: 610,
    running: true,
    paused: false,
    activePiece: "I",
    activeCells: [3, 4, 5, 6].map((column) => ({ row: 0, column })),
    ghostCells: [3, 4, 5, 6].map((column) => ({ row: 19, column })),
    heldPiece: "T",
    nextPieces: ["O", "S", "J", "L", "Z"],
    canHold: true,
    specials: emptyFallingBlocksSpecialCounts(),
    lastClear: null,
  };
}

const round: GameRoundState = {
  objectId: "object-falling-blocks",
  id: "round-test",
  definitionId: "game-falling-blocks",
  floorId: "floor-studio",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "playing",
  participants: [
    { userId: "user-maya", score: 1_240, lines: 8, level: 2, status: "playing" },
  ],
};
