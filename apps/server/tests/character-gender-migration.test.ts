import { MikroORM } from "@mikro-orm/postgresql";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { Migration20260917010000 } from "../src/migrations/Migration20260917010000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("character gender removal", () => {
  it("removes gender while preserving every appearance selection and member", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table members (id text primary key, name text, character jsonb) on commit drop");
      const appearance = { ...DEFAULT_CHARACTER_APPEARANCE, face: "fierce", hairstyle: "spiky", upperBody: "ranger", lowerBody: "kimono", shoes: "festival", headwear: "cap" };
      for (const gender of ["female", "male"]) {
        await em.execute("insert into members values (?, ?, ?::jsonb)", [gender, `Member ${gender}`, JSON.stringify({ ...appearance, gender })]);
      }
      await em.execute("insert into members values ('current', 'Current member', ?::jsonb)", [JSON.stringify(DEFAULT_CHARACTER_APPEARANCE)]);
      const migration = new Migration20260917010000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      expect(await em.execute("select * from members order by id")).toEqual([
        { id: "current", name: "Current member", character: DEFAULT_CHARACTER_APPEARANCE },
        { id: "female", name: "Member female", character: appearance },
        { id: "male", name: "Member male", character: appearance },
      ]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
