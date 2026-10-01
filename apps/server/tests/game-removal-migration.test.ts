import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { EconomyStore, type EconomyPersistenceState } from "../src/economy/economy-store.js";
import { Migration20261002120000 } from "../src/migrations/Migration20261002120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("game removal migration", () => {
  it("removes saved game state and preserves the wallet ledger", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table workspace_settings (id text primary key, approval_desk jsonb) on commit drop");
      await em.execute("insert into workspace_settings values ('workspace', '{\"players\":[],\"totalForms\":100}')");
      await em.execute(`create temporary table coin_transactions (
        id text primary key, user_id text, operation_key text, operation_fingerprint text,
        kind text constraint coin_transactions_kind_check check (kind in ('welcome', 'shop_purchase', 'approval_reward', 'approval_upgrade')),
        amount integer, balance_after integer, created_at text, asset_id text, owned_asset_id text, source_id text, sort_order integer,
        unique (user_id, operation_key)
      ) on commit drop`);

      const now = new Date("2026-10-02T12:00:00.000Z");
      const economy = new EconomyStore(["player"], now);
      const state = economy.exportState();
      for (const [index, transaction] of state.transactions.entries()) {
        await em.execute("insert into coin_transactions values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
          transaction.id, transaction.userId, transaction.operationKey, transaction.operationFingerprint,
          transaction.kind, transaction.amount, transaction.balanceAfter, transaction.createdAt,
          transaction.assetId ?? null, transaction.ownedAssetId ?? null, transaction.sourceId ?? null, index,
        ]);
      }
      const startOrder = state.transactions.length;
      await em.execute(`insert into coin_transactions values
        ('reward', 'player', 'approval_reward:case', 'approval_reward:5', 'approval_reward', 5, 255, ?, null, null, 'case', ?),
        ('upgrade', 'player', 'approval_upgrade:stamp:0', 'approval_upgrade:stamp:0:35', 'approval_upgrade', -35, 220, ?, null, null, 'stamp', ?),
        ('capped', 'player', 'approval_reward:capped', 'approval_reward:0', 'approval_reward', 0, 220, ?, null, null, 'capped', ?)`,
        [now.toISOString(), startOrder, now.toISOString(), startOrder + 1, now.toISOString(), startOrder + 2]);

      const migration = new Migration20261002120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);

      expect(await em.execute("select * from workspace_settings")).toEqual([{ id: "workspace" }]);
      type LedgerRow = Omit<EconomyPersistenceState["transactions"][number], "assetId" | "ownedAssetId" | "sourceId"> & {
        assetId: string | null; ownedAssetId: string | null; sourceId: string | null;
      };
      const rows = await em.execute<LedgerRow[]>(`select id, user_id as "userId", operation_key as "operationKey",
        operation_fingerprint as "operationFingerprint", kind, amount, balance_after as "balanceAfter", created_at as "createdAt",
        asset_id as "assetId", owned_asset_id as "ownedAssetId", source_id as "sourceId"
        from coin_transactions order by sort_order`);
      expect(rows.slice(0, startOrder).map(({ assetId, ownedAssetId, sourceId, ...transaction }) => ({
        ...transaction, ...(assetId !== null ? { assetId } : {}), ...(ownedAssetId !== null ? { ownedAssetId } : {}),
        ...(sourceId !== null ? { sourceId } : {}),
      }))).toEqual(state.transactions);
      expect(rows.slice(startOrder)).toEqual([5, -35, 0].map((amount, index) => ({
        id: ["reward", "upgrade", "capped"][index], userId: "player", kind: "balance_adjustment", amount,
        balanceAfter: [255, 220, 220][index], createdAt: now.toISOString(),
        operationKey: `balance_adjustment:${["reward", "upgrade", "capped"][index]}`,
        operationFingerprint: `balance_adjustment:${amount}`, assetId: null, ownedAssetId: null, sourceId: null,
      })));
      state.transactions = rows.map(({ assetId, ownedAssetId, sourceId, ...transaction }) => ({
        ...transaction, ...(assetId !== null ? { assetId } : {}), ...(ownedAssetId !== null ? { ownedAssetId } : {}),
        ...(sourceId !== null ? { sourceId } : {}),
      }));
      Object.assign(state.accounts[0]!, { coinBalance: 220, lifetimeEarned: 255, lifetimeSpent: 35 });
      expect(() => economy.restoreState(state)).not.toThrow();
      expect(economy.getPlayerEconomy("player", now)).toMatchObject({ coinBalance: 220, lifetimeEarned: 255, lifetimeSpent: 35 });
      await expect(em.execute(`insert into coin_transactions (id, user_id, operation_key, kind)
        values ('removed', 'player', 'removed', 'approval_reward')`)).rejects.toThrow();
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
