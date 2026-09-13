import { GAME_BOT_USER_ID, getGameArea, TIC_TAC_TOE_VARIANTS, type ChessMoveInput, type WorldPlayer } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { DemoStore } from "../store.js";
import { ChessMultiplayerRuntime } from "./chess-multiplayer.js";
import { TicTacToeMultiplayerRuntime } from "./tic-tac-toe-multiplayer.js";
import { FallingBlocksMultiplayerRuntime } from "./falling-blocks-multiplayer.js";

function playerAt(store: DemoStore, objectId: string, userId = "user-maya"): WorldPlayer {
  const object = store.getObject(objectId)!;
  return { userId, floorId: object.floorId, ...getGameArea(object), connected: true, facing: "down", availability: "available" };
}

describe("bot matches", () => {
  it.each(TIC_TAC_TOE_VARIANTS)("plays $name solo and leaves nearby players in the lobby", ({ id }) => {
    const store = new DemoStore();
    const game = new TicTacToeMultiplayerRuntime(store);
    const players = [playerAt(store, "object-tic-tac-toe"), playerAt(store, "object-tic-tac-toe", "user-leo")];
    game.syncLobbies(players, new Set(players.map((player) => player.userId)));
    const started = game.start("user-maya", id, { difficulty: "hard" });
    expect(started.participantIds).toEqual(["user-maya"]);
    expect(game.isPlaying("user-leo")).toBe(false);
    expect(game.isPlaying(GAME_BOT_USER_ID)).toBe(false);
    game.command("user-maya", id === "classic" ? { kind: "classic.place", cell: 0 }
      : id === "ultimate" ? { kind: "ultimate.place", board: 0, cell: 0 }
        : { kind: "stacking.place", cell: 0, size: "small" });
    expect(game.update(100)).toEqual([]);
    expect(game.update(300)).toContainEqual(expect.objectContaining({ event: expect.objectContaining({
      type: "game.state", moveNumber: 2, turnUserId: "user-maya", bot: { difficulty: "hard" },
    }) }));
    game.leave("user-maya");
    expect(game.update(1000)).toEqual([]);
    expect(store.getScores()).not.toEqual(expect.arrayContaining([expect.objectContaining({ userId: GAME_BOT_USER_ID })]));
  });

  it("starts independent bot rounds for both nearby players", () => {
    const store = new DemoStore();
    const game = new TicTacToeMultiplayerRuntime(store);
    const players = [playerAt(store, "object-tic-tac-toe"), playerAt(store, "object-tic-tac-toe", "user-leo")];
    game.syncLobbies(players, new Set(players.map((player) => player.userId)));
    game.start("user-maya", "classic", { difficulty: "easy" });
    game.start("user-leo", "ultimate", { difficulty: "hard" });
    game.leave("user-maya");
    expect(game.isPlaying("user-leo")).toBe(true);
  });

  it("starts Falling Blocks solo without starting a nearby player", () => {
    const store = new DemoStore();
    const game = new FallingBlocksMultiplayerRuntime(store);
    const players = [playerAt(store, "object-falling-blocks"), playerAt(store, "object-falling-blocks", "user-leo")];
    game.syncLobbies(players, new Set(players.map((player) => player.userId)));
    expect(game.start("user-maya", "object-falling-blocks", true).participantIds).toEqual(["user-maya"]);
    expect(game.isPlaying("user-leo")).toBe(false);
    expect(game.getSessionEvents("user-leo")).toContainEqual(expect.objectContaining({ type: "game.lobby_updated" }));
  });

  it("persists chess bot replies and resumes after restoring the store", async () => {
    const store = new DemoStore();
    const search = vi.fn().mockResolvedValue({ from: "e7", to: "e5" });
    const runtime = new ChessMultiplayerRuntime(store, undefined, search);
    runtime.syncLobby([playerAt(store, "object-chess")], new Set(["user-maya"]));
    runtime.create("user-maya", { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "medium" } });
    const match = store.getChessMatches()[0]!;
    runtime.move("user-maya", match.id, { from: "e2", to: "e4" });
    runtime.stop();
    const restoredStore = new DemoStore();
    restoredStore.restoreMutableState(store.exportMutableState());
    const restored = new ChessMultiplayerRuntime(restoredStore, undefined, search);
    restored.update();
    await vi.waitFor(() => expect(restoredStore.getChessMatches()[0]!.moves).toHaveLength(2));
    expect(restoredStore.getChessMatches()[0]!.moves[1]!.san).toBe("e5");
    expect(search).toHaveBeenCalledOnce();
    restored.stop();
  });

  it("discards a late chess bot move after resignation", async () => {
    let resolve!: (move: ChessMoveInput) => void;
    const search = vi.fn(() => new Promise<ChessMoveInput>((done) => { resolve = done; }));
    const store = new DemoStore();
    const runtime = new ChessMultiplayerRuntime(store, undefined, search);
    runtime.syncLobby([playerAt(store, "object-chess")], new Set(["user-maya"]));
    runtime.create("user-maya", { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "hard" } });
    const match = store.getChessMatches()[0]!;
    runtime.move("user-maya", match.id, { from: "e2", to: "e4" });
    runtime.update();
    runtime.resign("user-maya", match.id);
    resolve({ from: "e7", to: "e5" });
    await Promise.resolve();
    expect(store.getChessMatches()[0]!.moves).toHaveLength(1);
    runtime.stop();
  });

  it("surfaces engine failure and allows a deliberate retry", async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error("engine stopped")).mockResolvedValue({ from: "e7", to: "e5" });
    const store = new DemoStore();
    const runtime = new ChessMultiplayerRuntime(store, undefined, search);
    runtime.syncLobby([playerAt(store, "object-chess")], new Set(["user-maya"]));
    runtime.create("user-maya", { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "easy" } });
    const match = store.getChessMatches()[0]!;
    runtime.move("user-maya", match.id, { from: "e2", to: "e4" });
    runtime.update();
    await vi.waitFor(() => expect(runtime.update()).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({ type: "chess.match_state", match: expect.objectContaining({ botError: expect.any(String) }) }),
    })));
    runtime.update();
    expect(search).toHaveBeenCalledOnce();
    runtime.open("user-maya", match.id);
    runtime.update();
    await vi.waitFor(() => expect(store.getChessMatches()[0]!.moves).toHaveLength(2));
    runtime.stop();
  });
});
