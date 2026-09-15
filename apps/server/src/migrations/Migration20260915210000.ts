import { Migration } from "@mikro-orm/migrations";

export class Migration20260915210000 extends Migration {
  override up(): void {
    this.addSql('update "members" set "character" = "character" - \'breastSize\' where "character" ? \'breastSize\';');
  }
}
