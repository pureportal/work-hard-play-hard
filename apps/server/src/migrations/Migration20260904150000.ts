import { Migration } from "@mikro-orm/migrations";

export class Migration20260904150000 extends Migration {
  override name = "Migration20260904150000";

  override up(): void {
    this.addSql(`
      create table "chess_matches" (
        "id" varchar(255) primary key,
        "state" jsonb not null,
        "created_at" timestamptz not null,
        "updated_at" timestamptz not null,
        "sort_order" integer not null,
        constraint "chess_matches_sort_order_check" check ("sort_order" >= 0)
      )
    `);
    this.addSql('create index "chess_matches_created_at_index" on "chess_matches" ("created_at")');
    this.addSql('create index "chess_matches_updated_at_index" on "chess_matches" ("updated_at")');
    this.addSql(`
      update "floor_layouts"
      set "objects" = "objects" ||
        '[{"id":"object-chess","floorId":"floor-studio","assetId":"equipment-chess","x":1360,"y":736,"rotation":0,"variantId":"graphite","label":"Chess"}]'::jsonb
      where "floor_id" = 'floor-studio'
        and not exists (
          select 1
          from jsonb_array_elements("objects") as "entry"("object")
          where "entry"."object" ->> 'id' = 'object-chess'
        )
    `);
  }

  override down(): void {
    this.addSql(`
      update "floor_layouts" as "layout"
      set "objects" = coalesce((
        select jsonb_agg("entry"."object" order by "entry"."ordinality")
        from jsonb_array_elements("layout"."objects") with ordinality as "entry"("object", "ordinality")
        where "entry"."object" ->> 'id' <> 'object-chess'
      ), '[]'::jsonb)
      where exists (
        select 1
        from jsonb_array_elements("layout"."objects") as "entry"("object")
        where "entry"."object" ->> 'id' = 'object-chess'
      )
    `);
    this.addSql('drop table if exists "chess_matches" cascade');
  }
}
