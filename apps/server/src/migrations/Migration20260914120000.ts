import { Migration } from "@mikro-orm/migrations";

export class Migration20260914120000 extends Migration {
  override name = "Migration20260914120000";

  override up(): void {
    this.addSql('alter table "game_scores" add column "falling_blocks" jsonb null;');
    this.addSql('alter table "player_game_statistics" add column "falling_blocks" jsonb null, add column "holds_crown" boolean not null default false;');
    this.addSql('create unique index "player_game_statistics_crown_unique" on "player_game_statistics" ("definition_id") where "holds_crown" = true;');
  }
}
