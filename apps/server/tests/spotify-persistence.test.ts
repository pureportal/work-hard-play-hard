import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260915160000 } from "../src/migrations/Migration20260915160000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { SpotifyConnectionEntity } from "../src/persistence/entities/spotify-entity.js";
import { spotifyRecord } from "../src/spotify/spotify-test-fixtures.js";

describe("Spotify persistence", () => {
  it("migrates, saves encrypted credentials and sharing, and removes connections with their account", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table auth_accounts (id varchar(255) primary key) on commit drop');
      await em.execute("insert into auth_accounts values ('user-maya')");
      const migration = new Migration20260915160000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const record = spotifyRecord();
      await em.upsert(SpotifyConnectionEntity, record);
      em.clear();
      const saved = await em.findOneOrFail(SpotifyConnectionEntity, { userId: record.userId });
      expect(saved.encryptedTokens).toBe(record.encryptedTokens);
      expect(saved.sharing).toBe(true);
      await em.nativeUpdate(SpotifyConnectionEntity, { userId: record.userId }, { sharing: false });
      em.clear();
      expect((await em.findOneOrFail(SpotifyConnectionEntity, { userId: record.userId })).sharing).toBe(false);
      await em.execute("delete from auth_accounts where id = 'user-maya'");
      expect(await em.count(SpotifyConnectionEntity, {})).toBe(0);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
