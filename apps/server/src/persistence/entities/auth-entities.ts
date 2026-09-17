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

export class PasswordResetEntity {
  tokenHash!: string;
  userId!: string;
  expiresAt!: Date;
}

export class RegistrationLinkEntity {
  tokenHash!: string;
  username!: string;
  email!: string;
  passwordHash!: string;
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

export const passwordResetSchema = new EntitySchema({
  class: PasswordResetEntity,
  tableName: "auth_password_resets",
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

export const registrationLinkSchema = new EntitySchema({
  class: RegistrationLinkEntity,
  tableName: "auth_registration_links",
  properties: {
    tokenHash: { type: String, primary: true, fieldName: "token_hash" },
    username: { type: String },
    email: { type: String, unique: true },
    passwordHash: { type: String, fieldName: "password_hash" },
    expiresAt: { type: Date, fieldName: "expires_at", index: true },
  },
});
