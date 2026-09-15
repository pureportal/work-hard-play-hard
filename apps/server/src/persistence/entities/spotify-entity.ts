import { EntitySchema } from "@mikro-orm/core";
import { AuthAccountEntity } from "./auth-entities.js";

export class SpotifyConnectionEntity {
  userId!: string;
  encryptedTokens!: string | null;
  sharing!: boolean;
}

export const spotifyConnectionSchema = new EntitySchema({
  class: SpotifyConnectionEntity,
  tableName: "spotify_connections",
  properties: {
    userId: {
      kind: "m:1", entity: () => AuthAccountEntity, primary: true,
      fieldName: "user_id", mapToPk: true, deleteRule: "cascade",
    } as never,
    encryptedTokens: { type: "text", fieldName: "encrypted_tokens", nullable: true },
    sharing: { type: Boolean },
  },
});
