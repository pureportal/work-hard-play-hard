import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { PostgreSqlAuthRepository } from "../src/persistence/postgresql-auth-repository.js";
import { MemoryDatabase } from "../src/persistence/memory-database.js";
import { populateTestWorkspace } from "../src/testing/application.js";
import { WorkspaceStore } from "../src/store.js";
import { Migration20260916020000 } from "../src/migrations/Migration20260916020000.js";

describe("demo data cleanup", () => {
  it("removes fabricated records while preserving real accounts, messages, office edits and floor metadata", async () => {
    const databaseName = `workhard_cleanup_test_${randomUUID().replaceAll("-", "")}`;
    const admin = await MikroORM.init(createDatabaseConfig());
    let orm: MikroORM | undefined;
    let created = false;
    try {
      await admin.em.fork().execute(`create database "${databaseName}"`);
      created = true;
      const config = createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: databaseName });
      orm = await MikroORM.init({ ...config, migrations: { ...config.migrations, snapshot: false } });
      await orm.migrator.up();
      const database = new MemoryDatabase();
      await populateTestWorkspace(database);
      const state = (await database.loadWorkspaceState())!;
      const store = new WorkspaceStore();
      store.restoreMutableState(state.store);
      store.addMember({ id: "real-user", username: "alex", email: "alex@example.test" });
      store.addMessage("conversation-team", "real-user", "Actual project update");
      const layout = structuredClone(store.getLayout("floor-studio")!);
      const board = layout.objects.find((object) => object.assetId === "equipment-whiteboard")!;
      board.workState = { kind: "whiteboard", revision: 1, document: { text: "Actual notes", cards: [] } };
      store.replaceLayout({ ...layout, revision: layout.revision + 1 });
      store.updateFloorSpawn("floor-studio", { x: 416, y: 864 });
      const repository = new PostgreSqlWorkspaceRepository(orm);
      const authRepository = new PostgreSqlAuthRepository(orm);
      await repository.save({ players: state.players, store: store.exportMutableState() });
      const auth = (await database.loadAuthState())!;
      auth.accounts.push({ ...auth.accounts[0]!, id: "real-user", username: "alex", email: "alex@example.test" });
      await authRepository.save(auth);

      const em = orm.em.fork();
      await em.execute("insert into spotify_connections (user_id, encrypted_tokens, sharing) values ('user-maya', 'encrypted-test-connection', true), ('user-jonas', null, false)");
      await em.transactional(async (transaction) => {
        const migration = new Migration20260916020000(orm!.em.getDriver(), orm!.config);
        migration.setTransactionContext(transaction.getTransactionContext()!);
        await migration.up();
      });
      expect((await repository.load())!.store.members.map((member) => member.id)).toEqual(["user-maya", "real-user"]);
      expect(await em.execute("select user_id from spotify_connections")).toEqual([{ user_id: "user-maya" }]);
      await em.execute("delete from spotify_connections where user_id = 'user-maya'");
      await em.transactional(async (transaction) => {
        const migration = new Migration20260916020000(orm!.em.getDriver(), orm!.config);
        migration.setTransactionContext(transaction.getTransactionContext()!);
        await migration.up();
      });
      const cleaned = (await repository.load())!;
      const restored = new WorkspaceStore();
      restored.restoreMutableState(cleaned.store);
      expect(restored.getMembers().map((member) => member.id)).toEqual(["real-user"]);
      expect(restored.getMember("real-user")!.role).toBe("owner");
      expect(restored.getOrganisation()).toMatchObject({ ceoIds: ["real-user"], units: [], assignments: [] });
      expect(cleaned.store.messages.map((message) => message.body)).toEqual(["Actual project update"]);
      expect(cleaned.store.meetings).toEqual([]);
      expect(cleaned.store.invitations).toEqual([]);
      expect(cleaned.store.scores).toEqual([]);
      expect(cleaned.store.gameStatistics).toEqual([]);
      expect(cleaned.players).toEqual([]);
      expect(cleaned.store.layouts.map((floor) => floor.objects.length)).toEqual(store.exportMutableState().layouts.map((floor) => floor.objects.length));
      expect(restored.getObject(board.id)!.workState).toEqual(board.workState);
      expect(restored.getObject("object-desk-maya")!.label).toBeUndefined();
      expect(cleaned.store.floors).toEqual(store.exportMutableState().floors);
      expect((await authRepository.load())!.accounts.map((account) => account.id)).toEqual(["real-user"]);
    } finally {
      await orm?.close(true);
      try {
        if (created) await admin.em.fork().execute(`drop database "${databaseName}"`);
      } finally {
        await admin.close(true);
      }
    }
  }, 60_000);
});
