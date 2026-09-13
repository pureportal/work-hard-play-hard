import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260906120000 } from "../src/migrations/Migration20260906120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("arcade layout migration", () => {
  it("removes the seeded Dash cabinet, preserves other objects, and runs once", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "floor_layouts" ("floor_id" text primary key, "revision" integer not null, "objects" jsonb not null) on commit drop');
      const cabinet = { id: "object-arcade-b", assetId: "equipment-arcade", label: "Dash" };
      const remaining = [{ id: "plant" }, { ...cabinet, id: "custom-cabinet" }];
      await em.execute('insert into "floor_layouts" values (?, ?, ?::jsonb)', ["floor-studio", 5, JSON.stringify([remaining[0], cabinet, remaining[1]])]);
      await em.execute('insert into "floor_layouts" values (?, ?, ?::jsonb)', ["floor-other", 8, JSON.stringify([cabinet])]);
      const migration = new Migration20260906120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (let run = 0; run < 2; run += 1) {
        for (const query of migration.getQueries()) await migration.execute(query);
      }
      expect(await em.execute('select * from "floor_layouts" order by "floor_id"')).toEqual([
        { floor_id: "floor-other", revision: 8, objects: [cabinet] },
        { floor_id: "floor-studio", revision: 6, objects: remaining },
      ]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 15_000);
});
