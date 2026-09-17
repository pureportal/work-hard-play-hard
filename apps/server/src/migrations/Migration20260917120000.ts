import { Migration } from "@mikro-orm/migrations";

export class Migration20260917120000 extends Migration {
  override up(): void {
    this.addSql('create table "auth_password_resets" ("token_hash" varchar(255) not null, "user_id" varchar(255) not null, "expires_at" timestamptz not null, constraint "auth_password_resets_pkey" primary key ("token_hash"));');
    this.addSql('create index "auth_password_resets_user_id_index" on "auth_password_resets" ("user_id");');
    this.addSql('create index "auth_password_resets_expires_at_index" on "auth_password_resets" ("expires_at");');
    this.addSql('alter table "auth_password_resets" add constraint "auth_password_resets_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on update cascade on delete cascade;');
    this.addSql('create table "auth_registration_links" ("token_hash" varchar(255) not null, "username" varchar(255) not null, "email" varchar(255) not null, "password_hash" varchar(255) not null, "expires_at" timestamptz not null, constraint "auth_registration_links_pkey" primary key ("token_hash"));');
    this.addSql('alter table "auth_registration_links" add constraint "auth_registration_links_email_unique" unique ("email");');
    this.addSql('create index "auth_registration_links_expires_at_index" on "auth_registration_links" ("expires_at");');
  }

  override down(): void {
    this.addSql('drop table "auth_registration_links";');
    this.addSql('drop table "auth_password_resets";');
  }
}
