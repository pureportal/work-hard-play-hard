import { Migration } from "@mikro-orm/migrations";

export class Migration20260924120000 extends Migration {
  override up(): void {
    this.addSql(`update workspace_settings set public_economy = public_economy || jsonb_build_object(
      'approvalRates', '{"serverSettings":51,"building":51,"organisation":51,"funds":51}'::jsonb,
      'proposals', coalesce((select jsonb_agg(proposal || '{"approvalRate":51}'::jsonb)
        from jsonb_array_elements(public_economy->'proposals') proposal), '[]'::jsonb)
    );`);
  }
}
