import { Migration } from "@mikro-orm/migrations";

export class Migration20260915220000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" add column "floor_spawns" jsonb;');
    this.addSql(`update "workspace_settings" set "floor_spawns" = '{"floor-studio":{"x":770,"y":890},"floor-rooftop":{"x":640,"y":710}}'::jsonb;`);
    this.addSql('alter table "workspace_settings" alter column "floor_spawns" set not null;');
  }

  override down(): void {
    this.addSql('alter table "workspace_settings" drop column "floor_spawns";');
  }
}
