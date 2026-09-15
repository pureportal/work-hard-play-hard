import { Migration } from "@mikro-orm/migrations";

export class Migration20260915160000 extends Migration {
  override up(): void {
    this.addSql('create table "spotify_connections" ("user_id" varchar(255) not null, "encrypted_tokens" text null, "sharing" boolean not null, constraint "spotify_connections_pkey" primary key ("user_id"));');
    this.addSql('alter table "spotify_connections" add constraint "spotify_connections_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on update cascade on delete cascade;');
  }
}
