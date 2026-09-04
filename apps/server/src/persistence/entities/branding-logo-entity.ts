import { EntitySchema } from "@mikro-orm/core";

export class BrandingLogoEntity {
  id!: string;
  image!: Buffer;
  mimeType!: string;
  width!: number;
  height!: number;
  version!: string;
  updatedAt!: Date;
}

export const brandingLogoSchema = new EntitySchema({
  class: BrandingLogoEntity,
  tableName: "branding_logos",
  properties: {
    id: { type: String, primary: true },
    image: { type: "blob" },
    mimeType: { type: String, fieldName: "mime_type" },
    width: { type: Number },
    height: { type: Number },
    version: { type: String },
    updatedAt: { type: Date, fieldName: "updated_at" },
  },
  checks: [
    { name: "branding_logos_image_check", expression: "octet_length(image) > 0" },
    { name: "branding_logos_mime_type_check", expression: "mime_type in ('image/webp')" },
    { name: "branding_logos_width_check", expression: "width > 0" },
    { name: "branding_logos_height_check", expression: "height > 0" },
  ],
});
