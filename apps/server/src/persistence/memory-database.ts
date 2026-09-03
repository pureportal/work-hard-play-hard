import { randomUUID } from "node:crypto";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "../avatar/avatar-record.js";
import type {
  ApplicationDatabase,
  AuthPersistenceState,
  WorkspacePersistenceState,
} from "./application-database.js";

export class MemoryDatabase implements ApplicationDatabase {
  private workspaceState: WorkspacePersistenceState | undefined;
  private authState: AuthPersistenceState | undefined;
  private readonly avatars = new Map<string, StoredAvatar>();

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async loadWorkspaceState(): Promise<WorkspacePersistenceState | undefined> {
    return this.workspaceState ? structuredClone(this.workspaceState) : undefined;
  }

  async saveWorkspaceState(state: WorkspacePersistenceState): Promise<void> {
    this.workspaceState = structuredClone(state);
  }

  async loadAuthState(): Promise<AuthPersistenceState | undefined> {
    return this.authState ? structuredClone(this.authState) : undefined;
  }

  async saveAuthState(state: AuthPersistenceState): Promise<void> {
    this.authState = structuredClone(state);
  }

  async getAvatarReferences(): Promise<AvatarReference[]> {
    return Array.from(this.avatars.values(), ({ userId, version }) => ({ userId, version }));
  }

  async saveAvatar(userId: string, avatar: AvatarWrite): Promise<AvatarReference> {
    const stored: StoredAvatar = {
      userId,
      version: randomUUID(),
      data: Buffer.from(avatar.data),
      mimeType: avatar.mimeType,
      width: avatar.width,
      height: avatar.height,
    };
    this.avatars.set(userId, stored);
    return { userId, version: stored.version };
  }

  async readAvatar(userId: string): Promise<StoredAvatar | undefined> {
    const avatar = this.avatars.get(userId);
    return avatar ? { ...avatar, data: Buffer.from(avatar.data) } : undefined;
  }

  async removeAvatar(userId: string): Promise<boolean> {
    return this.avatars.delete(userId);
  }

  async clear(): Promise<void> {
    this.workspaceState = undefined;
    this.authState = undefined;
    this.avatars.clear();
  }

  async close(): Promise<void> {}
}
