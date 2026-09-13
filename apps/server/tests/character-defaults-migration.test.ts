import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { characterAppearanceSchema } from "../src/avatar/character-schema.js";
import { Migration20260907120000 } from "../src/migrations/Migration20260907120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("character defaults migration", () => {
  it("fills missing appearances once, preserves customization and removes profile-photo storage", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "members" ("id" text primary key, "character" jsonb) on commit drop');
      await em.execute('create temporary table "player_avatars" ("user_id" text primary key) on commit drop');
      await em.execute('insert into "members" select i::text, null from generate_series(1, 32) i');
      await em.execute('insert into "members" values (?, ?::jsonb)', ["customized", JSON.stringify(DEFAULT_CHARACTER_APPEARANCE)]);
      const migration = new Migration20260907120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const members = await em.execute<{ id: string; character: unknown }[]>('select * from "members"');
      expect(members).toHaveLength(33);
      expect(members.find((member) => member.id === "customized")?.character).toEqual(DEFAULT_CHARACTER_APPEARANCE);
      for (const member of members) expect(characterAppearanceSchema.safeParse(member.character).success).toBe(true);
      expect(await em.execute("select to_regclass('pg_temp.player_avatars') as table_name")).toEqual([{ table_name: null }]);
      expect(await em.execute("select attnotnull from pg_attribute where attrelid = 'pg_temp.members'::regclass and attname = 'character'")).toEqual([{ attnotnull: true }]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
