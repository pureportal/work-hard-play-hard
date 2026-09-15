import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260915200000 } from "../src/migrations/Migration20260915200000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { GitHubConnectionEntity } from "../src/persistence/entities/github-entity.js";
import { githubRecord } from "../src/github/github-test-fixtures.js";

describe("GitHub persistence", () => {
  it("migrates, stores encrypted credentials, and cascades account removal", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table auth_accounts (id varchar(255) primary key) on commit drop');
      await em.execute("insert into auth_accounts values ('user-maya')");
      const migration = new Migration20260915200000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const record = githubRecord();
      await em.upsert(GitHubConnectionEntity, record);
      em.clear();
      const saved = await em.findOneOrFail(GitHubConnectionEntity, { userId: record.userId });
      expect(saved.encryptedTokens).toBe(record.encryptedTokens);
      expect(saved.login).toBe("maya");
      expect(saved.encryptedTokens).not.toMatch(/ghu_|ghr_/);
      await em.nativeUpdate(GitHubConnectionEntity, { userId: record.userId }, { encryptedTokens: null });
      em.clear();
      expect((await em.findOneOrFail(GitHubConnectionEntity, { userId: record.userId })).encryptedTokens).toBeNull();
      await em.execute("delete from auth_accounts where id = 'user-maya'");
      expect(await em.count(GitHubConnectionEntity, {})).toBe(0);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
