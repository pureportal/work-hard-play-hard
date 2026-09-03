import { Migration } from "@mikro-orm/migrations";

const DEFAULT_VARIANT_BY_ASSET = {
  "desk-straight": "sage",
  "desk-corner": "sage",
  "chair-office": "white",
  "sofa-straight": "white",
  "sofa-corner": "white",
  "table-meeting": "oak",
  "table-workbench": "oak",
  "table-cafe": "oak",
  "plant-floor": "forest",
  "plant-planter-row": "forest",
  "outdoor-garden-bed": "forest",
  "outdoor-pool": "coastal",
  "decor-desk-plant": "forest",
  "decor-laptop": "graphite",
  "decor-lamp": "graphite",
  "equipment-whiteboard": "graphite",
  "equipment-arcade": "graphite",
  "equipment-gong": "graphite",
  "equipment-tetris": "graphite",
  "desk-standing": "sage",
  "chair-lounge": "white",
  "table-round": "oak",
  "plant-palm": "forest",
  "outdoor-bench": "white",
  "decor-monitor": "graphite",
  "decor-coffee": "graphite",
  "equipment-bookshelf": "graphite",
  "floor-tile": "wood",
  "infrastructure-portal": "violet",
} as const;

export class Migration20260903210000 extends Migration {
  override name = "Migration20260903210000";

  override up(): void {
    const variantDefaults = JSON.stringify(DEFAULT_VARIANT_BY_ASSET).replaceAll("'", "''");

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from "floor_layouts" as "layout"
          cross join jsonb_array_elements("layout"."objects") as "entry"("object")
          where jsonb_typeof("entry"."object" -> 'variantId') is distinct from 'string'
            and not coalesce('${variantDefaults}'::jsonb ? ("entry"."object" ->> 'assetId'), false)
        ) then
          raise exception 'LAYOUT_OBJECT_ASSET_UNKNOWN';
        end if;
      end
      $$
    `);

    this.addSql(`
      update "floor_layouts" as "layout"
      set "objects" = (
        select coalesce(
          jsonb_agg(
            case
              when jsonb_typeof("entry"."object" -> 'variantId') = 'string'
                then "entry"."object"
              else "entry"."object" || jsonb_build_object(
                'variantId',
                '${variantDefaults}'::jsonb ->> ("entry"."object" ->> 'assetId')
              )
            end
            order by "entry"."ordinality"
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements("layout"."objects") with ordinality as "entry"("object", "ordinality")
      )
      where exists (
        select 1
        from jsonb_array_elements("layout"."objects") as "entry"("object")
        where jsonb_typeof("entry"."object" -> 'variantId') is distinct from 'string'
      )
    `);
  }
}
