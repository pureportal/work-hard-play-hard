import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChessMatchView, Member } from "@workhard/shared";
import { ChessGame } from "./ChessGame";

afterEach(cleanup);

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
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));
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
