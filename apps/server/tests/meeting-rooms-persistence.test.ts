import { randomUUID } from "node:crypto";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { PostgreSqlWorkspaceRepository } from "../src/persistence/postgresql-workspace-repository.js";
import { WorkspaceStore } from "../src/store.js";
import { createTestData } from "../src/testing/workspace-data.js";
import { Migration20260917160000 } from "../src/migrations/Migration20260917160000.js";

describe("meeting room PostgreSQL persistence", () => {
  it("preserves scheduled meetings and round-trips reusable room meetings and chats", async () => {
    const databaseName = `workhard_meeting_rooms_test_${randomUUID().replaceAll("-", "")}`;
    const admin = await MikroORM.init(createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: "postgres" }));
    let orm: MikroORM | undefined;
    let created = false;
    try {
      await admin.em.fork().execute(`create database "${databaseName}"`);
      created = true;
      const config = createDatabaseConfig({ ...process.env, POSTGRES_DB_NAME: databaseName });
      orm = await MikroORM.init({ ...config, migrations: { ...config.migrations, snapshot: false } });
      await orm.schema.create();
      await orm.em.fork().execute("alter table meetings alter column starts_at set not null, alter column duration_minutes set not null, drop constraint meetings_status_check");
      await orm.em.fork().execute("alter table meetings add constraint meetings_status_check check (status in ('scheduled', 'live', 'ended'))");
      const store = new WorkspaceStore(createTestData());
      const repository = new PostgreSqlWorkspaceRepository(orm);
      await repository.save({ players: [], store: store.exportMutableState() });
      const scheduled = structuredClone(store.getMeetings());
      await orm.em.fork().transactional(async (em) => {
        const migration = new Migration20260917160000(orm!.em.getDriver(), orm!.config);
        migration.setTransactionContext(em.getTransactionContext()!);
        migration.up();
        for (const query of migration.getQueries()) await migration.execute(query);
      });
      expect((await repository.load())!.store.meetings).toEqual(scheduled);
      const room = store.getRoom("room-daily")!;
      store.updateRoomSettings(room.id, { name: "Team call", color: room.color, access: room.access, meetingRoom: true });
      const meeting = store.getMeetings().find((candidate) => candidate.status === "idle")!;
      store.joinMeeting(meeting.id, "user-maya");
      const conversation = store.getBootstrap("user-maya").conversations.find((candidate) => candidate.meetingId === meeting.id)!;
      store.addMessage(conversation.id, "user-maya", "Persisted room call message");
      await repository.save({ players: [], store: store.exportMutableState() });
      const restored = new WorkspaceStore();
      restored.restoreMutableState((await repository.load())!.store);
      expect(restored.getRoom(room.id)?.meetingRoom).toBe(true);
      expect(restored.getMeeting(meeting.id)).toEqual(store.getMeeting(meeting.id));
      expect(restored.getBootstrap("user-maya").messages).toContainEqual(expect.objectContaining({ body: "Persisted room call message" }));
      restored.leaveMeeting(meeting.id, "user-maya");
      await repository.save({ players: [], store: restored.exportMutableState() });
      expect((await repository.load())!.store.meetings.find((candidate) => candidate.id === meeting.id)).toMatchObject({ status: "idle", participantIds: [] });
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
