import { describe, expect, it } from "vitest";
import { GAME_REWARD_DAILY_CAP, WELCOME_COIN_REWARD } from "@workhard/shared";
import { EconomyStore } from "./economy-store.js";

const firstDay = new Date("2026-09-01T12:00:00.000Z");
const secondDay = new Date("2026-09-02T00:00:00.000Z");

describe("coin reward limits", () => {
  it("grants starting money once per account", () => {
    const economy = new EconomyStore(["player", "player"], firstDay);
    economy.createAccount("player", secondDay);
    expect(economy.getPlayerEconomy("player", secondDay)).toMatchObject({
      coinBalance: 250,
      lifetimeEarned: 250,
    });
    expect(economy.getPlayerEconomy("player", secondDay).recentTransactions.filter((transaction) => transaction.kind === "welcome"))
      .toEqual([expect.objectContaining({ kind: "welcome", amount: 250 })]);
  });

  it("limits consecutive daily bonuses to the published schedule, separately from games", () => {
    const economy = new EconomyStore(["player"], firstDay);
    const amounts = [10, 15, 20, 25, 30, 35, 50, 50, 50];
    for (const [index, amount] of amounts.entries()) {
      const now = new Date(firstDay.getTime() + index * 86_400_000);
      expect(economy.rewardGame("player", `round-${index}`, 20, true, now).amount).toBe(100);
      expect(economy.claimDailyReward("player", `claim-${index}`, now).transaction.amount).toBe(amount);
      expect(() => economy.claimDailyReward("player", `duplicate-${index}`, now)).toThrow("DAILY_REWARD_ALREADY_CLAIMED");
      expect(economy.rewardGame("player", `extra-${index}`, 20, true, now).amount).toBe(0);
    }
    expect(economy.getPlayerEconomy("player").coinBalance).toBe(250 + 900 + 285);
  });

  it("resets both rewards at UTC midnight, including adjacent claims and month rollover", () => {
    const beforeLocalMidnight = new Date("2026-09-30T23:59:59+02:00");
    const localMidnight = new Date("2026-10-01T00:00:00+02:00");
    const beforeUtcMidnight = new Date("2026-09-30T23:59:59.999Z");
    const utcMidnight = new Date("2026-10-01T00:00:00.000Z");
    const economy = new EconomyStore(["player"], beforeLocalMidnight);
    economy.rewardGame("player", "first", 20, true, beforeLocalMidnight);
    expect(economy.rewardGame("player", "local-midnight", 20, true, localMidnight).amount).toBe(0);
    expect(economy.rewardGame("player", "before-midnight", 20, true, beforeUtcMidnight).amount).toBe(0);
    expect(economy.claimDailyReward("player", "claim-before", beforeUtcMidnight).transaction.amount).toBe(10);
    expect(economy.getPlayerEconomy("player", beforeUtcMidnight).dailyReward.nextClaimAt).toBe(utcMidnight.toISOString());
    expect(economy.rewardGame("player", "midnight", 20, true, utcMidnight).amount).toBe(100);
    expect(economy.claimDailyReward("player", "claim-after", utcMidnight).transaction.amount).toBe(15);
    expect(economy.rewardGame("player", "backdated", 20, true, beforeUtcMidnight).amount).toBe(0);
    expect(economy.rewardGame("player", "extra", 20, true, utcMidnight).amount).toBe(0);
  });

  it("keeps cap usage and paid or zero-value round receipts across restores and new days", () => {
    const source = new EconomyStore(["player"], firstDay);
    expect(source.rewardGame("player", "first", 5, false, firstDay).amount).toBe(35);
    const restored = new EconomyStore([]);
    restored.restoreState(source.exportState());
    expect(restored.rewardGame("player", "second", 20, true, firstDay).amount).toBe(65);
    expect(restored.rewardGame("player", "capped", 0, false, firstDay).amount).toBe(0);
    const reloaded = new EconomyStore([]);
    reloaded.restoreState(restored.exportState());
    const beforeReplay = reloaded.exportState();
    expect(reloaded.rewardGame("player", "first", 5, false, secondDay).amount).toBe(35);
    expect(reloaded.rewardGame("player", "capped", 0, false, secondDay).amount).toBe(0);
    expect(reloaded.exportState()).toEqual(beforeReplay);
    expect(() => reloaded.rewardGame("player", "first", 20, true, secondDay)).toThrow("ECONOMY_REQUEST_CONFLICT");
    expect(reloaded.rewardGame("player", "new-day", 20, true, secondDay).amount).toBe(100);
    expect(reloaded.getPlayerEconomy("player", secondDay).coinBalance).toBe(450);
  });

  it("caps each participant independently and rejects duplicate participants atomically", () => {
    const economy = new EconomyStore(["alice", "bob"], firstDay);
    economy.rewardGame("alice", "solo", 20, false, firstDay);
    const result = economy.rewardGames([
      { userId: "alice", roundId: "multiplayer", lines: 20, won: true },
      { userId: "bob", roundId: "multiplayer", lines: 20, won: false },
    ], firstDay);
    expect(result.map(({ amount }) => amount)).toEqual([20, 80]);
    const before = economy.exportState();
    expect(() => economy.rewardGames([
      { userId: "bob", roundId: "duplicate", lines: 0, won: false },
      { userId: "bob", roundId: "duplicate", lines: 0, won: false },
    ], firstDay)).toThrow("GAME_REWARD_INVALID");
    expect(economy.exportState()).toEqual(before);
    expect(economy.rewardGame("bob", "last", 20, true, firstDay).amount).toBe(20);
  });

  it("does not reopen the game allowance when coins are spent or items are sold", () => {
    const economy = new EconomyStore(["player"], firstDay);
    economy.rewardGame("player", "maximum", 20, true, firstDay);
    const ownedAssetId = economy.purchaseAsset("player", "chair-office", "buy", firstDay).transaction.ownedAssetId!;
    expect(economy.disposeAsset("player", ownedAssetId, "asset_sale", "sell", undefined, firstDay).transaction.amount).toBe(23);
    expect(economy.disposeAsset("player", ownedAssetId, "asset_sale", "sell", undefined, firstDay).replayed).toBe(true);
    expect(() => economy.disposeAsset("player", ownedAssetId, "asset_sale", "sell-again", undefined, firstDay)).toThrow("ASSET_NOT_OWNED");
    expect(economy.rewardGame("player", "after-sale", 20, true, firstDay).amount).toBe(0);
    expect(economy.getPlayerEconomy("player", firstDay).coinBalance).toBe(WELCOME_COIN_REWARD + GAME_REWARD_DAILY_CAP - 70 + 23);
    expect(() => new EconomyStore([]).restoreState(economy.exportState())).not.toThrow();
  });

  it("preserves issued receipts while applying current limits to subsequent rewards", () => {
    const source = new EconomyStore(["player"], firstDay);
    source.claimDailyReward("player", "daily", firstDay);
    source.rewardGame("player", "first", 20, true, firstDay);
    source.rewardGame("player", "second", 20, true, firstDay);
    const issued = source.exportState();
    issued.accounts[0]!.inventory = [];
    issued.transactions = issued.transactions.filter((receipt) => receipt.kind !== "shop_purchase");
    const paidAmounts = [250, 50, 120, 80];
    let balance = 0;
    issued.transactions.forEach((receipt, index) => {
      receipt.amount = paidAmounts[index]!;
      balance += receipt.amount;
      receipt.balanceAfter = balance;
    });
    issued.accounts[0]!.coinBalance = balance;
    issued.accounts[0]!.lifetimeEarned = balance;

    const restored = new EconomyStore([]);
    restored.restoreState(issued);
    expect(restored.exportState()).toEqual(issued);
    expect(restored.rewardGame("player", "extra", 20, true, firstDay).amount).toBe(0);
    expect(restored.claimDailyReward("player", "daily", firstDay).transaction.amount).toBe(50);
    expect(() => restored.claimDailyReward("player", "another-claim", firstDay)).toThrow("DAILY_REWARD_ALREADY_CLAIMED");
    expect(restored.claimDailyReward("player", "tomorrow", secondDay).transaction.amount).toBe(15);
    expect(restored.rewardGame("player", "tomorrow", 20, true, secondDay).amount).toBe(100);
    expect(restored.getPlayerEconomy("player", secondDay).coinBalance).toBe(615);
    expect(() => new EconomyStore([]).restoreState(restored.exportState())).not.toThrow();
  });
});
