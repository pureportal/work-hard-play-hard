import { createTestData } from "../src/testing/workspace-data.js";
import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import type { WorldObject } from "@workhard/shared";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { WhiteboardImageEntity, WhiteboardImageReferenceEntity } from "../src/persistence/entities/whiteboard-image-entity.js";
import { synchronizeWhiteboardImages } from "../src/persistence/postgresql-whiteboard-images.js";
import { WorkspaceStore } from "../src/store.js";

describe("PostgreSQL whiteboard image lifecycle", () => {
  it("round-trips bytea and keeps shared images until their final reference expires or board is deleted", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "whiteboard_images" (like public."whiteboard_images" including all) on commit drop');
      await em.execute('create temporary table "whiteboard_image_references" (like public."whiteboard_image_references" including all) on commit drop');
      const id = "a".repeat(64);
      const image = Buffer.from([0, 1, 2, 255, 127]);
      await em.upsert(WhiteboardImageEntity, { id, image, width: 800, height: 400 });
      em.clear();
      expect((await em.findOneOrFail(WhiteboardImageEntity, { id })).image).toEqual(image);
      const store = new WorkspaceStore(createTestData());
      const layout = store.getLayout("floor-studio")!;
      const board: WorldObject = { id: "image-board", floorId: layout.floorId, assetId: "equipment-whiteboard", rotation: 0, x: 60, y: 60,
        workState: { kind: "whiteboard", revision: 1, document: { text: "", cards: [{ id: "image", kind: "image", src: `/v1/whiteboards/images/${id}`, title: "", text: "", color: "blue", status: "todo", dueDate: "", x: 0, y: 0, width: 240, height: 220 }] } } };
      const second = { ...board, id: "second-board" };
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [board, second] }]);
      expect(await em.count(WhiteboardImageReferenceEntity)).toBe(2);
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [second] }]);
      expect(await em.count(WhiteboardImageEntity)).toBe(1);
      expect(await em.count(WhiteboardImageReferenceEntity)).toBe(1);
      const empty = { ...second, workState: { kind: "whiteboard" as const, revision: 2, document: { text: "", cards: [] } } };
      const now = new Date();
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [empty] }], now);
      expect((await em.findOneOrFail(WhiteboardImageReferenceEntity, { imageId: id, objectId: second.id })).expiresAt).toEqual(new Date(now.getTime() + 3600000));
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [second] }], new Date(now.getTime() + 1000));
      expect((await em.findOneOrFail(WhiteboardImageReferenceEntity, { imageId: id, objectId: second.id })).expiresAt).toBeNull();
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [empty] }], now);
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [empty] }], new Date(now.getTime() + 3600001));
      expect(await em.count(WhiteboardImageEntity)).toBe(0);
      await em.upsert(WhiteboardImageEntity, { id, image, width: 800, height: 400 });
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [board] }]);
      await synchronizeWhiteboardImages(em, [{ ...layout, objects: [] }]);
      expect(await em.count(WhiteboardImageReferenceEntity)).toBe(0);
      expect(await em.count(WhiteboardImageEntity)).toBe(0);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30000);
});
