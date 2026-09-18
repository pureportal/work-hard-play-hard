import { describe, expect, it } from "vitest";
import type { FloorLayout, WorldObject } from "@workhard/shared";
import { EconomyStore } from "./economy-store.js";

const firstDay = new Date("2026-09-01T12:00:00.000Z");
const secondDay = new Date("2026-09-02T12:00:00.000Z");

describe("EconomyStore", () => {
  it("grants one server-timed daily bonus and advances consecutive streaks", () => {
    const economy = new EconomyStore(["player"], firstDay);

    const first = economy.claimDailyReward("player", "claim-one", firstDay);
    const replay = economy.claimDailyReward("player", "claim-one", firstDay);

    expect(first.transaction.amount).toBe(10);
    expect(first.economy).toMatchObject({ coinBalance: 260, dailyReward: { claimable: false, streak: 1 } });
    expect(replay.replayed).toBe(true);
    expect(replay.economy.coinBalance).toBe(260);
    expect(() => economy.claimDailyReward("player", "claim-again", firstDay)).toThrow("DAILY_REWARD_ALREADY_CLAIMED");

    const second = economy.claimDailyReward("player", "claim-two", secondDay);
    expect(second.transaction.amount).toBe(15);
    expect(second.economy).toMatchObject({ coinBalance: 275, dailyReward: { streak: 2 } });

    const afterMissedDay = new Date("2026-09-04T12:00:00.000Z");
    expect(economy.getPlayerEconomy("player", afterMissedDay).dailyReward).toMatchObject({
      claimable: true,
      streak: 0,
      amount: 10,
    });
    expect(economy.claimDailyReward("player", "claim-after-gap", afterMissedDay).economy.dailyReward.streak).toBe(1);
  });

  it("does not reopen daily rewards when server time moves backward", () => {
    const economy = new EconomyStore(["player"], firstDay);
    economy.claimDailyReward("player", "future-claim", secondDay);

    expect(economy.getPlayerEconomy("player", firstDay).dailyReward).toMatchObject({
      claimable: false,
      streak: 1,
      nextClaimAt: "2026-09-03T00:00:00.000Z",
    });
    expect(() => economy.claimDailyReward("player", "backdated-claim", firstDay)).toThrow(
      "DAILY_REWARD_ALREADY_CLAIMED",
    );
  });

  it("atomically purchases distinct inventory instances at catalog prices", () => {
    const economy = new EconomyStore(["player"], firstDay);

    const purchase = economy.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);
    const replay = economy.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);

    expect(purchase.transaction.amount).toBe(-70);
    expect(purchase.economy).toMatchObject({ coinBalance: 180, lifetimeSpent: 70 });
    expect(purchase.economy.inventory).toHaveLength(6);
    expect(replay.replayed).toBe(true);
    expect(replay.economy.inventory).toEqual(purchase.economy.inventory);
    expect(() => economy.purchaseAsset("player", "plant-floor", "purchase-chair", firstDay)).toThrow(
      "ECONOMY_REQUEST_CONFLICT",
    );
    expect(() => economy.purchaseAsset("player", "outdoor-pool", "purchase-pool", firstDay)).toThrow("INSUFFICIENT_COINS");
    expect(() => economy.purchaseAsset("player", "equipment-falling-blocks", "purchase-game", firstDay)).toThrow("ASSET_UNAVAILABLE");
    expect(economy.getPlayerEconomy("player", firstDay).coinBalance).toBe(180);
  });

  it("caps server-scored game rewards per UTC day", () => {
    const economy = new EconomyStore(["player"], firstDay);

    const first = economy.rewardGame("player", "round-one", 20, false, firstDay);
    const second = economy.rewardGame("player", "round-two", 20, true, firstDay);
    const third = economy.rewardGame("player", "round-three", 20, true, firstDay);

    expect([first.amount, second.amount, third.amount]).toEqual([80, 20, 0]);
    expect(economy.getPlayerEconomy("player", firstDay)).toMatchObject({
      coinBalance: 350,
      lifetimeEarned: 350,
    });
  });

  it("links one owned instance to one world object and releases it when removed", () => {
    const economy = new EconomyStore(["player"], firstDay);
    const purchase = economy.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);
    const ownedAssetId = purchase.transaction.ownedAssetId!;
    const previous = layout([]);
    const object: WorldObject = {
      id: "4b9d02be-d85e-4c50-9eef-098cc2533ae2",
      floorId: "floor",
      assetId: "chair-office",
      x: 32,
      y: 32,
      rotation: 0,
      variantId: "white",
      ownerUserId: "player",
      ownedAssetId,
    };

    expect(economy.reconcileLayout(previous, layout([object]), [], firstDay)).toEqual(["player"]);
    expect(economy.getOwnedAsset("player", ownedAssetId).placement).toMatchObject({ objectId: object.id, floorId: "floor" });

    expect(() => economy.reconcileLayout(
      layout([object]),
      layout([object, { ...object, id: "f545c37d-21f8-4d65-894e-cbf5b9c4fd2b" }]),
      [],
      firstDay,
    )).toThrow("ASSET_OWNERSHIP_INVALID");

    expect(economy.reconcileLayout(layout([object]), layout([]), [], secondDay)).toEqual(["player"]);
    expect(economy.getOwnedAsset("player", ownedAssetId).placement).toBeUndefined();
  });

  it("restores balances, inventory, ledger receipts, and global settings", () => {
    const source = new EconomyStore(["player"], firstDay);
    source.claimDailyReward("player", "claim-daily", firstDay);
    source.purchaseAsset("player", "plant-floor", "purchase-plant", firstDay);
    source.updateGameSettings({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });

    const restored = new EconomyStore([]);
    restored.restoreState(source.exportState());

    expect(restored.getPlayerEconomy("player", firstDay)).toEqual(source.getPlayerEconomy("player", firstDay));
    expect(restored.getGameSettings()).toEqual({ roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } });
    expect(restored.purchaseAsset("player", "plant-floor", "purchase-plant", firstDay).replayed).toBe(true);
  });

  it("rejects persisted balances that do not match the transaction ledger", () => {
    const source = new EconomyStore(["player"], firstDay);
    source.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);
    const corrupted = source.exportState();
    corrupted.accounts[0]!.coinBalance += 1;

    expect(() => new EconomyStore([]).restoreState(corrupted)).toThrow("ECONOMY_STATE_INVALID");
  });

  it("rejects ledger entries that do not match authoritative economy rules", () => {
    const purchased = new EconomyStore(["player"], firstDay);
    purchased.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);
    const invalidPrice = purchased.exportState();
    const purchase = invalidPrice.transactions.find((transaction) => transaction.operationKey === "purchase-chair")!;
    purchase.amount = -1;
    purchase.balanceAfter = 249;
    invalidPrice.accounts[0]!.coinBalance = 249;
    invalidPrice.accounts[0]!.lifetimeSpent = 1;

    expect(() => new EconomyStore([]).restoreState(invalidPrice)).toThrow("ECONOMY_STATE_INVALID");

    const claimed = new EconomyStore(["player"], firstDay);
    claimed.claimDailyReward("player", "claim-one", firstDay);
    const invalidStreak = claimed.exportState();
    invalidStreak.accounts[0]!.dailyReward.streak = 7;

    expect(() => new EconomyStore([]).restoreState(invalidStreak)).toThrow("ECONOMY_STATE_INVALID");

    const rewarded = new EconomyStore(["player"], firstDay);
    rewarded.rewardGame("player", "round-one", 4, false, firstDay);
    const invalidReward = rewarded.exportState();
    const gameReward = invalidReward.transactions.find((transaction) => transaction.kind === "game_reward")!;
    gameReward.amount += 1;
    gameReward.balanceAfter += 1;
    invalidReward.accounts[0]!.coinBalance += 1;
    invalidReward.accounts[0]!.lifetimeEarned += 1;

    expect(() => new EconomyStore([]).restoreState(invalidReward)).toThrow("ECONOMY_STATE_INVALID");

    const duplicateReward = rewarded.exportState();
    const receipt = duplicateReward.transactions.find((transaction) => transaction.kind === "game_reward")!;
    duplicateReward.transactions.push({ ...receipt, id: "duplicate-reward", balanceAfter: receipt.balanceAfter + receipt.amount });
    duplicateReward.accounts[0]!.coinBalance += receipt.amount;
    duplicateReward.accounts[0]!.lifetimeEarned += receipt.amount;

    expect(() => new EconomyStore([]).restoreState(duplicateReward)).toThrow("ECONOMY_STATE_INVALID");
  });

  it("validates restored member accounts and placed inventory links", () => {
    const source = new EconomyStore(["player"], firstDay);
    const purchase = source.purchaseAsset("player", "chair-office", "purchase-chair", firstDay);
    const object: WorldObject = {
      id: "4b9d02be-d85e-4c50-9eef-098cc2533ae2",
      floorId: "floor",
      assetId: "chair-office",
      x: 32,
      y: 32,
      rotation: 0,
      variantId: "white",
      ownerUserId: "player",
      ownedAssetId: purchase.transaction.ownedAssetId!,
    };
    source.reconcileLayout(layout([]), layout([object]), [], firstDay);
    const restored = new EconomyStore([]);
    restored.restoreState(source.exportState());

    expect(() => restored.validateWorkspace(["player"], [layout([object])], [])).not.toThrow();
    expect(() => restored.validateWorkspace(["someone-else"], [layout([object])], [])).toThrow("ECONOMY_STATE_INVALID");
    expect(() => restored.validateWorkspace(["player"], [layout([{ ...object, id: "wrong-object" }])], [])).toThrow("ECONOMY_STATE_INVALID");
  });

  it("requires every game reward to match a server-recorded score", () => {
    const economy = new EconomyStore(["player"], firstDay);
    economy.rewardGame("player", "round-one", 4, false, firstDay);

    expect(() => economy.validateWorkspace(["player"], [layout([])], [])).toThrow("ECONOMY_STATE_INVALID");
    expect(() => economy.validateWorkspace(["player"], [layout([])], [{
      id: "score-one",
      roundId: "round-one",
      definitionId: "game-falling-blocks",
      userId: "player",
      score: 400,
      lines: 4,
      level: 1,
      mode: "solo",
      playerCount: 1,
      placement: 1,
      won: false,
      playedAt: firstDay.toISOString(),
    }])).not.toThrow();
  });

  it("rejects invalid server game results before changing the ledger", () => {
    const economy = new EconomyStore(["player"], firstDay);
    const before = economy.exportState();

    expect(() => economy.rewardGame("player", "round", 1.5, false, firstDay)).toThrow("GAME_REWARD_INVALID");
    expect(() => economy.rewardGame("player", "round", 1, false, new Date("invalid"))).toThrow("ECONOMY_TIME_INVALID");
    expect(economy.exportState()).toEqual(before);
  });

  it("does not partially reward a multiplayer round when one payout is invalid", () => {
    const economy = new EconomyStore(["player"], firstDay);
    const before = economy.exportState();

    expect(() => economy.rewardGames([
      { userId: "player", roundId: "round", lines: 5, won: true },
      { userId: "missing", roundId: "round", lines: 4, won: false },
    ], firstDay)).toThrow("USER_NOT_FOUND");
    expect(economy.exportState()).toEqual(before);
  });
});

function layout(objects: WorldObject[]): FloorLayout {
  return {
    floorId: "floor",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects,
    rooms: [],
  };
}
