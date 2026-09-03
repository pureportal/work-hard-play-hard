import { randomUUID } from "node:crypto";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "../avatar/avatar-record.js";
import { PlayerAvatarEntity } from "./entities/index.js";

export class PostgreSqlAvatarRepository {
  constructor(private readonly orm: MikroORM) {}

  async getReferences(): Promise<AvatarReference[]> {
    const avatars = await this.orm.em.fork().find(PlayerAvatarEntity, {}, { fields: ["userId", "version"] });
    return avatars.map((avatar) => ({ userId: avatar.userId, version: avatar.version }));
  }

  async save(userId: string, avatar: AvatarWrite): Promise<AvatarReference> {
    const version = randomUUID();
    await this.orm.em.fork().upsert(PlayerAvatarEntity, {
      userId,
      image: avatar.data,
      mimeType: avatar.mimeType,
      width: avatar.width,
      height: avatar.height,
      version,
      updatedAt: new Date(),
    });
    return { userId, version };
  }

  async read(userId: string): Promise<StoredAvatar | undefined> {
    const avatar = await this.orm.em.fork().findOne(PlayerAvatarEntity, { userId });
    if (!avatar) {
      return undefined;
    }
    return {
      userId: avatar.userId,
      data: Buffer.from(avatar.image),
      mimeType: "image/webp",
      width: avatar.width,
      height: avatar.height,
      version: avatar.version,
    };
  }

  async remove(userId: string): Promise<boolean> {
    return (await this.orm.em.fork().nativeDelete(PlayerAvatarEntity, { userId })) > 0;
  }

  async clear(entityManager: EntityManager): Promise<void> {
    await entityManager.nativeDelete(PlayerAvatarEntity, {});
  }
}
