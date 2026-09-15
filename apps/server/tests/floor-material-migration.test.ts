import { MikroORM } from "@mikro-orm/postgresql";
import { requireAssetDefinition } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { Migration20260916030000 } from "../src/migrations/Migration20260916030000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("floor material migration", () => {
  it("retains placement, ownership and purchase integrity when separating materials", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table floor_layouts (floor_id text primary key, objects jsonb, revision integer) on commit drop");
      await em.execute("create temporary table owned_assets (id text primary key, asset_id text, placement jsonb) on commit drop");
      await em.execute("create temporary table coin_transactions (id text primary key, owned_asset_id text, asset_id text, operation_fingerprint text, amount integer, balance_after integer) on commit drop");
      const objects = ["wood", "stone", "grass"].map((variantId, index) => ({
        id: `tile-${index}`, assetId: "floor-tile", variantId, ownedAssetId: `owned-${index}`, ownerUserId: "owner",
        floorId: "studio", x: index * 64, y: 128, rotation: index * 90,
      }));
      const rug = { id: "rug", assetId: "rug-woven", variantId: "oak", floorId: "studio", x: 320, y: 128, rotation: 0 };
      await em.execute("insert into floor_layouts values ('studio', ?::jsonb, 7), ('empty', '[]'::jsonb, 2)", [JSON.stringify([...objects, rug])]);
      for (let index = 0; index < 4; index++) {
        const placement = index < 3 ? { floorId: "studio", objectId: `tile-${index}` } : null;
        await em.execute("insert into owned_assets values (?, 'floor-tile', ?::jsonb)", [`owned-${index}`, JSON.stringify(placement)]);
        await em.execute("insert into coin_transactions values (?, ?, 'floor-tile', 'shop_purchase:floor-tile', -30, ?)", [`purchase-${index}`, `owned-${index}`, 220 - index * 30]);
      }
      const migration = new Migration20260916030000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const [layout] = await em.execute<{ objects: typeof objects; revision: number }[]>("select objects, revision from floor_layouts where floor_id = 'studio'");
      const assetIds = ["floor-wood", "floor-stone-tiles", "floor-grass", "floor-wood"];
      expect(layout!.objects).toEqual([...objects.map((object, index) => ({ ...object, assetId: assetIds[index], variantId: ["oak", "limestone", "lawn"][index] })), rug]);
      expect(layout!.revision).toBe(8);
      const purchases = await em.execute<{ asset_id: string; operation_fingerprint: string; amount: number; balance_after: number }[]>("select * from coin_transactions order by id");
      const owned = await em.execute<{ asset_id: string; placement: unknown }[]>("select * from owned_assets order by id");
      for (const [index, purchase] of purchases.entries()) {
        expect(purchase.asset_id).toBe(assetIds[index]);
        expect(owned[index]!.asset_id).toBe(purchase.asset_id);
        expect(purchase.operation_fingerprint).toBe(`shop_purchase:${purchase.asset_id}`);
        expect(purchase.amount).toBe(-requireAssetDefinition(purchase.asset_id).shop!.price);
        expect(purchase.balance_after).toBe(220 - index * 30);
        expect(owned[index]!.placement).toEqual(index < 3 ? { floorId: "studio", objectId: `tile-${index}` } : null);
      }
      for (const query of migration.getQueries()) await migration.execute(query);
      expect((await em.execute<{ revision: number }[]>("select revision from floor_layouts where floor_id = 'studio'"))[0]!.revision).toBe(8);
      expect((await em.execute<{ revision: number }[]>("select revision from floor_layouts where floor_id = 'empty'"))[0]!.revision).toBe(2);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
