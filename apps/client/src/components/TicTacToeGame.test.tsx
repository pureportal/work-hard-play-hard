import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ClassicTicTacToeState,
  Member,
  StackingTicTacToeState,
  TicTacToeCommand,
  TicTacToeStateBase,
  UltimateTicTacToeState,
} from "@workhard/shared";
import { TicTacToeGame } from "./TicTacToeGame";

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TicTacToeGame", () => {
  it("plays an open classic square on the current player's turn", () => {
    const onCommand = vi.fn<(command: TicTacToeCommand) => void>();
    renderGame(classicState(), onCommand);

    fireEvent.click(screen.getByRole("gridcell", { name: "Play center" }));

    expect(onCommand).toHaveBeenCalledWith({ kind: "classic.place", cell: 4 });
    expect(screen.getByRole("gridcell", { name: "top left: X" })).toHaveProperty("disabled", true);
  });

  it("enables only the required local board in Ultimate", () => {
    const onCommand = vi.fn<(command: TicTacToeCommand) => void>();
    renderGame(ultimateState(), onCommand);

    expect(screen.getByRole("gridcell", { name: "Play top left in top left board" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("gridcell", { name: "Play center in bottom right board" }));

    expect(onCommand).toHaveBeenCalledWith({ kind: "ultimate.place", board: 8, cell: 4 });
  });

  it("enlarges a mobile Ultimate board before placing a mark and returns to the overview after a move", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const onCommand = vi.fn<(command: TicTacToeCommand) => void>();
    const { rerender } = renderGame(ultimateState(), onCommand);
    expect(screen.getAllByRole("gridcell")).toHaveLength(9);
    expect(screen.getByRole("gridcell", { name: "top left board" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("gridcell", { name: "Open bottom right board" }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Play top left in bottom right board");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.getByRole("grid", { name: "Ultimate board" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("gridcell", { name: "Open bottom right board" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Play center in bottom right board" }));
    expect(onCommand).toHaveBeenCalledExactlyOnceWith({ kind: "ultimate.place", board: 8, cell: 4 });
    rerender(gameElement({ ...ultimateState(), turnUserId: "user-leo", moveNumber: 2, activeBoard: 4 }, onCommand));
    expect(screen.queryByRole("button", { name: "All boards" })).toBeNull();
    expect(screen.getAllByRole("gridcell").every((cell) => (cell as HTMLButtonElement).disabled)).toBe(true);
  });

  it("switches from an exhausted stacking reserve to a remaining piece", () => {
    const state = stackingState();
    const onCommand = vi.fn<(command: TicTacToeCommand) => void>();
    const { rerender } = renderGame(state, onCommand);
    rerender(gameElement({ ...state, reserves: { ...state.reserves, x: { small: 0, medium: 2, large: 2 } } }, onCommand));
    expect(screen.getByRole("button", { name: "Medium, 2 remaining" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("gridcell", { name: "Play center" }));
    expect(onCommand).toHaveBeenCalledWith({ kind: "stacking.place", size: "medium", cell: 4 });
  });

  it("places a selected size and moves a visible stacking piece", () => {
    const onCommand = vi.fn<(command: TicTacToeCommand) => void>();
    const { rerender } = renderGame(stackingState(), onCommand);

    fireEvent.click(screen.getByRole("button", { name: "Large, 2 remaining" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Play center" }));
    expect(onCommand).toHaveBeenLastCalledWith({ kind: "stacking.place", cell: 4, size: "large" });

    rerender(gameElement(stackingState(), onCommand));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "top left: Small X" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Play top center" }));

    expect(onCommand).toHaveBeenLastCalledWith({ kind: "stacking.move", fromCell: 0, toCell: 1 });
  });

  it("shows variant rules only when requested", () => {
    renderGame(stackingState(), vi.fn());

    expect(screen.queryByLabelText("Stacking rules")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Rules" }));

    expect(screen.getByLabelText("Stacking rules").textContent).toContain("Larger pieces can cover smaller pieces");
  });

  it("confirms before forfeiting an active game", () => {
    const onClose = vi.fn();
    render(
      <TicTacToeGame
        state={classicState()}
        members={members}
        currentUserId="user-maya"
        onCommand={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Forfeit game" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Forfeit game" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave game" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("confirms Escape and uses the latest result when closing", () => {
    const onClose = vi.fn();
    const props = { members, currentUserId: "user-maya", onCommand: vi.fn(), onClose };
    const { rerender } = render(<TicTacToeGame {...props} state={classicState()} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    const completed = classicState();
    completed.status = "draw";
    delete completed.turnUserId;
    rerender(<TicTacToeGame {...props} state={completed} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables every board while waiting for the opponent and after completion", () => {
    const onCommand = vi.fn();
    for (const state of [classicState(), ultimateState(), stackingState()]) {
      const { unmount } = renderGame({ ...state, turnUserId: "user-leo" }, onCommand);
      expect(screen.getAllByRole("gridcell").every((cell) => (cell as HTMLButtonElement).disabled)).toBe(true);
      unmount();
    }
    renderGame({ ...classicState(), status: "won", winnerUserId: "user-leo" }, onCommand);
    expect(screen.getByRole("status").textContent).toBe("Leo Martins wins");
    expect(screen.getAllByRole("gridcell").every((cell) => (cell as HTMLButtonElement).disabled)).toBe(true);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("shows both reserves and disables exhausted pieces and illegal covers", () => {
    const state = stackingState();
    state.board[1] = { mark: "o", size: "large" };
    state.board[2] = { mark: "o", size: "medium" };
    state.reserves.x.small = 0;
    state.reserves.o.medium = 1;
    state.reserves.o.large = 1;
    renderGame(state, vi.fn());

    expect(screen.getByRole("button", { name: "Small, 0 remaining" })).toHaveProperty("disabled", true);
    expect(within(screen.getByRole("group", { name: "Opponent pieces" })).getByLabelText("Medium, 1 remaining")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Medium, 2 remaining" }));
    expect(screen.getByRole("gridcell", { name: "top center: Large O" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("gridcell", { name: "top right: Medium O" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("gridcell", { name: "top left: Small X" })).toHaveProperty("disabled", false);
  });

  it("keeps won and drawn Ultimate boards disabled when any open board can be played", () => {
    const state = ultimateState();
    state.activeBoard = null;
    state.boardResults[0] = "draw";
    state.boardResults[1] = "x";
    renderGame(state, vi.fn());

    expect(screen.getByRole("gridcell", { name: "Play center in top left board" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("gridcell", { name: "Play center in top center board" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("gridcell", { name: "Play center in bottom right board" })).toHaveProperty("disabled", false);
  });
});

function renderGame(
  state: ClassicTicTacToeState | UltimateTicTacToeState | StackingTicTacToeState,
  onCommand: (command: TicTacToeCommand) => void,
) {
  return render(gameElement(state, onCommand));
}

function gameElement(
  state: ClassicTicTacToeState | UltimateTicTacToeState | StackingTicTacToeState,
  onCommand: (command: TicTacToeCommand) => void,
) {
  return (
    <TicTacToeGame
      state={state}
      members={members}
      currentUserId="user-maya"
      onCommand={onCommand}
      onClose={vi.fn()}
    />
  );
}

function baseState(): Omit<TicTacToeStateBase, "variantId"> {
  return {
    type: "game.state",
    roundId: "round-test",
    definitionId: "game-tic-tac-toe",
    players: [
      { userId: "user-maya", mark: "x" },
      { userId: "user-leo", mark: "o" },
    ],
    status: "playing",
    turnUserId: "user-maya",
    moveNumber: 1,
  };
}

function classicState(): ClassicTicTacToeState {
  return {
    ...baseState(),
    variantId: "classic",
    board: ["x", null, null, null, null, null, null, null, null],
  };
}

function ultimateState(): UltimateTicTacToeState {
  return {
    ...baseState(),
    variantId: "ultimate",
    boards: Array.from({ length: 9 }, () => Array(9).fill(null)),
    boardResults: Array(9).fill(null),
    activeBoard: 8,
  };
}

function stackingState(): StackingTicTacToeState {
  return {
    ...baseState(),
    variantId: "stacking",
    board: [{ mark: "x", size: "small" }, null, null, null, null, null, null, null, null],
    reserves: {
      x: { small: 1, medium: 2, large: 2 },
      o: { small: 2, medium: 2, large: 2 },
    },
  };
}

const members: Member[] = [
  member("user-maya", "Maya Chen", "MC", "#ff7a66"),
  member("user-leo", "Leo Martins", "LM", "#5b8def"),
];

function member(id: string, name: string, initials: string, color: string): Member {
  return {
    id,
    name,
    initials,
    character: { ...DEFAULT_CHARACTER_APPEARANCE },
    color,
    email: `${id}@example.com`,
    title: "",
    role: "member",
    permissions: [],
    availability: "available",
    online: true,
  };
}
