import { Migration } from "@mikro-orm/migrations";

export class Migration20260924143000 extends Migration {
  override up(): void {
    this.addSql(`update workspace_settings settings set public_economy = jsonb_set(settings.public_economy, '{proposals}',
      coalesce((select jsonb_agg(case
        when proposal->'action'->>'kind' = 'project'
          and proposal->>'status' in ('open', 'approved')
          and not (proposal->'action'->'project' ? 'baseLayout')
          and floor.revision = (proposal->'action'->'project'->>'baseRevision')::integer
        then jsonb_set(proposal, '{action,project,baseLayout}', jsonb_build_object(
          'floorId', floor.floor_id, 'revision', floor.revision, 'walls', floor.walls,
          'openings', floor.openings, 'tiles', floor.tiles, 'objects', floor.objects, 'rooms', floor.rooms))
        else proposal end order by position)
        from jsonb_array_elements(settings.public_economy->'proposals') with ordinality as entries(proposal, position)
        left join floor_layouts floor on floor.floor_id = proposal->'action'->'project'->>'floorId'), '[]'::jsonb));`);
  }
}
