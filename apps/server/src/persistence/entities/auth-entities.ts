import { EntitySchema } from "@mikro-orm/core";

export class AuthAccountEntity {
  id!: string;
  username!: string;
  email!: string;
  passwordHash!: string;
  createdAt!: Date;
}

export class AuthSessionEntity {
  tokenHash!: string;
  userId!: string;
  expiresAt!: Date;
}

export class MagicLinkEntity {
  tokenHash!: string;
  userId!: string;
  expiresAt!: Date;
}

export const authAccountSchema = new EntitySchema({
  class: AuthAccountEntity,
  tableName: "auth_accounts",
  properties: {
    id: { type: String, primary: true },
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    passwordHash: { type: String, fieldName: "password_hash" },
    createdAt: { type: Date, fieldName: "created_at" },
  },
});

export const authSessionSchema = new EntitySchema({
  class: AuthSessionEntity,
  tableName: "auth_sessions",
  properties: {
    tokenHash: { type: String, primary: true, fieldName: "token_hash" },
    userId: {
      kind: "m:1",
      entity: () => AuthAccountEntity,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
      index: true,
    } as never,
    expiresAt: { type: Date, fieldName: "expires_at", index: true },
  },
});

export const magicLinkSchema = new EntitySchema({
  class: MagicLinkEntity,
  tableName: "auth_magic_links",
  properties: {
    tokenHash: { type: String, primary: true, fieldName: "token_hash" },
    userId: {
      kind: "m:1",
      entity: () => AuthAccountEntity,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
      index: true,
    } as never,
    expiresAt: { type: Date, fieldName: "expires_at", index: true },
  },
});
