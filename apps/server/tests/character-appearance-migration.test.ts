import { MikroORM } from "@mikro-orm/postgresql";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { Migration20260915210000 } from "../src/migrations/Migration20260915210000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("character appearance migration", () => {
  it("removes the size field without changing other selections or member data", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table members (id text primary key, name text, character jsonb) on commit drop");
      const appearances = [
        DEFAULT_CHARACTER_APPEARANCE,
        { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", hairstyle: "longbraid", upperBody: "traveler", headwear: "goggles" },
      ];
      for (const [index, appearance] of appearances.entries()) {
        for (const size of ["none", "flat", "medium", "big"]) {
          await em.execute("insert into members values (?, ?, ?::jsonb)", [`${index}-${size}`, `Member ${index}`, JSON.stringify({ ...appearance, breastSize: size })]);
        }
      }
      await em.execute("insert into members values ('current', 'Current member', ?::jsonb)", [JSON.stringify(DEFAULT_CHARACTER_APPEARANCE)]);
      const migration = new Migration20260915210000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const rows = await em.execute<{ id: string; name: string; character: unknown }[]>("select * from members order by id");
      expect(rows).toHaveLength(9);
      for (const row of rows) {
        const current = row.id === "current";
        const index = current ? 0 : Number(row.id[0]);
        expect(row.name).toBe(current ? "Current member" : `Member ${index}`);
        expect(row.character).toEqual(appearances[index]);
      }
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
