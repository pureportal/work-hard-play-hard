import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { FloorLayout } from "@workhard/shared";
import { WhiteboardImageEntity, WhiteboardImageReferenceEntity } from "./entities/whiteboard-image-entity.js";
import { WHITEBOARD_IMAGE_RECOVERY_MS, whiteboardImageReferences, type WhiteboardImageWrite } from "../work/whiteboard-image-record.js";

export async function lockWhiteboardImages(em: EntityManager) {
  await em.execute("select pg_advisory_xact_lock(978546)");
}

export async function synchronizeWhiteboardImages(em: EntityManager, layouts: FloorLayout[], now = new Date()) {
  const { boardIds, references } = whiteboardImageReferences(layouts);
  const saved = new Set(references.map((reference) => JSON.stringify([reference.imageId, reference.objectId])));
  const existing = await em.findAll(WhiteboardImageReferenceEntity);
  for (const reference of existing) {
    if (!boardIds.has(reference.objectId)) em.remove(reference);
    else if (!saved.has(JSON.stringify([reference.imageId, reference.objectId]))) {
      if (!reference.expiresAt) reference.expiresAt = new Date(now.getTime() + WHITEBOARD_IMAGE_RECOVERY_MS);
      else if (reference.expiresAt <= now) em.remove(reference);
    }
  }
  await em.flush();
  const images = new Set((await em.findAll(WhiteboardImageEntity, { fields: ["id"] })).map((image) => image.id));
  for (const reference of references) {
    if (images.has(reference.imageId)) await em.upsert(WhiteboardImageReferenceEntity, { ...reference, expiresAt: null });
  }
  await em.execute("delete from whiteboard_images i where not exists (select 1 from whiteboard_image_references r where r.image_id = i.id)");
}

export class PostgreSqlWhiteboardImages {
  constructor(private readonly orm: MikroORM) {}

  async save({ objectId, ...image }: WhiteboardImageWrite) {
    await this.orm.em.fork().transactional(async (em) => {
      await lockWhiteboardImages(em);
      await em.upsert(WhiteboardImageEntity, image);
      const reference = await em.findOne(WhiteboardImageReferenceEntity, { imageId: image.id, objectId });
      if (!reference || reference.expiresAt) {
        await em.upsert(WhiteboardImageReferenceEntity, { imageId: image.id, objectId, expiresAt: new Date(Date.now() + WHITEBOARD_IMAGE_RECOVERY_MS) });
      }
    });
  }

  async read(id: string): Promise<Buffer | undefined> {
    const image = await this.orm.em.fork().findOne(WhiteboardImageEntity, { id });
    return image ? Buffer.from(image.image) : undefined;
  }

  async retain(objectId: string, imageIds: string[]): Promise<boolean> {
    return this.orm.em.fork().transactional(async (em) => {
      await lockWhiteboardImages(em);
      const ids = [...new Set(imageIds)];
      if (await em.count(WhiteboardImageEntity, { id: { $in: ids } }) !== ids.length) return false;
      for (const imageId of ids) {
        const reference = await em.findOne(WhiteboardImageReferenceEntity, { imageId, objectId });
        if (!reference || reference.expiresAt) await em.upsert(WhiteboardImageReferenceEntity, { imageId, objectId, expiresAt: new Date(Date.now() + WHITEBOARD_IMAGE_RECOVERY_MS) });
      }
      return true;
    });
  }

  async cleanup() {
    await this.orm.em.fork().transactional(async (em) => {
      await lockWhiteboardImages(em);
      await em.nativeDelete(WhiteboardImageReferenceEntity, { expiresAt: { $lte: new Date() } });
      await em.execute("delete from whiteboard_images i where not exists (select 1 from whiteboard_image_references r where r.image_id = i.id)");
    });
  }
}
