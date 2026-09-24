import { Migration } from "@mikro-orm/migrations";

export class Migration20260924133000 extends Migration {
  override up(): void {
    this.addSql(`update workspace_settings set public_economy = jsonb_set(public_economy, '{proposals}',
      coalesce((select jsonb_agg(case when proposal->'action'->>'kind' = 'project'
        then jsonb_set(proposal, '{reserved}', '0'::jsonb) else proposal end)
        from jsonb_array_elements(public_economy->'proposals') proposal), '[]'::jsonb));`);
  }
}
