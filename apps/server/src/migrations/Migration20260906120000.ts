import { Migration } from "@mikro-orm/migrations";

export class Migration20260906120000 extends Migration {
  override name = "Migration20260906120000";

  override up(): void {
    this.addSql(`
      update "floor_layouts" as "layout"
      set "objects" = coalesce((
        select jsonb_agg("entry"."object" order by "entry"."ordinality")
        from jsonb_array_elements("layout"."objects") with ordinality as "entry"("object", "ordinality")
        where not ("entry"."object" @> '{"id":"object-arcade-b","assetId":"equipment-arcade","label":"Dash"}'::jsonb)
      ), '[]'::jsonb), "revision" = "revision" + 1
      where "floor_id" = 'floor-studio'
        and exists (select 1 from jsonb_array_elements("layout"."objects") as "object"
          where "object" @> '{"id":"object-arcade-b","assetId":"equipment-arcade","label":"Dash"}'::jsonb)
    `);
  }
}
