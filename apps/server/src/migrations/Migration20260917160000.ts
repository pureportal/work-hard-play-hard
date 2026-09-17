import { Migration } from "@mikro-orm/migrations";

export class Migration20260917160000 extends Migration {
  override up(): void {
    this.addSql('alter table "meetings" alter column "starts_at" drop not null;');
    this.addSql('alter table "meetings" alter column "duration_minutes" drop not null;');
    this.addSql('alter table "meetings" drop constraint "meetings_status_check";');
    this.addSql('alter table "meetings" add constraint "meetings_status_check" check (status in (\'idle\', \'scheduled\', \'live\', \'ended\'));');
  }
}
