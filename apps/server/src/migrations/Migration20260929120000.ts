import { Migration } from "@mikro-orm/migrations";

export class Migration20260929120000 extends Migration {
  override up(): void {
    this.addSql('alter table "world_players" add column "seat" jsonb null;');
  }
}
