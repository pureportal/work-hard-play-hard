import { randomUUID } from "node:crypto";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "../avatar/avatar-record.js";
import type {
  BrandingLogoReference,
  BrandingLogoWrite,
  StoredBrandingLogo,
} from "../branding/branding-logo-record.js";
import type {
  ApplicationDatabase,
  AuthPersistenceState,
  WorkspacePersistenceState,
} from "./application-database.js";

export class MemoryDatabase implements ApplicationDatabase {
  private workspaceState: WorkspacePersistenceState | undefined;
  private authState: AuthPersistenceState | undefined;
  private readonly avatars = new Map<string, StoredAvatar>();
  private brandingLogo: StoredBrandingLogo | undefined;

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

  async getBrandingLogoReference(): Promise<BrandingLogoReference | undefined> {
    return this.brandingLogo ? { version: this.brandingLogo.version } : undefined;
  }

  async saveBrandingLogo(logo: BrandingLogoWrite): Promise<BrandingLogoReference> {
    const version = randomUUID();
    this.brandingLogo = { ...logo, data: Buffer.from(logo.data), version };
    return { version };
  }

  async readBrandingLogo(): Promise<StoredBrandingLogo | undefined> {
    return this.brandingLogo ? { ...this.brandingLogo, data: Buffer.from(this.brandingLogo.data) } : undefined;
  }

  async removeBrandingLogo(): Promise<boolean> {
    if (!this.brandingLogo) {
      return false;
    }
    this.brandingLogo = undefined;
    return true;
  }

  async clear(): Promise<void> {
    this.workspaceState = undefined;
    this.authState = undefined;
    this.avatars.clear();
    this.brandingLogo = undefined;
  }

  async close(): Promise<void> {}
}
