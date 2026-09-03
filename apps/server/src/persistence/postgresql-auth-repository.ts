import { IsolationLevel } from "@mikro-orm/core";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { AuthPersistenceState } from "./application-database.js";
import {
  AuthAccountEntity,
  AuthSessionEntity,
  MagicLinkEntity,
} from "./entities/index.js";
import { synchronizeRows } from "./synchronize-rows.js";

export class PostgreSqlAuthRepository {
  constructor(private readonly orm: MikroORM) {}

  async load(): Promise<AuthPersistenceState | undefined> {
    return this.orm.em.fork().transactional(async (entityManager) => {
      const accounts = await entityManager.find(AuthAccountEntity, {}, { orderBy: { createdAt: "asc", id: "asc" } });
      if (accounts.length === 0) {
        return undefined;
      }
      const sessions = await entityManager.find(AuthSessionEntity, {}, { orderBy: { expiresAt: "asc" } });
      const magicLinks = await entityManager.find(MagicLinkEntity, {}, { orderBy: { expiresAt: "asc" } });
      return {
        accounts: accounts.map((account) => ({
          id: account.id,
          username: account.username,
          email: account.email,
          passwordHash: account.passwordHash,
          createdAt: account.createdAt.toISOString(),
        })),
        sessions: sessions.map((session) => ({
          tokenHash: session.tokenHash,
          userId: session.userId,
          expiresAt: session.expiresAt.toISOString(),
        })),
        magicLinks: magicLinks.map((magicLink) => ({
          tokenHash: magicLink.tokenHash,
          userId: magicLink.userId,
          expiresAt: magicLink.expiresAt.toISOString(),
        })),
      };
    }, {
      isolationLevel: IsolationLevel.REPEATABLE_READ,
      readOnly: true,
    });
  }

  async save(state: AuthPersistenceState): Promise<void> {
    await this.orm.em.fork().transactional(async (entityManager) => {
      await synchronizeRows(entityManager, AuthAccountEntity, "id", state.accounts.map((account) => ({
        id: account.id,
        username: account.username,
        email: account.email,
        passwordHash: account.passwordHash,
        createdAt: new Date(account.createdAt),
      })));
      await synchronizeRows(entityManager, AuthSessionEntity, "tokenHash", state.sessions.map((session) => ({
        tokenHash: session.tokenHash,
        userId: session.userId,
        expiresAt: new Date(session.expiresAt),
      })));
      await synchronizeRows(entityManager, MagicLinkEntity, "tokenHash", state.magicLinks.map((magicLink) => ({
        tokenHash: magicLink.tokenHash,
        userId: magicLink.userId,
        expiresAt: new Date(magicLink.expiresAt),
      })));
    });
  }

  async clear(entityManager: EntityManager): Promise<void> {
    await entityManager.nativeDelete(MagicLinkEntity, {});
    await entityManager.nativeDelete(AuthSessionEntity, {});
    await entityManager.nativeDelete(AuthAccountEntity, {});
  }
}
