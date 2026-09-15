import { Migration } from "@mikro-orm/migrations";

export class Migration20260916010000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" add column "floors" jsonb;');
    this.addSql(`update workspace_settings settings set floors = (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', layout.floor_id, 'officeId', 'office', 'name', 'Floor ' || (layout.sort_order + 1),
        'level', layout.sort_order + 1,
        'width', case layout.floor_id when 'floor-rooftop' then 1408 else 1792 end,
        'height', case layout.floor_id when 'floor-rooftop' then 896 else 1088 end,
        'spawn', settings.floor_spawns->layout.floor_id,
        'background', case layout.floor_id when 'floor-rooftop' then '#dbe6dc' else '#e5ded3' end
      ) order by layout.sort_order), '[]'::jsonb) from floor_layouts layout
    );`);
    this.addSql('alter table "workspace_settings" alter column "floors" set not null;');
    this.addSql('alter table "workspace_settings" drop column "floor_spawns";');
  }
}
