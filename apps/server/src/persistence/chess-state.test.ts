import {
  GAME_BOT_USER_ID,
  getGameArea,
  type ChessMatchSettings,
  type WorldPlayer,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { createApplication } from "../app.js";
import { ChessMultiplayerRuntime } from "../games/chess-multiplayer.js";
import { DemoStore } from "../store.js";
import { MemoryDatabase } from "./memory-database.js";

const BOT_SETTINGS: ChessMatchSettings = {
  timeControl: "standard",
  pauseWeekends: false,
  access: "locked",
  bot: { difficulty: "hard" },
};
const NOW = new Date("2026-09-06T12:00:00.000Z");

function createChessStore(settings: ChessMatchSettings = BOT_SETTINGS) {
  const store = new DemoStore();
  const runtime = new ChessMultiplayerRuntime(store, () => NOW);
  const object = store.getObject("object-chess")!;
  const player: WorldPlayer = {
    userId: "user-maya",
    floorId: object.floorId,
    ...getGameArea(object),
    connected: true,
    facing: "down",
    availability: "available",
  };
  runtime.syncLobby([player], new Set([player.userId]));
  runtime.create(player.userId, settings);
  return { store, runtime, matchId: store.getChessMatches()[0]!.id };
}

describe("chess state persistence", () => {
  it.each(["active", "completed"] as const)("starts the application with a saved %s bot match", async (status) => {
    const { store, runtime, matchId } = createChessStore();
    if (status === "completed") {
      runtime.resign("user-maya", matchId);
    }
    runtime.stop();
    const database = new MemoryDatabase();
    await database.saveWorkspaceState({ store: store.exportMutableState(), players: [] });

    const context = await createApplication({ database, chessNow: () => NOW });
    try {
      const ready = await context.app.inject("/v1/health/ready");
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: "ready", database: true });
      expect(context.store.getChessMatches()).toEqual(store.getChessMatches());
      expect(context.store.getMember(GAME_BOT_USER_ID)).toBeUndefined();
      if (status === "completed") {
        expect(context.store.getChessMatches()[0]!.outcome).toEqual({
          result: "resignation",
          winnerUserId: GAME_BOT_USER_ID,
        });
      }
    } finally {
      await context.app.close();
    }
  });

  it.each<ChessMatchSettings>([
    { ...BOT_SETTINGS, timeControl: "rapid", bot: { difficulty: "easy" } },
    { ...BOT_SETTINGS, timeControl: "daily", pauseWeekends: true, bot: { difficulty: "medium" } },
    { timeControl: "standard", pauseWeekends: false, access: "open" },
    { timeControl: "standard", pauseWeekends: false, access: "locked", opponentUserId: "user-leo" },
  ])("preserves $timeControl $access matches and their opponent settings", (settings) => {
    const { store, runtime } = createChessStore(settings);
    runtime.stop();
    const restored = new DemoStore();

    restored.restoreMutableState(store.exportMutableState());

    expect(restored.getChessMatches()).toEqual(store.getChessMatches());
  });

  it.each([
    { name: "a missing human creator", changes: { creatorUserId: "missing-user", whiteUserId: "missing-user" } },
    { name: "the bot in the white seat", changes: { creatorUserId: GAME_BOT_USER_ID, whiteUserId: GAME_BOT_USER_ID } },
    { name: "a human in the bot seat", changes: { blackUserId: "user-leo" } },
    { name: "an unknown bot identity", changes: { blackUserId: "unknown-bot" } },
    { name: "a bot match with a reserved human seat", changes: { reservedBlackUserId: "user-leo" } },
    { name: "a bot match with a selected human opponent", changes: { settings: { ...BOT_SETTINGS, opponentUserId: "user-leo" } } },
    { name: "an open bot match", changes: { settings: { ...BOT_SETTINGS, access: "open" } } },
    { name: "an unknown bot difficulty", changes: { settings: { ...BOT_SETTINGS, bot: { difficulty: "invalid" } } } },
    { name: "a null bot configuration", changes: { settings: { ...BOT_SETTINGS, bot: null } } },
    { name: "a bot seat without bot settings", changes: { settings: { timeControl: "standard", pauseWeekends: false, access: "open" } } },
    { name: "a locked human match without a reservation", changes: {
      blackUserId: "user-leo",
      settings: { timeControl: "standard", pauseWeekends: false, access: "locked", opponentUserId: "user-leo" },
    } },
    { name: "an unknown human opponent", changes: {
      blackUserId: "missing-user",
      settings: { timeControl: "standard", pauseWeekends: false, access: "open" },
    } },
  ])("rejects $name without changing the store", ({ changes }) => {
    const { store, runtime } = createChessStore();
    runtime.stop();
    const invalid = store.exportMutableState();
    Object.assign(invalid.chessMatches[0]!, changes);
    const restored = new DemoStore();
    const before = restored.exportMutableState();

    expect(() => restored.restoreMutableState(invalid)).toThrow("CHESS_STATE_INVALID");
    expect(restored.exportMutableState()).toEqual(before);
  });
});
