import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260916000000 } from "../src/migrations/Migration20260916000000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("room meeting migration", () => {
  it("removes floor meetings and their chats while preserving room meetings and unrelated messages", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute("create temporary table meetings (id text primary key, location jsonb not null) on commit drop");
      await em.execute("create temporary table conversations (id text primary key, meeting_id text) on commit drop");
      await em.execute("create temporary table chat_messages (id text primary key, conversation_id text references conversations(id) on delete cascade, body text) on commit drop");
      await em.execute("create temporary table members (id text primary key, activity text) on commit drop");
      await em.execute("insert into meetings values ('floor', ?::jsonb), ('room', ?::jsonb)", [JSON.stringify({ type: "public", floorId: "floor", x: 800, y: 760, radius: 82 }), JSON.stringify({ type: "room", roomId: "daily" })]);
      await em.execute("insert into conversations values ('floor-chat', 'floor'), ('room-chat', 'room'), ('team', null)");
      await em.execute("insert into chat_messages values ('floor-message', 'floor-chat', 'Hello'), ('room-message', 'room-chat', 'Agenda'), ('message-team-5', 'team', 'Open huddle is live in the Product Studio.'), ('keep', 'team', 'Project update')");
      await em.execute("insert into members values ('theo', 'Open huddle'), ('maya', 'Designing')");
      const migration = new Migration20260916000000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      expect(await em.execute("select id from meetings")).toEqual([{ id: "room" }]);
      expect(await em.execute("select id from conversations order by id")).toEqual([{ id: "room-chat" }, { id: "team" }]);
      expect(await em.execute("select id from chat_messages order by id")).toEqual([{ id: "keep" }, { id: "room-message" }]);
      expect(await em.execute("select * from members order by id")).toEqual([{ id: "maya", activity: "Designing" }, { id: "theo", activity: null }]);
      await expect(em.execute("insert into meetings values ('invalid', ?::jsonb)", [JSON.stringify({ type: "public" })])).rejects.toThrow();
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
