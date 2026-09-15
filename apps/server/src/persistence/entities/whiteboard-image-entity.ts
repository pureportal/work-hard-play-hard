import { EntitySchema } from "@mikro-orm/core";

export class WhiteboardImageEntity {
  id!: string;
  image!: Buffer;
  width!: number;
  height!: number;
}

export class WhiteboardImageReferenceEntity {
  imageId!: string;
  objectId!: string;
  expiresAt!: Date | null;
}

export const whiteboardImageSchema = new EntitySchema({
  class: WhiteboardImageEntity,
  tableName: "whiteboard_images",
  properties: {
    id: { type: String, primary: true, length: 64 },
    image: { type: "blob" },
    width: { type: Number },
    height: { type: Number },
  },
  checks: [{ name: "whiteboard_images_data_check", expression: "octet_length(image) > 0 and width > 0 and height > 0" }],
});

export const whiteboardImageReferenceSchema = new EntitySchema({
  class: WhiteboardImageReferenceEntity,
  tableName: "whiteboard_image_references",
  properties: {
    imageId: { kind: "m:1", entity: () => WhiteboardImageEntity, primary: true, fieldName: "image_id", mapToPk: true, deleteRule: "cascade", updateRule: "cascade" } as never,
    objectId: { type: String, primary: true, fieldName: "object_id" },
    expiresAt: { type: Date, fieldName: "expires_at", nullable: true, index: true },
  },
});
