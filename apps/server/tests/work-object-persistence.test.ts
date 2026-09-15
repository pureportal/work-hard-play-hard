import { createTestData } from "../src/testing/workspace-data.js";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../src/store.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { FloorLayoutEntity } from "../src/persistence/entities/index.js";

describe("work object PostgreSQL persistence", () => {
  it("round-trips notes and checklist state through the layout JSON column", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "floor_layouts" (like public."floor_layouts" including all) on commit drop');
      const store = new WorkspaceStore(createTestData());
      const layout = structuredClone(store.getLayout("floor-studio")!);
      const board = layout.objects.find((object) => object.assetId === "equipment-whiteboard")!;
      board.workState = { kind: "whiteboard", revision: 3, document: { text: "Release plan\n試作を確認", cards: [
        { id: "launch", kind: "note", title: "Launch", text: "Review the demo", color: "mint", status: "doing", dueDate: "2026-10-01", x: 360, y: 240, width: 240, height: 220 },
        { id: "image", kind: "image", title: "Reference", text: "", color: "blue", status: "todo", dueDate: "", x: 80, y: 60, width: 300, height: 260, src: "https://example.test/reference.png" },
      ] } };
      layout.objects.push({ ...board, id: "checklist-persistence", assetId: "equipment-checklist", x: 320, y: 480,
        workState: { kind: "checklist", revision: 2, items: [{ id: "task-one", text: "Review demo", completed: true }] } });
      em.create(FloorLayoutEntity, { ...layout, sortOrder: 0 });
      await em.flush();
      em.clear();
      const saved = await em.findOneOrFail(FloorLayoutEntity, { floorId: layout.floorId });
      expect(saved.objects).toEqual(layout.objects);
      store.replaceLayout({ floorId: saved.floorId, revision: layout.revision + 1, walls: saved.walls, openings: saved.openings,
        tiles: saved.tiles, objects: saved.objects, rooms: saved.rooms });
      const restored = new WorkspaceStore(createTestData());
      restored.restoreMutableState(store.exportMutableState());
      expect(restored.getObject(board.id)!.workState).toEqual(board.workState);
      expect(restored.getObject("checklist-persistence")!.workState).toMatchObject({ kind: "checklist", items: [{ completed: true }] });
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
