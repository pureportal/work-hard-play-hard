import { Migration } from "@mikro-orm/migrations";

export class Migration20260915230000 extends Migration {
  override up(): void {
    this.addSql('alter table "workspace_settings" add column "organisation" jsonb;');
    this.addSql(`update "workspace_settings" set "organisation" = jsonb_build_object(
      'revision', 0, 'ceoIds', coalesce((select jsonb_build_array(id) from members order by sort_order, id limit 1), '[]'::jsonb),
      'units', '[]'::jsonb, 'assignments', '[]'::jsonb, 'removalVotes', '[]'::jsonb);`);
    this.addSql('alter table "workspace_settings" alter column "organisation" set not null;');
    this.addSql(`update floor_layouts set rooms = (select coalesce(jsonb_agg(room || jsonb_build_object('build',
      case when room->'access'->>'mode' = 'assigned'
        then jsonb_build_object('mode', 'assigned', 'assignedPersonIds', room->'access'->'assignedPersonIds')
        else jsonb_build_object('mode', 'default', 'assignedPersonIds', '[]'::jsonb) end)), '[]'::jsonb)
      from jsonb_array_elements(rooms) room);`);
    this.addSql(`update workspace_settings set game_settings = jsonb_build_object(
      'roomAccess', jsonb_build_object('mode', 'open', 'assignedPersonIds', '[]'::jsonb),
      'roomBuild', jsonb_build_object('mode', case when (game_settings->>'allowPlayerAssetPlacementInPublicRooms')::boolean then 'open' else 'none' end,
        'assignedPersonIds', '[]'::jsonb));`);
  }

  override down(): void {
    this.addSql(`update workspace_settings set game_settings = jsonb_build_object('allowPlayerAssetPlacementInPublicRooms', game_settings->'roomBuild'->>'mode' = 'open');`);
    this.addSql(`update floor_layouts set rooms = (select coalesce(jsonb_agg(room - 'build' - 'organisationUnitId'), '[]'::jsonb) from jsonb_array_elements(rooms) room);`);
    this.addSql('alter table "workspace_settings" drop column "organisation";');
  }
}
