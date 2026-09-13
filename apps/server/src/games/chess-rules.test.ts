import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { availableDrawClaims, canPossiblyMate, drawClaimResult, outcomeAfterMove } from "./chess-rules.js";

describe("chess adjudication", () => {
  it("allows claims on the intended move and automatically ends fivefold repetition", () => {
    const chess = new Chess();
    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1"]) {
      chess.move(move);
    }
    const before = chess.fen();
    expect(availableDrawClaims(chess)).toContainEqual({
      result: "threefold_repetition",
      move: { from: "f6", to: "g8" },
    });
    expect(chess.fen()).toBe(before);
    chess.move("Ng8");
    expect(availableDrawClaims(chess)).toEqual([{ result: "threefold_repetition" }]);
    expect(outcomeAfterMove(chess, "black")).toBeUndefined();
    for (const move of ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"]) {
      chess.move(move);
    }
    expect(outcomeAfterMove(chess, "black")).toEqual({ result: "fivefold_repetition" });
  });

  it("distinguishes fifty-move claims from the automatic 75-move draw", () => {
    const chess = new Chess("8/8/8/8/8/5k2/8/R6K w - - 99 60");
    expect(availableDrawClaims(chess)).toContainEqual({ result: "fifty_move_rule", move: { from: "a1", to: "a2" } });
    chess.move("Ra2");
    expect(drawClaimResult(chess)).toBe("fifty_move_rule");
    expect(outcomeAfterMove(chess, "white")).toBeUndefined();
    const automatic = new Chess("8/8/8/8/8/5k2/8/R6K w - - 149 85");
    automatic.move("Ra2");
    expect(outcomeAfterMove(automatic, "white")).toEqual({ result: "seventy_five_move_rule" });
    const mate = new Chess("7k/5K2/6Q1/8/8/8/8/8 w - - 149 85");
    mate.move("Qg7#");
    expect(outcomeAfterMove(mate, "white")).toEqual({ result: "checkmate", winnerUserId: "white" });
    expect(drawClaimResult(mate)).toBeUndefined();
  });

  it.each([
    ["7k/5K2/6Q1/8/8/8/8/8 b - - 0 1", "stalemate"],
    ["7k/8/8/8/8/8/8/K7 w - - 0 1", "insufficient_material"],
    ["7k/8/8/8/8/8/8/KN6 w - - 0 1", "insufficient_material"],
    ["7k/8/8/8/8/8/8/KB6 w - - 0 1", "insufficient_material"],
  ])("adjudicates %s as %s", (fen, result) => {
    expect(outcomeAfterMove(new Chess(fen), "white")).toEqual({ result });
  });

  it.each([
    ["7k/8/8/8/8/8/8/K6R w - - 0 1", false],
    ["6nk/8/8/8/8/8/8/K7 w - - 0 1", false],
    ["6nk/8/8/8/8/8/8/K6R w - - 0 1", true],
    ["6nk/8/8/8/8/8/8/K6Q w - - 0 1", false],
    ["5nnk/8/8/8/8/8/8/K7 w - - 0 1", true],
    ["5b1k/8/8/8/8/8/8/K6R w - - 0 1", false],
    ["5b1k/8/8/8/8/8/P7/K7 w - - 0 1", true],
  ])("checks possible mating material in %s", (fen, possible) => {
    expect(canPossiblyMate(new Chess(fen), "b")).toBe(possible);
  });
});
