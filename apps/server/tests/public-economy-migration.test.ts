import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260916180000 } from "../src/migrations/Migration20260916180000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { validatePublicEconomy, type PublicEconomyState } from "../src/economy/public-economy-store.js";

describe("public economy migration", () => {
  it("preserves original prices and moves permanent floors to public ownership without changing wallets", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table workspace_settings (id text primary key, organisation jsonb) on commit drop");
      await em.execute("create temporary table economy_accounts (user_id text primary key, coin_balance integer) on commit drop");
      await em.execute("create temporary table owned_assets (id text primary key, user_id text, asset_id text, placement jsonb) on commit drop");
      await em.execute("create temporary table floor_layouts (floor_id text primary key, objects jsonb, revision integer) on commit drop");
      await em.execute(`create temporary table coin_transactions (id text primary key, user_id text, operation_key text, operation_fingerprint text,
        kind text constraint coin_transactions_kind_check check (kind in ('welcome','shop_purchase')), amount integer, balance_after integer,
        created_at timestamptz, asset_id text, owned_asset_id text, source_id text, sort_order integer) on commit drop`);
      await em.execute(`insert into workspace_settings values ('workspace', '{"ceoIds":[]}'), ('company', '{"ceoIds":["alice"]}')`);
      await em.execute("insert into economy_accounts values ('alice', 120)");
      const objects = [{ id: "floor", assetId: "floor-wood", ownerUserId: "alice", ownedAssetId: "placed", x: 32, y: 32 }];
      await em.execute("insert into floor_layouts values ('studio', ?::jsonb, 4), ('empty', '[]'::jsonb, 0)", [JSON.stringify(objects)]);
      for (const [index, id] of ["placed", "stored", "chair"].entries()) {
        const assetId = id === "chair" ? "chair-office" : "floor-wood";
        const placement = id === "placed" ? JSON.stringify({ floorId: "studio", objectId: "floor" }) : null;
        await em.execute("insert into owned_assets values (?, 'alice', ?, ?::jsonb)", [id, assetId, placement]);
        await em.execute(`insert into coin_transactions values (?, 'alice', ?, ?, 'shop_purchase', ?, ?, now(), ?, ?, null, ?)`,
          [`buy-${id}`, `buy-${id}`, `shop_purchase:${assetId}`, -[35, 35, 60][index]!, 250 - [35, 70, 130][index]!, assetId, id, index]);
      }
      const migration = new Migration20260916180000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      await migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const [settings] = await em.execute<{ public_economy: PublicEconomyState }[]>("select public_economy from workspace_settings where id = 'workspace'");
      const economy = settings!.public_economy;
      expect(() => validatePublicEconomy(economy)).not.toThrow();
      expect(economy.funds[0]).toMatchObject({ mode: "equal", balance: 0 });
      expect(economy.receipts).toEqual([{ key: "asset:floor", floorId: "studio", fundId: "workspace", paid: 35 }]);
      expect(economy.inventory).toEqual([{ id: "stored", assetId: "floor-wood", fundId: "workspace", paid: 35 }]);
      expect(await em.execute("select id, purchase_price from owned_assets")).toEqual([{ id: "chair", purchase_price: 60 }]);
      expect(await em.execute("select coin_balance from economy_accounts")).toEqual([{ coin_balance: 120 }]);
      const donations = await em.execute<{ kind: string; amount: number; balance_after: number }[]>("select * from coin_transactions where kind = 'asset_donation'");
      expect(donations).toHaveLength(2);
      expect(donations.every((entry) => entry.amount === 0 && entry.balance_after === 120)).toBe(true);
      const [floor] = await em.execute<{ objects: unknown[]; revision: number }[]>("select * from floor_layouts where floor_id = 'studio'");
      expect(floor).toMatchObject({ revision: 5, objects: [{ id: "floor", assetId: "floor-wood", publicFundId: "workspace", x: 32, y: 32 }] });
      expect(await em.execute("select revision from floor_layouts where floor_id = 'empty'")).toEqual([{ revision: 0 }]);
      const [company] = await em.execute<{ mode: string }[]>("select public_economy->'funds'->0->>'mode' as mode from workspace_settings where id = 'company'");
      expect(company!.mode).toBe("hierarchical");
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
