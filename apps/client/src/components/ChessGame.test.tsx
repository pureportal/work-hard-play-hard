import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessMatchView, Member } from "@workhard/shared";
import { ChessGame } from "./ChessGame";

vi.mock("./Avatar", () => ({ Avatar: () => null }));

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  document.elementFromPoint = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("ChessGame", () => {
  it("orients the board and submits only a selected legal move", () => {
    const onMove = vi.fn();
    const { container, rerender } = render(game(initialMatch(), "user-maya", { onMove }));

    expect(container.querySelector<HTMLElement>(".chess-square")?.dataset.square).toBe("a8");
    fireEvent.click(screen.getByRole("gridcell", { name: "white pawn on e2" }));
    expect(container.querySelector('[data-square="e2"]')?.classList.contains("is-selected")).toBe(true);
    expect(container.querySelector('[data-square="e4"]')?.classList.contains("is-legal")).toBe(true);
    fireEvent.click(screen.getByRole("gridcell", { name: "e4" }));
    expect(onMove).toHaveBeenCalledWith({ from: "e2", to: "e4" });

    rerender(game(initialMatch(), "user-leo", { onMove }));
    expect(container.querySelector<HTMLElement>(".chess-square")?.dataset.square).toBe("h1");
  });

  it("previews and submits a legal drag while preserving click selection", () => {
    const onMove = vi.fn();
    const { container } = render(game(initialMatch(), "user-maya", { onMove }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    const destination = screen.getByRole("gridcell", { name: "e4" });
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 12, clientY: 12 });
    expect(container.querySelector(".chess-square.is-drag-source")).toBeNull();
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    expect(container.querySelector('[data-square="e2"]')?.classList.contains("is-selected")).toBe(true);
    expect(container.querySelector('[data-square="e3"]')?.classList.contains("is-legal")).toBe(true);
    expect(destination.classList.contains("is-preview")).toBe(true);
    expect(destination.getAttribute("aria-label")).toBe("Preview white pawn on e4");
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
    fireEvent.click(pawn);
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: "e2", to: "e4" });
    expect(destination.classList.contains("is-preview")).toBe(false);
    expect(container.querySelector(".chess-square.is-selected")).toBeNull();
  });

  it("leaves the board unchanged after illegal and off-board drops", () => {
    const onMove = vi.fn();
    const { container } = render(game(initialMatch(), "user-maya", { onMove }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    const illegal = screen.getByRole("gridcell", { name: "e5" });

    for (const target of [illegal, null]) {
      document.elementFromPoint = vi.fn(() => target);
      fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
      expect(container.querySelector(".chess-square.is-preview")).toBeNull();
      expect(document.querySelector(".chess-drag-piece")).not.toBeNull();
      fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
      fireEvent.click(pawn);
      expect(container.querySelector(".chess-square.is-selected")).toBeNull();
      expect(screen.getByRole("gridcell", { name: "white pawn on e2" })).toBe(pawn);
      expect(document.querySelector(".chess-drag-piece")).toBeNull();
    }
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does not move when released away from a previously previewed legal square", () => {
    const onMove = vi.fn();
    const { container } = render(game(initialMatch(), "user-maya", { onMove }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    const destination = screen.getByRole("gridcell", { name: "e4" });
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    expect(destination.classList.contains("is-preview")).toBe(true);
    document.elementFromPoint = vi.fn(() => null);
    fireEvent.pointerUp(pawn, { clientX: 80, clientY: 80 });
    expect(onMove).not.toHaveBeenCalled();
    expect(container.querySelector(".chess-square.is-preview")).toBeNull();
    expect(screen.getByRole("gridcell", { name: "white pawn on e2" })).toBe(pawn);
  });

  it("cannot start a drag while waiting for the opponent or a pending move", () => {
    const onMove = vi.fn();
    const { container, rerender } = render(game({ ...initialMatch(), turn: "black" }, "user-maya", { onMove }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    const destination = screen.getByRole("gridcell", { name: "e4" });
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
    expect(container.querySelector(".chess-square.is-preview")).toBeNull();

    rerender(game(initialMatch(), "user-maya", { onMove, pending: true }));
    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
    expect(container.querySelector(".chess-square.is-preview")).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("previews captures and submits a legal drag from the black side", () => {
    const onMove = vi.fn();
    const match = {
      ...initialMatch(),
      turn: "black" as const,
      board: [
        { square: "e7" as const, color: "black" as const, type: "rook" as const },
        { square: "e4" as const, color: "white" as const, type: "knight" as const },
      ],
      legalMoves: [{ from: "e7" as const, to: "e4" as const }],
    };
    const { container } = render(game(match, "user-leo", { onMove }));
    const rook = screen.getByRole("gridcell", { name: "black rook on e7" });
    const destination = screen.getByRole("gridcell", { name: "white knight on e4" });
    expect(container.querySelector<HTMLElement>(".chess-square")?.dataset.square).toBe("h1");
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(rook, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(rook, { clientX: 40, clientY: 40 });
    expect(destination.getAttribute("aria-label")).toBe("Preview black rook on e4");
    expect(destination.querySelectorAll(".chess-piece")).toHaveLength(1);
    fireEvent.pointerUp(rook, { clientX: 40, clientY: 40 });
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: "e7", to: "e4" });
  });

  it("opens promotion choice after a pawn is dropped on its legal promotion square", () => {
    const onMove = vi.fn();
    render(game({
      ...initialMatch(),
      board: [{ square: "b7", color: "white", type: "pawn" }],
      legalMoves: ["queen", "rook", "bishop", "knight"].map((promotion) => ({
        from: "b7" as const,
        to: "b8" as const,
        promotion: promotion as "queen" | "rook" | "bishop" | "knight",
      })),
    }, "user-maya", { onMove }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on b7" });
    const destination = screen.getByRole("gridcell", { name: "b8" });
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Promote to knight" }));
    expect(onMove).toHaveBeenCalledExactlyOnceWith({ from: "b7", to: "b8", promotion: "knight" });
  });

  it("uses claimable moves for drag destinations while claiming a draw", () => {
    const onClaimDraw = vi.fn();
    const onMove = vi.fn();
    const { container } = render(game({
      ...initialMatch(),
      drawClaims: [{ result: "threefold_repetition", move: { from: "e2", to: "e3" } }],
    }, "user-maya", { onClaimDraw, onMove }));
    fireEvent.click(screen.getByRole("button", { name: "Claim draw" }));
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    const destination = screen.getByRole("gridcell", { name: "e3" });
    document.elementFromPoint = vi.fn(() => destination);

    fireEvent.pointerDown(pawn, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pawn, { clientX: 40, clientY: 40 });
    expect(container.querySelector('[data-square="e3"]')?.classList.contains("is-legal")).toBe(true);
    expect(container.querySelector('[data-square="e4"]')?.classList.contains("is-legal")).toBe(false);
    fireEvent.pointerUp(pawn, { clientX: 40, clientY: 40 });
    expect(onClaimDraw).toHaveBeenCalledExactlyOnceWith({ from: "e2", to: "e3" });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("requires a promotion choice", () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    render(game({
      ...initialMatch(),
      board: [
        { square: "b7", color: "white", type: "pawn" },
        { square: "e1", color: "white", type: "king" },
        { square: "e8", color: "black", type: "king" },
      ],
      legalMoves: ["queen", "rook", "bishop", "knight"].map((promotion) => ({
        from: "b7" as const,
        to: "b8" as const,
        promotion: promotion as "queen" | "rook" | "bishop" | "knight",
      })),
    }, "user-maya", { onMove, onClose }));

    fireEvent.click(screen.getByRole("gridcell", { name: "white pawn on b7" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "b8" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Promote to queen" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel promotion" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Choose promotion" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("gridcell", { name: "b8" }));
    fireEvent.click(screen.getByRole("button", { name: "Promote to knight" }));
    expect(onMove).toHaveBeenCalledWith({ from: "b7", to: "b8", promotion: "knight" });
  });

  it("navigates the board with arrow keys and cancels a selection without closing the game", () => {
    const onClose = vi.fn();
    const { container } = render(game(initialMatch(), "user-maya", { onClose }));
    expect(container.querySelectorAll('.chess-square[tabindex="0"]')).toHaveLength(1);
    const pawn = screen.getByRole("gridcell", { name: "white pawn on e2" });
    fireEvent.click(pawn);
    fireEvent.keyDown(pawn, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: "e3" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(container.querySelector(".chess-square.is-selected")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(pawn);
    fireEvent.click(pawn);
    expect(container.querySelector(".chess-square.is-selected")).toBeNull();
  });

  it("handles draw offers, resignation confirmation, and completed results", () => {
    const onRespondToDraw = vi.fn();
    const onResign = vi.fn();
    const { rerender } = render(game({
      ...initialMatch(),
      drawOfferByUserId: "user-leo",
    }, "user-maya", { onRespondToDraw, onResign }));

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onRespondToDraw).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));
    expect(screen.getByText("Resign game?")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Resign game?" })).getByRole("button", { name: "Resign" }));
    expect(onResign).toHaveBeenCalledOnce();

    rerender(game({
      ...initialMatch(),
      status: "completed",
      outcome: { result: "checkmate", winnerUserId: "user-maya" },
      completedAt: "2026-09-04T12:05:00.000Z",
      legalMoves: [],
    }, "user-maya"));
    expect(screen.getByText("You won")).toBeTruthy();
    expect(screen.getByText("Checkmate")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Offer draw" })).toBeNull();
  });

  it("keeps a 24-hour clock at 24h until the first minute elapses", () => {
    render(game({
      ...initialMatch(),
      settings: { timeControl: "daily", pauseWeekends: true, access: "open" },
      clock: {
        whiteRemainingMs: 24 * 60 * 60 * 1_000 - 1,
        blackRemainingMs: 24 * 60 * 60 * 1_000 - 1,
        activeColor: "white",
        running: false,
        pausedForWeekend: true,
      },
    }, "user-maya"));

    expect(screen.getAllByText("24h 00m")).toHaveLength(2);
  });

  it("keeps resignation confirmation open when the turn changes", () => {
    const onResign = vi.fn();
    const { rerender } = render(game(initialMatch(), "user-maya", { onResign }));
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));
    rerender(game({ ...initialMatch(), turn: "black" }, "user-maya", { onResign }));
    expect(screen.getByText("Resign game?")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Resign game?" })).getByRole("button", { name: "Resign" }));
    expect(onResign).toHaveBeenCalledOnce();
  });

  it("claims a draw immediately or with a selected qualifying move", () => {
    const onClaimDraw = vi.fn();
    const onMove = vi.fn();
    const { rerender } = render(game({
      ...initialMatch(),
      drawClaims: [{ result: "threefold_repetition" }],
    }, "user-maya", { onClaimDraw, onMove }));
    fireEvent.click(screen.getByRole("button", { name: "Claim draw" }));
    expect(onClaimDraw).toHaveBeenCalledWith();

    rerender(game({
      ...initialMatch(),
      drawClaims: [{ result: "threefold_repetition", move: { from: "e2", to: "e3" } }],
    }, "user-maya", { onClaimDraw, onMove }));
    fireEvent.click(screen.getByRole("button", { name: "Claim draw" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "white pawn on e2" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "e4" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onClaimDraw).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("gridcell", { name: "white pawn on e2" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "e3" }));
    expect(onClaimDraw).toHaveBeenLastCalledWith({ from: "e2", to: "e3" });
  });
});

function game(
  match: ChessMatchView,
  currentUserId: string,
  overrides: Partial<Parameters<typeof ChessGame>[0]> = {},
) {
  return (
    <ChessGame
      match={match}
      members={members}
      currentUserId={currentUserId}
      onMove={vi.fn()}
      onOfferDraw={vi.fn()}
      onClaimDraw={vi.fn()}
      onRespondToDraw={vi.fn()}
      onResign={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />
  );
}

function initialMatch(): ChessMatchView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    definitionId: "game-chess",
    objectId: "object-chess",
    creatorUserId: "user-maya",
    whiteUserId: "user-maya",
    blackUserId: "user-leo",
    settings: { timeControl: "rapid", pauseWeekends: false, access: "open" },
    status: "active",
    fen: "initial",
    moves: [],
    createdAt: "2026-09-04T12:00:00.000Z",
    updatedAt: "2026-09-04T12:00:00.000Z",
    startedAt: "2026-09-04T12:00:00.000Z",
    board: [
      { square: "e2", color: "white", type: "pawn" },
      { square: "e1", color: "white", type: "king" },
      { square: "e8", color: "black", type: "king" },
    ],
    turn: "white",
    inCheck: false,
    legalMoves: [{ from: "e2", to: "e3" }, { from: "e2", to: "e4" }],
    drawClaims: [],
    clock: {
      whiteRemainingMs: 600_000,
      blackRemainingMs: 600_000,
      activeColor: "white",
      running: true,
      pausedForWeekend: false,
    },
    serverNow: "2026-09-04T12:00:00.000Z",
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
