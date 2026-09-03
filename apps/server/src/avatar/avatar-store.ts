import type { ApplicationDatabase } from "../persistence/application-database.js";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "./avatar-record.js";

export type { AvatarReference, AvatarWrite, StoredAvatar } from "./avatar-record.js";

export class AvatarStore {
  constructor(private readonly database: ApplicationDatabase) {}

  save(userId: string, avatar: AvatarWrite): Promise<AvatarReference> {
    return this.database.saveAvatar(userId, avatar);
  }

  read(userId: string): Promise<StoredAvatar | undefined> {
    return this.database.readAvatar(userId);
  }

  getReferences(): Promise<AvatarReference[]> {
    return this.database.getAvatarReferences();
  }

  remove(userId: string): Promise<boolean> {
    return this.database.removeAvatar(userId);
  }
}
