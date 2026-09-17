import { Migration } from "@mikro-orm/migrations";

export class Migration20260917175500 extends Migration {
  override up(): void {
    this.addSql('alter table "invitations" drop column "permissions";');
    this.addSql("update members set permissions = case when role in ('owner', 'admin') then '[\"manage_members\"]'::jsonb else '[]'::jsonb end;");
  }
}
