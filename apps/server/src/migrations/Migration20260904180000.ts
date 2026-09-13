import { Migration } from "@mikro-orm/migrations";

export class Migration20260904180000 extends Migration {
  override name = "Migration20260904180000";

  override up(): void {
    this.addSql(`
      update "floor_layouts"
      set "objects" = "objects" ||
        '[{"id":"object-tic-tac-toe","floorId":"floor-studio","assetId":"equipment-tic-tac-toe","x":1296,"y":576,"rotation":0,"variantId":"graphite","label":"Tic-Tac-Toe"}]'::jsonb
      where "floor_id" = 'floor-studio'
        and not exists (
          select 1
          from jsonb_array_elements("objects") as "entry"("object")
          where "entry"."object" ->> 'id' = 'object-tic-tac-toe'
        )
    `);
  }

  override down(): void {
    this.addSql(`
      update "floor_layouts" as "layout"
      set "objects" = coalesce((
        select jsonb_agg("entry"."object" order by "entry"."ordinality")
        from jsonb_array_elements("layout"."objects") with ordinality as "entry"("object", "ordinality")
        where "entry"."object" ->> 'id' <> 'object-tic-tac-toe'
      ), '[]'::jsonb)
      where exists (
        select 1
        from jsonb_array_elements("layout"."objects") as "entry"("object")
        where "entry"."object" ->> 'id' = 'object-tic-tac-toe'
      )
    `);
  }
}
