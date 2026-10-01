import { Migration } from "@mikro-orm/migrations";

export class Migration20261002120000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" drop column "approval_desk";');
    this.addSql('alter table "coin_transactions" drop constraint "coin_transactions_kind_check";');
    this.addSql(`update "coin_transactions" set
      kind = 'balance_adjustment',
      operation_key = 'balance_adjustment:' || id,
      operation_fingerprint = 'balance_adjustment:' || amount,
      asset_id = null,
      owned_asset_id = null,
      source_id = null
      where kind in ('approval_reward', 'approval_upgrade');`);
    this.addSql(`alter table "coin_transactions" add constraint "coin_transactions_kind_check"
      check (kind in ('welcome', 'seed_grant', 'daily_bonus', 'game_reward', 'balance_adjustment', 'shop_purchase', 'donation', 'asset_sale', 'asset_donation'));`);
  }
}
