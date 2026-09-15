import { EntitySchema } from "@mikro-orm/core";
import { AuthAccountEntity } from "./auth-entities.js";

export class GitHubConnectionEntity {
  userId!: string;
  encryptedTokens!: string | null;
  login!: string | null;
}

export const githubConnectionSchema = new EntitySchema({
  class: GitHubConnectionEntity,
  tableName: "github_connections",
  properties: {
    userId: { kind: "m:1", entity: () => AuthAccountEntity, primary: true,
      fieldName: "user_id", mapToPk: true, deleteRule: "cascade" } as never,
    encryptedTokens: { type: "text", fieldName: "encrypted_tokens", nullable: true },
    login: { type: "string", nullable: true },
  },
});
