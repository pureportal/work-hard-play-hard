import { Migration } from "@mikro-orm/migrations";

export class Migration20260917174500 extends Migration {
  override up(): void {
    this.addSql("update workspace_settings set organisation = organisation - 'removalVotes';");
    this.addSql(`update workspace_settings set public_economy = public_economy || jsonb_build_object(
      'revision', (public_economy->>'revision')::integer + 1,
      'funds', (select jsonb_agg(fund - 'weeklyAllowance' - 'spendingLimits' - 'period' - 'allowances') from jsonb_array_elements(public_economy->'funds') fund),
      'proposals', coalesce((select jsonb_agg(
        (case when proposal->>'status' in ('open', 'approved') then proposal || '{"status":"cancelled","reserved":0}'::jsonb else proposal end)
        || case
          when proposal->'action'->>'kind' = 'fund.policy' then jsonb_build_object('action', jsonb_build_object('kind', 'record',
            'summary', 'Weekly spending policy: ' || (proposal->'action'->>'weeklyAllowance') || ' coins'))
          when proposal->'action'->>'kind' = 'project' then jsonb_build_object('action', jsonb_set(proposal->'action', '{project,quote,assetChanges}', '[]'::jsonb))
          else '{}'::jsonb end
      ) from jsonb_array_elements(public_economy->'proposals') proposal), '[]'::jsonb)
    );`);
  }
}
