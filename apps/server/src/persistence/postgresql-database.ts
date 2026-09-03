import { MikroORM } from "@mikro-orm/postgresql";
import type { AvatarReference, AvatarWrite, StoredAvatar } from "../avatar/avatar-record.js";
import type {
  ApplicationDatabase,
  AuthPersistenceState,
  WorkspacePersistenceState,
} from "./application-database.js";
import { PostgreSqlAuthRepository } from "./postgresql-auth-repository.js";
import { PostgreSqlAvatarRepository } from "./postgresql-avatar-repository.js";
import { createDatabaseConfig, type PostgreSqlEnvironment } from "./database-config.js";
import { PostgreSqlWorkspaceRepository } from "./postgresql-workspace-repository.js";

export class PostgreSqlDatabase implements ApplicationDatabase {
  private readonly authRepository: PostgreSqlAuthRepository;
  private readonly avatarRepository: PostgreSqlAvatarRepository;
  private readonly workspaceRepository: PostgreSqlWorkspaceRepository;

  private constructor(private readonly orm: MikroORM) {
    this.authRepository = new PostgreSqlAuthRepository(orm);
    this.avatarRepository = new PostgreSqlAvatarRepository(orm);
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

  getAvatarReferences(): Promise<AvatarReference[]> {
    return this.avatarRepository.getReferences();
  }

  saveAvatar(userId: string, avatar: AvatarWrite): Promise<AvatarReference> {
    return this.avatarRepository.save(userId, avatar);
  }

  readAvatar(userId: string): Promise<StoredAvatar | undefined> {
    return this.avatarRepository.read(userId);
  }

  removeAvatar(userId: string): Promise<boolean> {
    return this.avatarRepository.remove(userId);
  }

  async clear(): Promise<void> {
    await this.orm.em.fork().transactional(async (entityManager) => {
      await this.avatarRepository.clear(entityManager);
      await this.authRepository.clear(entityManager);
      await this.workspaceRepository.clear(entityManager);
    });
  }

  async close(): Promise<void> {
    await this.orm.close(true);
  }
}
