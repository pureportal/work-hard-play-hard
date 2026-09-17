import { describe, expect, it } from "vitest";
import { getAssetDefinition, isPermanentAsset } from "@workhard/shared";
import { EconomyStore } from "./economy-store.js";

const createdAt = new Date("2026-09-17T12:00:00.000Z");
const nextDay = new Date("2026-09-18T12:00:00.000Z");

describe("starter inventory", () => {
  it("grants a table and laptop once per new player without spending welcome coins", () => {
    const store = new EconomyStore(["alice", "alice", "bob"], createdAt);
    const initial = store.exportState();
    store.createAccount("alice", nextDay);
    store.createAccount("bob", nextDay);
    expect(store.exportState()).toEqual(initial);

    for (const userId of ["alice", "bob"]) {
      const economy = store.getPlayerEconomy(userId, createdAt);
      expect(economy).toMatchObject({ coinBalance: 250, lifetimeEarned: 250, lifetimeSpent: 0 });
      expect(economy.inventory).toEqual([
        { id: expect.any(String), assetId: "table-cafe", acquiredAt: createdAt.toISOString(), purchasePrice: 0 },
        { id: expect.any(String), assetId: "decor-laptop", acquiredAt: createdAt.toISOString(), purchasePrice: 0 },
      ]);
      for (const item of economy.inventory) {
        expect(getAssetDefinition(item.assetId)).toMatchObject({ buildable: true, shop: { available: true } });
        expect(isPermanentAsset(item.assetId)).toBe(false);
      }
    }
    expect(new Set(initial.accounts.flatMap((account) => account.inventory.map((item) => item.id))).size).toBe(4);
    const restored = new EconomyStore([]);
    restored.restoreState(initial);
    restored.createAccount("alice", nextDay);
    expect(restored.exportState()).toEqual(initial);
  });

  it("leaves saved players without starter items unchanged and grants them to newly added players", () => {
    const source = new EconomyStore(["existing"], createdAt);
    const saved = source.exportState();
    saved.accounts[0]!.inventory = [];
    saved.transactions = saved.transactions.filter((transaction) => transaction.kind === "welcome");
    const restored = new EconomyStore([]);
    restored.restoreState(saved);
    restored.createAccount("existing", nextDay);
    expect(restored.exportState()).toEqual(saved);

    restored.createAccount("new-player", nextDay);
    expect(restored.getPlayerEconomy("existing").inventory).toEqual([]);
    expect(restored.getPlayerEconomy("new-player").inventory.map((item) => item.assetId)).toEqual(["table-cafe", "decor-laptop"]);
  });

  it.each(["asset_sale", "asset_donation"] as const)("does not pay or replenish starter items after %s, retries, and restoration", (kind) => {
    const store = new EconomyStore(["alice"], createdAt);
    const items = store.getPlayerEconomy("alice").inventory;
    const fundId = kind === "asset_donation" ? "workspace" : undefined;
    for (const item of items) {
      const result = store.disposeAsset("alice", item.id, kind, `dispose:${item.id}`, fundId, createdAt);
      expect(result.transaction.amount).toBe(0);
      expect(store.disposeAsset("alice", item.id, kind, `dispose:${item.id}`, fundId, createdAt).replayed).toBe(true);
      expect(() => store.disposeAsset("alice", item.id, kind, `again:${item.id}`, fundId, createdAt)).toThrow("ASSET_NOT_OWNED");
    }
    const restored = new EconomyStore([]);
    restored.restoreState(store.exportState());
    restored.createAccount("alice", nextDay);
    expect(restored.getPlayerEconomy("alice")).toMatchObject({
      coinBalance: 250, lifetimeEarned: 250, lifetimeSpent: 0, inventory: [],
    });
    expect(restored.disposeAsset("alice", items[0]!.id, kind, `dispose:${items[0]!.id}`, fundId, nextDay).replayed).toBe(true);
  });

  it.each(["table-cafe", "decor-laptop"])("charges catalog price for another %s and resells that copy at one third", (assetId) => {
    const store = new EconomyStore(["alice"], createdAt);
    const price = getAssetDefinition(assetId)!.shop!.price;
    const purchase = store.purchaseAsset("alice", assetId, "buy-another", createdAt);
    const ownedId = purchase.transaction.ownedAssetId!;
    expect(purchase.transaction.amount).toBe(-price);
    expect(purchase.economy.inventory.filter((item) => item.assetId === assetId)).toHaveLength(2);
    expect(store.disposeAsset("alice", ownedId, "asset_sale", "sell-purchased", undefined, createdAt).transaction.amount).toBe(Math.floor(price / 3));
    expect(store.getPlayerEconomy("alice").inventory).toHaveLength(2);
    expect(() => new EconomyStore([]).restoreState(store.exportState())).not.toThrow();
  });

  it("rejects a missing acquisition receipt or an inflated starter resale value on restore", () => {
    const source = new EconomyStore(["alice"], createdAt);
    const missingReceipt = source.exportState();
    missingReceipt.transactions.pop();
    expect(() => new EconomyStore([]).restoreState(missingReceipt)).toThrow("ECONOMY_STATE_INVALID");
    const inflatedValue = source.exportState();
    inflatedValue.accounts[0]!.inventory[0]!.purchasePrice = 140;
    expect(() => new EconomyStore([]).restoreState(inflatedValue)).toThrow("ECONOMY_STATE_INVALID");
  });
});
