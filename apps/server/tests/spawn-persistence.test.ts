import { createTestData } from "../src/testing/workspace-data.js";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260915220000 } from "../src/migrations/Migration20260915220000.js";
import { Migration20260916010000 } from "../src/migrations/Migration20260916010000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { WorkspaceSettingsEntity } from "../src/persistence/entities/index.js";
import { WorkspaceStore } from "../src/store.js";

describe("start point PostgreSQL persistence", () => {
  it("initializes existing floors and round-trips a moved point", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "workspace_settings" ("id" text primary key, "game_settings" jsonb, "kidnapping_settings" jsonb, "player_kidnapping_settings" jsonb, "registration_settings" jsonb, "corporate_identity" jsonb, "organisation" jsonb, "updated_at" timestamptz) on commit drop');
      await em.execute("insert into workspace_settings (id) values ('workspace')");
      await em.execute('create temporary table floor_layouts (floor_id text primary key, sort_order integer) on commit drop');
      await em.execute("insert into floor_layouts values ('floor-studio', 0), ('floor-rooftop', 1)");
      const migration = new Migration20260915220000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const floorsMigration = new Migration20260916010000(orm.em.getDriver(), orm.config);
      floorsMigration.setTransactionContext(em.getTransactionContext()!);
      floorsMigration.up();
      for (const query of floorsMigration.getQueries()) await floorsMigration.execute(query);
      const settings = await em.findOneOrFail(WorkspaceSettingsEntity, { id: "workspace" });
      const store = new WorkspaceStore(createTestData());
      expect(settings.floors.map(({ id, spawn }) => ({ id, spawn }))).toEqual(store.getFloors().map(({ id, spawn }) => ({ id, spawn })));
      store.updateFloorSpawn("floor-studio", { x: 416, y: 864 });
      settings.floors = store.exportMutableState().floors;
      await em.flush();
      em.clear();
      const saved = await em.findOneOrFail(WorkspaceSettingsEntity, { id: "workspace" });
      const restored = new WorkspaceStore(createTestData());
      restored.restoreMutableState({ ...store.exportMutableState(), floors: saved.floors });
      expect(restored.getFloor("floor-studio")!.spawn).toEqual({ x: 416, y: 864 });
      expect(restored.getFloor("floor-rooftop")!.spawn).toEqual({ x: 640, y: 710 });
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
