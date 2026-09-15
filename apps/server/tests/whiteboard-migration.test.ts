import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260915120000 } from "../src/migrations/Migration20260915120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";

describe("whiteboard document migration", () => {
  it("moves saved text into documents and preserves object order, revisions and other work objects", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table floor_layouts (floor_id text primary key, objects jsonb) on commit drop');
      const objects = [
        { id: "board", workState: { kind: "whiteboard", revision: 4, text: "Release plan\n試作を確認" } },
        { id: "desk", assetId: "desk-straight" },
        { id: "checklist", workState: { kind: "checklist", revision: 2, items: [{ id: "one", text: "Review", completed: true }] } },
        { id: "blank-board", assetId: "equipment-whiteboard" },
      ];
      await em.execute("insert into floor_layouts values (?, ?::jsonb), (?, '[]'::jsonb)", ["studio", JSON.stringify(objects), "empty"]);
      const migration = new Migration20260915120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const rows = await em.execute<{ floor_id: string; objects: unknown[] }[]>("select * from floor_layouts order by floor_id");
      expect(rows[0]!.objects).toEqual([]);
      expect(rows[1]!.objects).toEqual([
        { id: "board", workState: { kind: "whiteboard", revision: 4, document: { text: "Release plan\n試作を確認", cards: [] } } },
        ...objects.slice(1),
      ]);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
