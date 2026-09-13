import {
  CHESS_DEFINITION_ID,
  MAX_LAYOUT_WALLS_PER_FLOOR,
  FALLING_BLOCKS_DEFINITION_ID,
  type ChessMatchRecord,
} from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { MemoryDatabase } from "./memory-database.js";

describe("database workspace state", () => {
  it("restores Falling Blocks scores and accumulated player statistics", async () => {
    const database = new MemoryDatabase();
    const source = new DemoStore();

    source.recordGameRound("round-solo", FALLING_BLOCKS_DEFINITION_ID, [
      { userId: "user-maya", score: 840, lines: 8, level: 2, order: 1, won: false },
    ]);
    source.recordGameRound("round-multiplayer", FALLING_BLOCKS_DEFINITION_ID, [
      { userId: "user-maya", score: 1_000, lines: 10, level: 2, order: 1, won: true },
      { userId: "user-leo", score: 760, lines: 7, level: 1, order: 2, won: false },
    ]);
    source.purchaseAsset("user-maya", "chair-office", "database-purchase");
    source.updateGameSettings({ allowPlayerAssetPlacementInPublicRooms: true });
    source.updateRegistrationSettings({
      enabled: true,
      invitationRequired: false,
      whitelistedDomains: ["example.com"],
      defaultRole: "guest",
    });
    source.updateCorporateIdentity({
      applicationName: "Acme Spaces",
      primaryColor: "#123abc",
      secondaryColor: "#f28c28",
      authenticationLayout: "centered",
    });

    await database.saveWorkspaceState({ players: [], store: source.exportMutableState() });

    const saved = await database.loadWorkspaceState();
    const restored = new DemoStore();
    restored.restoreMutableState(saved!.store);

    expect(restored.getScores().filter((score) => score.userId === "user-maya")).toEqual(
      source.getScores().filter((score) => score.userId === "user-maya"),
    );
    expect(restored.getGameStatistics().find((statistics) => statistics.userId === "user-maya")).toMatchObject({
      gamesPlayed: 2,
      multiplayerGamesPlayed: 1,
      multiplayerWins: 1,
      highestScore: 1_000,
      highestLines: 10,
      totalScore: 1_840,
      totalLines: 18,
    });
    expect(restored.getPlayerEconomy("user-maya")).toEqual(source.getPlayerEconomy("user-maya"));
    expect(restored.getGameSettings()).toEqual({ allowPlayerAssetPlacementInPublicRooms: true });
    expect(restored.getRegistrationSettings()).toEqual({
      enabled: true,
      invitationRequired: false,
      whitelistedDomains: ["example.com"],
      defaultRole: "guest",
    });
    expect(restored.getCorporateIdentity()).toEqual({
      applicationName: "Acme Spaces",
      primaryColor: "#123abc",
      secondaryColor: "#f28c28",
      authenticationLayout: "centered",
    });
  });

  it("leaves the active store unchanged when restored economy state is invalid", () => {
    const target = new DemoStore();
    const before = target.exportMutableState();
    const invalid = structuredClone(before);
    invalid.economy.accounts[0]!.coinBalance += 1;

    expect(() => target.restoreMutableState(invalid)).toThrow("ECONOMY_STATE_INVALID");
    expect(target.exportMutableState()).toEqual(before);
  });

  it("restores an active chess match", async () => {
    const database = new MemoryDatabase();
    const source = new DemoStore();
    const chessMatch: ChessMatchRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      definitionId: CHESS_DEFINITION_ID,
      objectId: "object-chess",
      creatorUserId: "user-maya",
      whiteUserId: "user-maya",
      blackUserId: "user-leo",
      settings: { timeControl: "rapid", pauseWeekends: false, access: "open" },
      status: "active",
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      moves: [
        {
          from: "e2",
          to: "e4",
          color: "white",
          piece: "pawn",
          san: "e4",
          playedAt: "2026-09-04T12:01:00.000Z",
        },
        {
          from: "e7",
          to: "e5",
          color: "black",
          piece: "pawn",
          san: "e5",
          playedAt: "2026-09-04T12:02:00.000Z",
        },
      ],
      clock: {
        whiteRemainingMs: 540_000,
        blackRemainingMs: 540_000,
        activeSince: "2026-09-04T12:02:00.000Z",
      },
      createdAt: "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:02:00.000Z",
      startedAt: "2026-09-04T12:00:00.000Z",
    };
    source.saveChessMatch(chessMatch);

    await database.saveWorkspaceState({ players: [], store: source.exportMutableState() });
    const saved = await database.loadWorkspaceState();
    const restored = new DemoStore();
    restored.restoreMutableState(saved!.store);

    expect(restored.getChessMatches()).toEqual([chessMatch]);
  });

  it("rejects persisted layouts that exceed the server resource limit", () => {
    const target = new DemoStore();
    const before = target.exportMutableState();
    const invalid = structuredClone(before);
    invalid.layouts[0]!.walls = Array.from({ length: MAX_LAYOUT_WALLS_PER_FLOOR + 1 }, (_, index) => ({
      id: `wall-${index}`,
      start: { x: index * 32, y: 0 },
      end: { x: index * 32, y: 32 },
    }));

    expect(() => target.restoreMutableState(invalid)).toThrow("LAYOUT_CAPACITY_REACHED");
    expect(target.exportMutableState()).toEqual(before);
  });
});
