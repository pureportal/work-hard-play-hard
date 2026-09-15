import { Migration } from "@mikro-orm/migrations";

export class Migration20260915200000 extends Migration {
  override up(): void {
    this.addSql('create table "github_connections" ("user_id" varchar(255) not null, "encrypted_tokens" text null, "login" varchar(255) null, constraint "github_connections_pkey" primary key ("user_id"));');
    this.addSql('alter table "github_connections" add constraint "github_connections_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on update cascade on delete cascade;');
  }
}
