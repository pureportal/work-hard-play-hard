import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260918120000 } from "../src/migrations/Migration20260918120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { GameGuideEntity } from "../src/persistence/entities/game-guide-entity.js";

describe("Game guide persistence", () => {
  it("migrates, keeps each player's state, and cascades account removal", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table auth_accounts (id varchar(255) primary key) on commit drop');
      await em.execute("insert into auth_accounts values ('user-maya'), ('user-leo')");
      const migration = new Migration20260918120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      await em.upsert(GameGuideEntity, { userId: "user-maya", status: "started" });
      await em.upsert(GameGuideEntity, { userId: "user-maya", status: "completed" });
      await em.upsert(GameGuideEntity, { userId: "user-leo", status: "skipped" });
      em.clear();
      expect((await em.findOneOrFail(GameGuideEntity, { userId: "user-maya" })).status).toBe("completed");
      expect((await em.findOneOrFail(GameGuideEntity, { userId: "user-leo" })).status).toBe("skipped");
      await em.execute("delete from auth_accounts where id = 'user-maya'");
      expect(await em.count(GameGuideEntity, {})).toBe(1);
      await expect(em.execute("update game_guide_states set status = 'invalid' where user_id = 'user-leo'")).rejects.toThrow();
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
