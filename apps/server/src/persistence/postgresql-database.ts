import { MikroORM } from "@mikro-orm/postgresql";
import type { SpotifyConnectionRecord } from "../spotify/spotify-record.js";
import { SpotifyConnectionEntity } from "./entities/spotify-entity.js";
import type { GitHubConnectionRecord } from "../github/github-record.js";
import { GitHubConnectionEntity } from "./entities/github-entity.js";
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
import { PostgreSqlAuthRepository } from "./postgresql-auth-repository.js";
import { PostgreSqlBrandingLogoRepository } from "./postgresql-branding-logo-repository.js";
import { createDatabaseConfig, type PostgreSqlEnvironment } from "./database-config.js";
import { PostgreSqlWorkspaceRepository } from "./postgresql-workspace-repository.js";
import { PostgreSqlWhiteboardImages } from "./postgresql-whiteboard-images.js";
import { WhiteboardImageEntity } from "./entities/whiteboard-image-entity.js";
import { ChatImageEntity } from "./entities/chat-image-entity.js";
import type { WhiteboardImageWrite } from "../work/whiteboard-image-record.js";

export class PostgreSqlDatabase implements ApplicationDatabase {
  async saveChatImage(id: string, image: Buffer): Promise<void> {
    await this.orm.em.fork().insert(ChatImageEntity, { id, image });
  }

  async readChatImage(id: string): Promise<Buffer | undefined> {
    const record = await this.orm.em.fork().findOne(ChatImageEntity, { id });
    return record?.image;
  }

  async removeChatImage(id: string): Promise<void> {
    await this.orm.em.fork().nativeDelete(ChatImageEntity, { id });
  }

  async loadGitHubConnections(): Promise<GitHubConnectionRecord[]> {
    const records = await this.orm.em.fork().findAll(GitHubConnectionEntity);
    return records.map(({ userId, encryptedTokens, login }) => ({ userId, encryptedTokens, login }));
  }

  async saveGitHubConnection(record: GitHubConnectionRecord): Promise<void> {
    await this.orm.em.fork().upsert(GitHubConnectionEntity, record);
  }

  async removeGitHubConnection(userId: string): Promise<void> {
    await this.orm.em.fork().nativeDelete(GitHubConnectionEntity, { userId });
  }

  saveWhiteboardImage(image: WhiteboardImageWrite): Promise<void> {
    return new PostgreSqlWhiteboardImages(this.orm).save(image);
  }

  readWhiteboardImage(id: string): Promise<Buffer | undefined> {
    return new PostgreSqlWhiteboardImages(this.orm).read(id);
  }

  retainWhiteboardImages(objectId: string, imageIds: string[]): Promise<boolean> {
    return new PostgreSqlWhiteboardImages(this.orm).retain(objectId, imageIds);
  }

  cleanupWhiteboardImages(): Promise<void> {
    return new PostgreSqlWhiteboardImages(this.orm).cleanup();
  }
  async loadSpotifyConnections(): Promise<SpotifyConnectionRecord[]> {
    const records = await this.orm.em.fork().findAll(SpotifyConnectionEntity);
    return records.map(({ userId, encryptedTokens, sharing }) => ({ userId, encryptedTokens, sharing }));
  }

  async saveSpotifyConnection(record: SpotifyConnectionRecord): Promise<void> {
    await this.orm.em.fork().upsert(SpotifyConnectionEntity, record);
  }

  async removeSpotifyConnection(userId: string): Promise<void> {
    await this.orm.em.fork().nativeDelete(SpotifyConnectionEntity, { userId });
  }
  private readonly authRepository: PostgreSqlAuthRepository;
  private readonly brandingLogoRepository: PostgreSqlBrandingLogoRepository;
  private readonly workspaceRepository: PostgreSqlWorkspaceRepository;

  private constructor(private readonly orm: MikroORM) {
    this.authRepository = new PostgreSqlAuthRepository(orm);
    this.brandingLogoRepository = new PostgreSqlBrandingLogoRepository(orm);
    this.workspaceRepository = new PostgreSqlWorkspaceRepository(orm);
  }

  static async connect(environment: PostgreSqlEnvironment = process.env): Promise<PostgreSqlDatabase> {
    const orm = await MikroORM.init(createDatabaseConfig(environment));
    try {
      await orm.migrator.up();
      return new PostgreSqlDatabase(orm);
    } catch (error) {
      await orm.close(true);
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    return (await this.orm.checkConnection()).ok;
  }

  loadWorkspaceState(): Promise<WorkspacePersistenceState | undefined> {
    return this.workspaceRepository.load();
  }

  saveWorkspaceState(state: WorkspacePersistenceState): Promise<void> {
    return this.workspaceRepository.save(state);
  }

  loadAuthState(): Promise<AuthPersistenceState | undefined> {
    return this.authRepository.load();
  }

  saveAuthState(state: AuthPersistenceState): Promise<void> {
    return this.authRepository.save(state);
  }

  getBrandingLogoReference(): Promise<BrandingLogoReference | undefined> {
    return this.brandingLogoRepository.getReference();
  }

  saveBrandingLogo(logo: BrandingLogoWrite): Promise<BrandingLogoReference> {
    return this.brandingLogoRepository.save(logo);
  }

  readBrandingLogo(): Promise<StoredBrandingLogo | undefined> {
    return this.brandingLogoRepository.read();
  }

  removeBrandingLogo(): Promise<boolean> {
    return this.brandingLogoRepository.remove();
  }

  async clear(): Promise<void> {
    await this.orm.em.fork().transactional(async (entityManager) => {
      await entityManager.nativeDelete(ChatImageEntity, {});
      await entityManager.nativeDelete(GitHubConnectionEntity, {});
      await entityManager.nativeDelete(WhiteboardImageEntity, {});
      await entityManager.nativeDelete(SpotifyConnectionEntity, {});
      await this.brandingLogoRepository.clear(entityManager);
      await this.authRepository.clear(entityManager);
      await this.workspaceRepository.clear(entityManager);
    });
  }

  async close(): Promise<void> {
    await this.orm.close(true);
  }
}
