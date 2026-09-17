import { randomUUID } from "node:crypto";
import { WHITEBOARD_IMAGE_RECOVERY_MS, whiteboardImageReferences, type WhiteboardImageWrite } from "../work/whiteboard-image-record.js";
import type { SpotifyConnectionRecord } from "../spotify/spotify-record.js";
import type { GitHubConnectionRecord } from "../github/github-record.js";
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
  private readonly chatImages = new Map<string, Buffer>();

  async saveChatImage(id: string, image: Buffer): Promise<void> {
    if (this.chatImages.has(id)) throw new Error("CHAT_IMAGE_EXISTS");
    this.chatImages.set(id, Buffer.from(image));
  }

  async readChatImage(id: string): Promise<Buffer | undefined> {
    const image = this.chatImages.get(id);
    return image ? Buffer.from(image) : undefined;
  }

  async removeChatImage(id: string): Promise<void> {
    this.chatImages.delete(id);
  }

  private readonly githubConnections = new Map<string, GitHubConnectionRecord>();

  async loadGitHubConnections(): Promise<GitHubConnectionRecord[]> {
    return structuredClone([...this.githubConnections.values()]);
  }

  async saveGitHubConnection(record: GitHubConnectionRecord): Promise<void> {
    this.githubConnections.set(record.userId, structuredClone(record));
  }

  async removeGitHubConnection(userId: string): Promise<void> {
    this.githubConnections.delete(userId);
  }

  private readonly whiteboardImages = new Map<string, Buffer>();
  private readonly whiteboardReferences = new Map<string, { imageId: string; objectId: string; expiresAt: number | null }>();

  async saveWhiteboardImage({ id, image, objectId }: WhiteboardImageWrite): Promise<void> {
    this.whiteboardImages.set(id, Buffer.from(image));
    const key = JSON.stringify([id, objectId]);
    const reference = this.whiteboardReferences.get(key);
    if (!reference || reference.expiresAt !== null) {
      this.whiteboardReferences.set(key, { imageId: id, objectId, expiresAt: Date.now() + WHITEBOARD_IMAGE_RECOVERY_MS });
    }
  }

  async readWhiteboardImage(id: string): Promise<Buffer | undefined> {
    const image = this.whiteboardImages.get(id);
    return image ? Buffer.from(image) : undefined;
  }

  async retainWhiteboardImages(objectId: string, imageIds: string[]): Promise<boolean> {
    if (imageIds.some((id) => !this.whiteboardImages.has(id))) return false;
    for (const imageId of imageIds) {
      const key = JSON.stringify([imageId, objectId]);
      const reference = this.whiteboardReferences.get(key);
      if (!reference || reference.expiresAt !== null) this.whiteboardReferences.set(key, { imageId, objectId, expiresAt: Date.now() + WHITEBOARD_IMAGE_RECOVERY_MS });
    }
    return true;
  }

  async cleanupWhiteboardImages(): Promise<void> {
    for (const [key, reference] of this.whiteboardReferences) {
      if (reference.expiresAt !== null && reference.expiresAt <= Date.now()) this.whiteboardReferences.delete(key);
    }
    const used = new Set([...this.whiteboardReferences.values()].map((reference) => reference.imageId));
    for (const id of this.whiteboardImages.keys()) if (!used.has(id)) this.whiteboardImages.delete(id);
  }
  private readonly spotifyConnections = new Map<string, SpotifyConnectionRecord>();

  async loadSpotifyConnections(): Promise<SpotifyConnectionRecord[]> {
    return structuredClone([...this.spotifyConnections.values()]);
  }

  async saveSpotifyConnection(record: SpotifyConnectionRecord): Promise<void> {
    this.spotifyConnections.set(record.userId, structuredClone(record));
  }

  async removeSpotifyConnection(userId: string): Promise<void> {
    this.spotifyConnections.delete(userId);
  }
  private workspaceState: WorkspacePersistenceState | undefined;
  private authState: AuthPersistenceState | undefined;
  private brandingLogo: StoredBrandingLogo | undefined;

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async loadWorkspaceState(): Promise<WorkspacePersistenceState | undefined> {
    return this.workspaceState ? structuredClone(this.workspaceState) : undefined;
  }

  async saveWorkspaceState(state: WorkspacePersistenceState): Promise<void> {
    this.workspaceState = structuredClone(state);
    const { boardIds, references } = whiteboardImageReferences(state.store.layouts);
    const saved = new Set(references.map(({ imageId, objectId }) => JSON.stringify([imageId, objectId])));
    for (const [key, reference] of this.whiteboardReferences) {
      if (!boardIds.has(reference.objectId)) this.whiteboardReferences.delete(key);
      else if (!saved.has(key) && reference.expiresAt === null) reference.expiresAt = Date.now() + WHITEBOARD_IMAGE_RECOVERY_MS;
    }
    for (const reference of references) {
      if (this.whiteboardImages.has(reference.imageId)) this.whiteboardReferences.set(JSON.stringify([reference.imageId, reference.objectId]), { ...reference, expiresAt: null });
    }
    await this.cleanupWhiteboardImages();
  }

  async loadAuthState(): Promise<AuthPersistenceState | undefined> {
    return this.authState ? structuredClone(this.authState) : undefined;
  }

  async saveAuthState(state: AuthPersistenceState): Promise<void> {
    this.authState = structuredClone(state);
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
    this.chatImages.clear();
    this.githubConnections.clear();
    this.whiteboardImages.clear();
    this.whiteboardReferences.clear();
    this.spotifyConnections.clear();
    this.workspaceState = undefined;
    this.authState = undefined;
    this.brandingLogo = undefined;
  }

  async close(): Promise<void> {}
}
