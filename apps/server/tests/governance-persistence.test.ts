import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { WorkspaceStore } from "../src/store.js";
import { createTestData } from "../src/testing/workspace-data.js";
import { Migration20260917173000 } from "../src/migrations/Migration20260917173000.js";
import { Migration20260917174500 } from "../src/migrations/Migration20260917174500.js";
import { Migration20260917175500 } from "../src/migrations/Migration20260917175500.js";

describe("governance PostgreSQL persistence", () => {
  it("upgrades saved policies and preserves funds, ownership, areas, server settings and team ballots", async () => {
    const name = `workhard_governance_test_${randomUUID().replaceAll("-", "")}`;
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
      store.donateMoney("user-maya", "workspace", 100, "fund");
      const proposal = store.publicEconomy.propose("user-maya", "Shared rules", { kind: "game.settings", settings: store.getGameSettings() }, "workspace",
        store.getOrganisation(), store.getMembers().map((member) => member.id));
      await repository.save({ players: [], store: store.exportMutableState() });
      const em = orm.em.fork();
      await em.execute("alter table workspace_settings drop column spotify_app_settings");
      await em.execute("alter table invitations add column permissions jsonb not null default '[]'");
      await em.execute("update members set permissions = '[\"manage_members\",\"build\"]'::jsonb where role in ('owner','admin')");
      await em.execute(`update workspace_settings set organisation = organisation || '{"removalVotes":[]}'::jsonb,
        public_economy = jsonb_set(public_economy, '{funds,0}', public_economy->'funds'->0 || '{"weeklyAllowance":500,"allowances":[],"spendingLimits":{}}'::jsonb)`);
      await em.transactional(async (transaction) => {
        for (const Migration of [Migration20260917173000, Migration20260917174500, Migration20260917175500]) {
          const migration = new Migration(orm!.em.getDriver(), orm!.config);
          migration.setTransactionContext(transaction.getTransactionContext()!);
          migration.up();
          for (const query of migration.getQueries()) await migration.execute(query);
        }
      });
      const restored = new WorkspaceStore();
      restored.restoreMutableState((await repository.load())!.store);
      expect(restored.getPublicEconomy().funds[0]!.balance).toBe(100);
      expect(restored.getPublicEconomy().funds[0]).not.toHaveProperty("weeklyAllowance");
      expect(restored.getOrganisation()).not.toHaveProperty("removalVotes");
      expect(restored.publicEconomy.proposal(proposal.id)).toMatchObject({ status: "cancelled", reserved: 0 });
      expect(restored.getMember("user-maya")!.permissions).toEqual(["manage_members"]);
      const room = restored.getRoom("room-product")!;
      const bounds = { ...room.footprint[0]!, width: 64, height: 64 };
      restored.updateRoomSettings(room.id, { ...room, personalAreas: [{ id: "jonas-area", name: "Workspace", ownerUserId: "user-jonas", bounds }] });
      restored.updateSpotifyAppSettings({ clientId: "savedclient", redirectUri: "https://office.example.com/v1/spotify/callback" });
      const next = restored.publicEconomy.propose("user-jonas", "Carry rules", { kind: "kidnapping.settings", settings: restored.getGlobalKidnappingSettings() }, "workspace",
        restored.getOrganisation(), restored.getMembers().map((member) => member.id));
      restored.publicEconomy.vote("user-maya", next.id, true);
      await repository.save({ players: [], store: restored.exportMutableState() });
      const reloaded = new WorkspaceStore();
      reloaded.restoreMutableState((await repository.load())!.store);
      expect(reloaded.getRoom(room.id)!.personalAreas).toEqual(restored.getRoom(room.id)!.personalAreas);
      expect(reloaded.getSpotifyAppSettings()).toEqual(restored.getSpotifyAppSettings());
      expect(reloaded.publicEconomy.proposal(next.id)).toEqual(restored.publicEconomy.proposal(next.id));
      expect(reloaded.getPlayerEconomy("user-maya").coinBalance).toBe(store.getPlayerEconomy("user-maya").coinBalance);
    } finally {
      await orm?.close(true);
      try { if (created) await admin.em.fork().execute(`drop database "${name}"`); }
      finally { await admin.close(true); }
    }
  }, 60_000);
});
