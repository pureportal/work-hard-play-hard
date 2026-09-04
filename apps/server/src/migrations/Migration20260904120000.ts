import { Migration } from "@mikro-orm/migrations";

export class Migration20260904120000 extends Migration {
  override name = "Migration20260904120000";

  override up(): void {
    this.addSql(`
      alter table "workspace_settings"
        add column "corporate_identity" jsonb null
    `);
    this.addSql(`
      update "workspace_settings"
      set "corporate_identity" = '{"applicationName":"Northstar","primaryColor":"#6757e8","secondaryColor":"#ee9571","authenticationLayout":"split"}'::jsonb
    `);
    this.addSql(`
      alter table "workspace_settings"
        alter column "corporate_identity" set not null
    `);
    this.addSql(`
      create table "branding_logos" (
        "id" varchar(255) primary key,
        "image" bytea not null,
        "mime_type" varchar(255) not null,
        "width" integer not null,
        "height" integer not null,
        "version" varchar(255) not null,
        "updated_at" timestamptz not null,
        constraint "branding_logos_image_check" check (octet_length(image) > 0),
        constraint "branding_logos_mime_type_check" check (mime_type in ('image/webp')),
        constraint "branding_logos_width_check" check (width > 0),
        constraint "branding_logos_height_check" check (height > 0)
      )
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "branding_logos" cascade');
    this.addSql(`
      alter table "workspace_settings"
        drop column "corporate_identity"
    `);
  }
}
