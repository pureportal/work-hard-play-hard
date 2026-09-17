import { MikroORM } from "@mikro-orm/postgresql";
import { describe, expect, it } from "vitest";
import { Migration20260917120000 } from "../src/migrations/Migration20260917120000.js";
import { createDatabaseConfig } from "../src/persistence/database-config.js";
import { AuthAccountEntity, PasswordResetEntity, RegistrationLinkEntity } from "../src/persistence/entities/auth-entities.js";
import { PostgreSqlAuthRepository } from "../src/persistence/postgresql-auth-repository.js";

describe("authentication PostgreSQL migration", () => {
  it("stores reset and registration records and cascades account removal", async () => {
    const orm = await MikroORM.init(createDatabaseConfig());
    const em = orm.em.fork();
    try {
      await em.begin();
      await em.execute("set local search_path = pg_temp");
      await em.execute('create temporary table "auth_accounts" ("id" varchar(255) primary key, "username" varchar(255) unique not null, "email" varchar(255) unique not null, "password_hash" varchar(255) not null, "created_at" timestamptz not null) on commit drop');
      await em.execute('create temporary table "auth_sessions" ("token_hash" varchar(255) primary key, "user_id" varchar(255) references "auth_accounts" ("id") on delete cascade, "expires_at" timestamptz not null) on commit drop');
      await em.execute('create temporary table "auth_magic_links" ("token_hash" varchar(255) primary key, "user_id" varchar(255) references "auth_accounts" ("id") on delete cascade, "expires_at" timestamptz not null) on commit drop');
      const migration = new Migration20260917120000(orm.em.getDriver(), orm.config);
      migration.setTransactionContext(em.getTransactionContext()!);
      migration.up();
      for (const query of migration.getQueries()) await migration.execute(query);
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + 900_000);
      const userId = "auth-persistence-test";
      await em.upsert(AuthAccountEntity, { id: userId, username: "person", email: "person@example.com", passwordHash: "hashed-password", createdAt });
      await em.upsert(PasswordResetEntity, { tokenHash: "r".repeat(64), userId, expiresAt });
      await em.upsert(RegistrationLinkEntity, { tokenHash: "v".repeat(64), username: "new-user", email: "new@example.com", passwordHash: "pending-hashed-password", expiresAt });
      em.clear();
      const reset = await em.findOneOrFail(PasswordResetEntity, { userId });
      expect(reset.expiresAt).toEqual(expiresAt);
      expect(reset.tokenHash).toBe("r".repeat(64));
      const pending = await em.findOneOrFail(RegistrationLinkEntity, { email: "new@example.com" });
      expect(pending.passwordHash).toBe("pending-hashed-password");
      expect(pending.expiresAt).toEqual(expiresAt);
      const repository = new PostgreSqlAuthRepository({ em });
      const saved = await repository.load();
      expect(saved?.passwordResets).toEqual([{ tokenHash: "r".repeat(64), userId, expiresAt: expiresAt.toISOString() }]);
      expect(saved?.registrationLinks[0]).toMatchObject({ email: "new@example.com", passwordHash: "pending-hashed-password", expiresAt: expiresAt.toISOString() });
      saved!.accounts[0]!.passwordHash = "changed-password-hash";
      saved!.passwordResets = [];
      await repository.save(saved!);
      expect(await repository.load()).toEqual(saved);
      await em.upsert(PasswordResetEntity, { tokenHash: "r".repeat(64), userId, expiresAt });
      await em.nativeDelete(AuthAccountEntity, { id: userId });
      expect(await em.count(PasswordResetEntity)).toBe(0);
      expect(await em.count(RegistrationLinkEntity)).toBe(1);
    } finally {
      if (em.isInTransaction()) await em.rollback();
      await orm.close(true);
    }
  }, 30_000);
});
