import { BOT_DIFFICULTIES, TIC_TAC_TOE_VARIANTS } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { chooseTicTacToeMove, legalTicTacToeCommands } from "./bot.js";
import { TicTacToeGame } from "./game.js";

describe("Tic-Tac-Toe bot", () => {
  it.each(TIC_TAC_TOE_VARIANTS)("makes legal moves in $name at every difficulty without changing its input", ({ id }) => {
    for (const difficulty of BOT_DIFFICULTIES) {
      const game = new TicTacToeGame("round", id, ["human", "bot"]);
      for (let turn = 0; turn < 6 && !game.completed; turn += 1) {
        const before = game.state;
        const move = chooseTicTacToeMove(game, difficulty, () => 0.5);
        expect(game.state).toEqual(before);
        expect(game.command(before.turnUserId!, move)).toBe(true);
      }
    }
  });

  it("cannot lose Classic on Hard against any human continuation", () => {
    const seen = new Set<string>();
    const visit = (game: TicTacToeGame) => {
      const state = game.state;
      expect(state.winnerUserId).not.toBe("human");
      if (game.completed) return;
      const key = JSON.stringify(state);
      if (seen.has(key)) return;
      seen.add(key);
      if (state.turnUserId === "bot") {
        const next = game.clone();
        next.command("bot", chooseTicTacToeMove(game, "hard"));
        visit(next);
      } else {
        for (const move of legalTicTacToeCommands(state)) {
          const next = game.clone();
          next.command("human", move);
          visit(next);
        }
      }
    };
    visit(new TicTacToeGame("round", "classic", ["human", "bot"]));
    visit(new TicTacToeGame("round", "classic", ["bot", "human"]));
  }, 15_000);

  it("takes an immediate win and blocks an immediate loss", () => {
    const game = new TicTacToeGame("round", "classic", ["human", "bot"]);
    game.command("human", { kind: "classic.place", cell: 0 });
    game.command("bot", { kind: "classic.place", cell: 4 });
    game.command("human", { kind: "classic.place", cell: 1 });
    expect(chooseTicTacToeMove(game, "medium")).toEqual({ kind: "classic.place", cell: 2 });
    game.command("bot", { kind: "classic.place", cell: 2 });
    game.command("human", { kind: "classic.place", cell: 3 });
    expect(chooseTicTacToeMove(game, "hard")).toEqual({ kind: "classic.place", cell: 6 });
  });
});
