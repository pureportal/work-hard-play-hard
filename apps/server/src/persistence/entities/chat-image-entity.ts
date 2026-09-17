import { EntitySchema } from "@mikro-orm/core";

export class ChatImageEntity {
  id!: string;
  image!: Buffer;
}

export const chatImageSchema = new EntitySchema({
  class: ChatImageEntity,
  tableName: "chat_images",
  properties: {
    id: { type: String, primary: true, length: 36 },
    image: { type: "blob" },
  },
  checks: [{ name: "chat_images_image_check", expression: "octet_length(image) > 0" }],
});
