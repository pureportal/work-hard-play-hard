import { Migration } from "@mikro-orm/migrations";

export class Migration20260916030000 extends Migration {
  override up(): void {
    this.addSql(`
      do $$ begin
        if exists (
          select 1 from floor_layouts, jsonb_array_elements(objects) as object
          where object ->> 'assetId' = 'floor-tile' and coalesce(object ->> 'variantId', '') not in ('wood', 'stone', 'grass')
        ) then raise exception 'FLOOR_DESIGN_UNKNOWN'; end if;
      end $$
    `);
    this.addSql(`
      update owned_assets as owned set asset_id = coalesce((
        select case object ->> 'variantId'
          when 'stone' then 'floor-stone-tiles'
          when 'grass' then 'floor-grass'
          when 'wood' then 'floor-wood'
        end
        from floor_layouts, jsonb_array_elements(objects) as object
        where object ->> 'ownedAssetId' = owned.id and object ->> 'assetId' = 'floor-tile'
      ), 'floor-wood') where owned.asset_id = 'floor-tile'
    `);
    this.addSql(`
      update coin_transactions as purchase
      set asset_id = owned.asset_id, operation_fingerprint = 'shop_purchase:' || owned.asset_id
      from owned_assets as owned
      where purchase.owned_asset_id = owned.id and purchase.asset_id = 'floor-tile'
    `);
    this.addSql(`
      update floor_layouts as layout set objects = (
        select jsonb_agg(case when object ->> 'assetId' = 'floor-tile' then object ||
          case object ->> 'variantId'
            when 'wood' then '{"assetId":"floor-wood","variantId":"oak"}'::jsonb
            when 'stone' then '{"assetId":"floor-stone-tiles","variantId":"limestone"}'::jsonb
            when 'grass' then '{"assetId":"floor-grass","variantId":"lawn"}'::jsonb
          end
          else object end order by ordinal)
        from jsonb_array_elements(layout.objects) with ordinality as entries(object, ordinal)
      ), revision = revision + 1
      where exists (select 1 from jsonb_array_elements(layout.objects) as object where object ->> 'assetId' = 'floor-tile')
    `);
  }
}
