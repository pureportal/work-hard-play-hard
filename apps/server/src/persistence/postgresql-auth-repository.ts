import { IsolationLevel } from "@mikro-orm/core";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { AuthPersistenceState } from "./application-database.js";
import {
  AuthAccountEntity,
  AuthSessionEntity,
  MagicLinkEntity,
  PasswordResetEntity,
  RegistrationLinkEntity,
} from "./entities/index.js";
import { synchronizeRows } from "./synchronize-rows.js";

export class PostgreSqlAuthRepository {
  constructor(private readonly orm: Pick<MikroORM, "em">) {}

  async load(): Promise<AuthPersistenceState | undefined> {
    return this.orm.em.fork({ keepTransactionContext: true }).transactional(async (entityManager) => {
      const accounts = await entityManager.find(AuthAccountEntity, {}, { orderBy: { createdAt: "asc", id: "asc" } });
      if (accounts.length === 0) {
        return undefined;
      }
      const sessions = await entityManager.find(AuthSessionEntity, {}, { orderBy: { expiresAt: "asc" } });
      const magicLinks = await entityManager.find(MagicLinkEntity, {}, { orderBy: { expiresAt: "asc" } });
      const passwordResets = await entityManager.find(PasswordResetEntity, {}, { orderBy: { expiresAt: "asc" } });
      const registrationLinks = await entityManager.find(RegistrationLinkEntity, {}, { orderBy: { expiresAt: "asc" } });
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
        passwordResets: passwordResets.map(({ tokenHash, userId, expiresAt }) => ({
          tokenHash, userId, expiresAt: expiresAt.toISOString(),
        })),
        registrationLinks: registrationLinks.map(({ tokenHash, username, email, passwordHash, expiresAt }) => ({
          tokenHash, username, email, passwordHash, expiresAt: expiresAt.toISOString(),
        })),
      };
    }, {
      isolationLevel: IsolationLevel.REPEATABLE_READ,
      readOnly: true,
    });
  }

  async save(state: AuthPersistenceState): Promise<void> {
    await this.orm.em.fork({ keepTransactionContext: true }).transactional(async (entityManager) => {
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
      await synchronizeRows(entityManager, PasswordResetEntity, "tokenHash", state.passwordResets.map((reset) => ({
        ...reset, expiresAt: new Date(reset.expiresAt),
      })));
      await synchronizeRows(entityManager, RegistrationLinkEntity, "tokenHash", state.registrationLinks.map((link) => ({
        ...link, expiresAt: new Date(link.expiresAt),
      })));
    });
  }

  async clear(entityManager: EntityManager): Promise<void> {
    await entityManager.nativeDelete(RegistrationLinkEntity, {});
    await entityManager.nativeDelete(PasswordResetEntity, {});
    await entityManager.nativeDelete(MagicLinkEntity, {});
    await entityManager.nativeDelete(AuthSessionEntity, {});
    await entityManager.nativeDelete(AuthAccountEntity, {});
  }
}
