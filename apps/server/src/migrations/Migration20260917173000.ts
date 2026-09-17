import { Migration } from "@mikro-orm/migrations";

export class Migration20260917173000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" add column "spotify_app_settings" jsonb null;');
    this.addSql("update workspace_settings set organisation = organisation - 'removalVotes';");
    this.addSql("update members set permissions = '[\"manage_members\"]'::jsonb where role in ('owner', 'admin');");
  }
}
