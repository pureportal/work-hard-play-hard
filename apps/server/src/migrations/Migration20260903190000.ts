import { Migration } from "@mikro-orm/migrations";

export class Migration20260903190000 extends Migration {
  override name = "Migration20260903190000";

  override up(): void {
    this.addSql(`
      alter table "workspace_settings"
        add column "kidnapping_settings" jsonb null,
        add column "player_kidnapping_settings" jsonb null
    `);
    this.addSql(`
      update "workspace_settings"
      set
        "kidnapping_settings" = '{"enabled":true,"targetPolicy":{"mode":"allow_all","userIds":[]}}'::jsonb,
        "player_kidnapping_settings" = coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'userId', "members"."id",
                'settings', jsonb_build_object(
                  'carrierPolicy', jsonb_build_object('mode', 'allow_all', 'userIds', '[]'::jsonb)
                )
              )
              order by "members"."sort_order"
            )
            from "members"
          ),
          '[]'::jsonb
        )
    `);
    this.addSql(`
      alter table "workspace_settings"
        alter column "kidnapping_settings" set not null,
        alter column "player_kidnapping_settings" set not null
    `);
  }

  override down(): void {
    this.addSql(`
      alter table "workspace_settings"
        drop column "player_kidnapping_settings",
        drop column "kidnapping_settings"
    `);
  }
}
