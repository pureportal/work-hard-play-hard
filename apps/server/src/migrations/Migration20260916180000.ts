import { Migration } from "@mikro-orm/migrations";
import { ASSET_CATALOG, createPublicEconomy } from "@workhard/shared";

export class Migration20260916180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "workspace_settings" add column "public_economy" jsonb;');
    const economy = { ...createPublicEconomy("equal"), receipts: [], operations: [] };
    this.addSql(`update "workspace_settings" set "public_economy" = '${JSON.stringify(economy)}'::jsonb;`);
    this.addSql('alter table "workspace_settings" alter column "public_economy" set not null;');
    this.addSql(`update workspace_settings set public_economy = jsonb_set(public_economy, '{funds,0,mode}', '"hierarchical"'::jsonb)
      where jsonb_array_length(organisation->'ceoIds') > 0;`);
    this.addSql('alter table "owned_assets" add column "purchase_price" integer;');
    this.addSql(`update owned_assets set purchase_price = -coin_transactions.amount from coin_transactions
      where coin_transactions.owned_asset_id = owned_assets.id and coin_transactions.kind = 'shop_purchase';`);
    this.addSql('alter table "owned_assets" alter column "purchase_price" set not null;');
    this.addSql('alter table "coin_transactions" drop constraint "coin_transactions_kind_check";');
    this.addSql(`alter table "coin_transactions" add constraint "coin_transactions_kind_check"
      check (kind in ('welcome', 'daily_bonus', 'game_reward', 'shop_purchase', 'donation', 'asset_sale', 'asset_donation'));`);
    const floors = ASSET_CATALOG.assets.filter((asset) => asset.category === "floor-types").map((asset) => `'${asset.id}'`).join(",");
    this.addSql(`update workspace_settings set public_economy = jsonb_set(jsonb_set(public_economy,
      '{inventory}', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'assetId', asset_id, 'fundId', 'workspace', 'paid', purchase_price))
        from owned_assets where asset_id in (${floors}) and placement is null), '[]'::jsonb)),
      '{receipts}', coalesce((select jsonb_agg(jsonb_build_object('key', 'asset:' || (placement->>'objectId'),
        'floorId', placement->>'floorId', 'fundId', 'workspace', 'paid', purchase_price))
        from owned_assets where asset_id in (${floors}) and placement is not null), '[]'::jsonb));`);
    this.addSql(`insert into coin_transactions (id, user_id, operation_key, operation_fingerprint, kind, amount, balance_after, created_at, asset_id, owned_asset_id, source_id, sort_order)
      select gen_random_uuid()::text, owned.user_id, 'public-floor:' || owned.id, 'asset_donation:' || owned.id || ':workspace',
        'asset_donation', 0, account.coin_balance, current_timestamp, owned.asset_id, owned.id, 'workspace',
        (select coalesce(max(sort_order), -1) from coin_transactions) + row_number() over (order by owned.id)
      from owned_assets owned join economy_accounts account on account.user_id = owned.user_id where owned.asset_id in (${floors});`);
    this.addSql(`update floor_layouts set objects = (select jsonb_agg(case when object->>'assetId' in (${floors}) and object ? 'ownerUserId'
      then (object - 'ownerUserId' - 'ownedAssetId') || '{"publicFundId":"workspace"}'::jsonb else object end)
      from jsonb_array_elements(objects) object), revision = revision + 1
      where exists (select 1 from jsonb_array_elements(objects) object where object->>'assetId' in (${floors}) and object ? 'ownerUserId');`);
    this.addSql(`delete from owned_assets where asset_id in (${floors});`);
  }

  override async down(): Promise<void> {
    throw new Error("Public economy transactions cannot be rolled back to the previous schema.");
  }
}
