import { Migration } from "@mikro-orm/migrations";

export class Migration20260925130000 extends Migration {
  override up(): void {
    this.addSql(`alter table "coin_transactions" drop constraint "coin_transactions_kind_check";`);
    this.addSql(`alter table "coin_transactions" add constraint "coin_transactions_kind_check" check (kind in ('welcome', 'seed_grant', 'daily_bonus', 'game_reward', 'approval_reward', 'approval_upgrade', 'shop_purchase', 'donation', 'asset_sale', 'asset_donation'));`);
  }
}
