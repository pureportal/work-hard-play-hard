import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260917140000 } from "../src/migrations/Migration20260917140000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { ChatImageEntity } from "../src/persistence/entities/chat-image-entity.js";

describe("PostgreSQL chat image persistence", () => {
  it("migrates binary storage and round-trips and deletes image data", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      const migration = new Migration20260917140000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);

      const id = randomUUID();
      const image = Buffer.from([0, 1, 127, 128, 254, 255]);
      await em.insert(ChatImageEntity, { id, image });
      em.clear();
      expect((await em.findOneOrFail(ChatImageEntity, { id })).image).toEqual(image);
      expect(await em.execute('select pg_typeof(image)::text as type from chat_images where id = ?', [id])).toEqual([{ type: "bytea" }]);
      await em.nativeDelete(ChatImageEntity, { id });
      em.clear();
      expect(await em.findOne(ChatImageEntity, { id })).toBeNull();

      migration.reset();
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.down();
      for (const query of migration.getQueries()) await migration.execute(query);
      expect(await em.execute("select to_regclass('pg_temp.chat_images') as name")).toEqual([{ name: null }]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
