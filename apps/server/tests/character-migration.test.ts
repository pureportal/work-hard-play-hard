import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260906140000 } from "../src/migrations/Migration20260906140000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("character migration", () => {
  it("preserves members and stores a complete appearance in the new JSON column", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "members" ("id" text primary key, "name" text not null) on commit drop');
      await em.execute('insert into "members" values (?, ?)', ["character-test", "Player"]);
      const migration = new Migration20260906140000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      expect(await em.execute('select * from "members"')).toEqual([{ id: "character-test", name: "Player", character: null }]);
      await em.execute('update "members" set "character" = ?::jsonb where "id" = ?', [JSON.stringify(DEFAULT_CHARACTER_APPEARANCE), "character-test"]);
      expect(await em.execute('select "character" from "members"')).toEqual([{ character: DEFAULT_CHARACTER_APPEARANCE }]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
