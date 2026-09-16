import { Migration } from "@mikro-orm/migrations";

export class Migration20260917010000 extends Migration {
  override up(): void {
    this.addSql('update "members" set "character" = "character" - \'gender\' where "character" ? \'gender\';');
  }
}
