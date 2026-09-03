import { Migration } from "@mikro-orm/migrations";

export class Migration20260904000000 extends Migration {
  override name = "Migration20260904000000";

  override up(): void {
    this.addSql(`
      alter table "workspace_settings"
        add column "registration_settings" jsonb null
    `);
    this.addSql(`
      update "workspace_settings"
      set "registration_settings" = '{"enabled":true,"invitationRequired":true,"whitelistedDomains":[],"defaultRole":"member"}'::jsonb
    `);
    this.addSql(`
      alter table "workspace_settings"
        alter column "registration_settings" set not null
    `);
  }

  override down(): void {
    this.addSql(`
      alter table "workspace_settings"
        drop column "registration_settings"
    `);
  }
}
