import { MAX_LAYOUT_WALLS_PER_FLOOR, TETRIS_DEFINITION_ID } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { MemoryDatabase } from "./memory-database.js";

describe("database workspace state", () => {
  it("restores Tetris scores and accumulated player statistics", async () => {
    const database = new MemoryDatabase();
    const source = new DemoStore();

    source.recordGameRound("round-solo", TETRIS_DEFINITION_ID, [
      { userId: "user-maya", score: 840, lines: 8, level: 2, order: 1 },
    ]);
    source.recordGameRound("round-multiplayer", TETRIS_DEFINITION_ID, [
      { userId: "user-maya", score: 1_000, lines: 10, level: 2, order: 1 },
      { userId: "user-leo", score: 760, lines: 7, level: 1, order: 2 },
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
