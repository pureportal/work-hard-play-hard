import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { WorkspaceStore } from "../src/store.js";
import { createTestData } from "../src/testing/workspace-data.js";
import { Migration20260917230000 } from "../src/migrations/Migration20260917230000.js";
import { resolveGitHubConfig, storeGitHubConfig } from "../src/github/github-config.js";
import { githubTestConfig } from "../src/github/github-test-fixtures.js";

describe("GitHub app settings persistence", () => {
  it("migrates workspace settings and restores encrypted app configuration", async () => {
    const name = `workhard_github_settings_test_${randomUUID().replaceAll("-", "")}`;
    const admin = await MikroORM.init(createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: "postgres" }));
    let orm: MikroORM | undefined;
    let created = false;
    try {
      await admin.em.fork().execute(`create database "${name}"`);
      created = true;
      const config = createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: name });
      orm = await MikroORM.init({ ...config, migrations: { ...config.migrations, snapshot: false } });
      await orm.schema.create();
      const repository = new PostgreSqlWorkspaceRepository(orm);
      const store = new WorkspaceStore(createTestData());
      await repository.save({ players: [], store: store.exportMutableState() });
      const em = orm.em.fork();
      await em.execute("alter table workspace_settings drop column github_app_settings");
      await em.transactional(async (transaction) => {
        const migration = new Migration20260917230000(orm!.em.getDriver(), orm!.config);
        migration.setTransactionContext(transaction.getTransactionContext()!);
        migration.up();
        for (const query of migration.getQueries()) await migration.execute(query);
      });
      expect((await repository.load())!.store.githubAppSettings).toBeNull();
      store.updateGitHubAppSettings(storeGitHubConfig(githubTestConfig));
      await repository.save({ players: [], store: store.exportMutableState() });
      const reloaded = new WorkspaceStore();
      reloaded.restoreMutableState((await repository.load())!.store);
      expect(reloaded.getGitHubAppSettings()).toEqual(store.getGitHubAppSettings());
      expect(JSON.stringify(reloaded.getGitHubAppSettings())).not.toContain(githubTestConfig.clientSecret);
      expect(resolveGitHubConfig(reloaded.getGitHubAppSettings(), githubTestConfig.encryptionKey)).toEqual(githubTestConfig);
      expect(reloaded.getMembers()).toEqual(store.getMembers());
      store.updateGitHubAppSettings({ clientId: "", appSlug: "", redirectUri: "", encryptedClientSecret: null, connectionsResetPending: false });
      await repository.save({ players: [], store: store.exportMutableState() });
      expect((await repository.load())!.store.githubAppSettings).toEqual(store.getGitHubAppSettings());
    } finally {
      await orm?.close(true);
      try { if (created) await admin.em.fork().execute(`drop database "${name}"`); }
      finally { await admin.close(true); }
    }
  }, 60_000);
});
