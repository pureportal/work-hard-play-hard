import { EntitySchema } from "@mikro-orm/core";

export class PlayerAvatarEntity {
  userId!: string;
  image!: Buffer;
  mimeType!: string;
  width!: number;
  height!: number;
  version!: string;
  updatedAt!: Date;
}

export const playerAvatarSchema = new EntitySchema({
  class: PlayerAvatarEntity,
  tableName: "player_avatars",
  properties: {
    userId: { type: String, primary: true, fieldName: "user_id" },
    image: { type: "blob" },
    mimeType: { type: String, fieldName: "mime_type" },
    width: { type: Number },
    height: { type: Number },
    version: { type: String },
    updatedAt: { type: Date, fieldName: "updated_at" },
  },
  checks: [
    { name: "player_avatars_image_check", expression: "octet_length(image) > 0" },
    { name: "player_avatars_mime_type_check", expression: "mime_type in ('image/webp')" },
    { name: "player_avatars_width_check", expression: "width > 0" },
    { name: "player_avatars_height_check", expression: "height > 0" },
  ],
});
