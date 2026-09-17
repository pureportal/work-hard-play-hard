import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FALLING_BLOCKS_SETTINGS,
  FALLING_BLOCKS_DEFINITION_ID,
  FALLING_BLOCKS_MODES,
  TIC_TAC_TOE_DEFINITION_ID,
  TIC_TAC_TOE_VARIANTS,
  getGameArea,
  type WorldPlayer,
} from "@workhard/shared";
import { WorkspaceStore } from "../store.js";
import { createTestData } from "../testing/workspace-data.js";
import { ChessMultiplayerRuntime } from "./chess-multiplayer.js";
import { GamesRuntime } from "./games-runtime.js";

afterEach(() => vi.useRealTimers());

describe("shared game rewards", () => {
  it("does not award coins for chess checkmate or repeatable resignations", () => {
    const store = new WorkspaceStore(createTestData());
    const chess = new ChessMultiplayerRuntime(store);
    const before = store.exportMutableState().economy;
    chess.syncLobby(playersAt(store, "object-chess"), new Set(["user-maya", "user-leo"]));
    for (let index = 0; index < 3; index++) {
      chess.create("user-maya", { timeControl: "standard", pauseWeekends: false, access: "open" });
      const match = store.getChessMatches().find((entry) => entry.status === "waiting")!;
      chess.join("user-leo", match.id);
      if (index === 0) {
        chess.move("user-maya", match.id, { from: "f2", to: "f3" });
        chess.move("user-leo", match.id, { from: "e7", to: "e5" });
        chess.move("user-maya", match.id, { from: "g2", to: "g4" });
        chess.move("user-leo", match.id, { from: "d8", to: "h4" });
      } else {
        chess.resign("user-maya", match.id);
      }
      expect(store.getChessMatches().find((entry) => entry.id === match.id)?.status).toBe("completed");
    }
    expect(store.exportMutableState().economy).toEqual(before);
    chess.stop();
  });

  it.each(TIC_TAC_TOE_VARIANTS)("shares the cap between Falling Blocks and $name, including forfeits and reconnection", ({ id }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T23:59:59.000Z"));
    const store = new WorkspaceStore(createTestData());
    const games = new GamesRuntime(store);
    const before = store.getPlayerEconomy("user-maya").coinBalance;

    games.syncLobbies(playersAt(store, "object-falling-blocks"), new Set(["user-maya", "user-leo"]));
    games.start("user-maya", FALLING_BLOCKS_DEFINITION_ID, undefined, { objectId: "object-falling-blocks", solo: true });
    expect(games.leave("user-maya")).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({ type: "game.round_completed", coinRewards: [{ userId: "user-maya", amount: 20 }] }),
    }));

    for (const amount of [60, 20, 0]) {
      games.syncLobbies(playersAt(store, "object-tic-tac-toe"), new Set(["user-maya", "user-leo"]));
      games.start("user-maya", TIC_TAC_TOE_DEFINITION_ID, id, { objectId: "object-tic-tac-toe" });
      const roundId = games.getRoundId("user-leo")!;
      expect(games.end("user-leo", roundId)).toContainEqual(expect.objectContaining({
        event: expect.objectContaining({ type: "game.round_completed", coinRewards: expect.arrayContaining([{ userId: "user-maya", amount }]) }),
      }));
      expect(games.end("user-leo", roundId)).toEqual([]);
    }
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(before + 100);
    expect(store.getPlayerEconomy("user-leo").coinBalance).toBe(before + 60);

    const restored = new WorkspaceStore(createTestData());
    restored.restoreMutableState(store.exportMutableState());
    const reconnected = new GamesRuntime(restored);
    for (const [now, amount] of [["2026-09-01T23:59:59.999Z", 0], ["2026-09-02T00:00:00.000Z", 20]] as const) {
      vi.setSystemTime(new Date(now));
      reconnected.syncLobbies(playersAt(restored, "object-falling-blocks"), new Set(["user-maya", "user-leo"]));
      reconnected.start("user-maya", FALLING_BLOCKS_DEFINITION_ID, undefined, { objectId: "object-falling-blocks", solo: true });
      expect(reconnected.leave("user-maya")).toContainEqual(expect.objectContaining({
        event: expect.objectContaining({ type: "game.round_completed", coinRewards: [{ userId: "user-maya", amount }] }),
      }));
    }
    expect(restored.getPlayerEconomy("user-maya").coinBalance).toBe(before + 120);
  });

  it.each(FALLING_BLOCKS_MODES)("caps rapid solo and multiplayer completions in %s across cabinets", (mode) => {
    const store = new WorkspaceStore(createTestData());
    const original = store.getObject("object-falling-blocks")!;
    store.getLayout(original.floorId)!.objects.push({ ...original, id: "other-cabinet", x: original.x - 300 });
    const games = new GamesRuntime(store);
    const before = store.getPlayerEconomy("user-maya").coinBalance;
    for (let index = 0; index < 12; index++) {
      const objectId = index % 2 ? "other-cabinet" : original.id;
      games.syncLobbies(playersAt(store, objectId), new Set(["user-maya", "user-leo"]));
      games.start("user-maya", FALLING_BLOCKS_DEFINITION_ID, undefined, {
        objectId, solo: index % 2 === 0, settings: { ...DEFAULT_FALLING_BLOCKS_SETTINGS, mode },
      });
      games.leave("user-maya");
      games.leave("user-leo");
    }
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(before + 100);
    expect(store.getPlayerEconomy("user-leo").coinBalance).toBe(before + 100);
  });

  it.each(TIC_TAC_TOE_VARIANTS)("gives no coins for repeatable $name bot matches", ({ id }) => {
    const store = new WorkspaceStore(createTestData());
    const games = new GamesRuntime(store);
    const before = store.getPlayerEconomy("user-maya").coinBalance;
    for (let index = 0; index < 6; index++) {
      games.syncLobbies(playersAt(store, "object-tic-tac-toe"), new Set(["user-maya", "user-leo"]));
      games.start("user-maya", TIC_TAC_TOE_DEFINITION_ID, id, { objectId: "object-tic-tac-toe", bot: { difficulty: "easy" } });
      expect(games.leave("user-maya")).toContainEqual(expect.objectContaining({
        event: expect.objectContaining({ type: "game.round_completed", coinRewards: [] }),
      }));
    }
    expect(store.getPlayerEconomy("user-maya").coinBalance).toBe(before);
  });
});

function playersAt(store: WorkspaceStore, objectId: string): WorldPlayer[] {
  const object = store.getObject(objectId)!;
  const { x, y } = getGameArea(object);
  return ["user-maya", "user-leo"].map((userId) => ({
    userId, floorId: object.floorId, x, y, facing: "down", availability: "available", connected: true,
  }));
}
