import { Migration } from "@mikro-orm/migrations";

export class Migration20260906140000 extends Migration {
  override name = "Migration20260906140000";

  override up(): void {
    this.addSql('alter table "members" add column "character" jsonb null;');
  }

  override down(): void {
    this.addSql('alter table "members" drop column "character";');
  }
}
