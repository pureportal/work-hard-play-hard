import { Migration } from "@mikro-orm/migrations";

export class Migration20260918120000 extends Migration {
  override up(): void {
    this.addSql(`create table "game_guide_states" (
      "user_id" varchar(255) not null,
      "status" text check ("status" in ('started', 'skipped', 'completed')) not null,
      constraint "game_guide_states_pkey" primary key ("user_id"),
      constraint "game_guide_states_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on update cascade on delete cascade
    );`);
  }
}
