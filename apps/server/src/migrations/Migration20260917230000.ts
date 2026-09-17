import { Migration } from "@mikro-orm/migrations";

export class Migration20260917230000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" add column "github_app_settings" jsonb null;');
  }
}
