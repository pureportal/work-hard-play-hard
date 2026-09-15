import { Migration } from "@mikro-orm/migrations";

export class Migration20260916000000 extends Migration {
  override name = "Migration20260916000000";

  override up(): void {
    this.addSql("delete from conversations where meeting_id in (select id from meetings where location->>'type' = 'public');");
    this.addSql("delete from meetings where location->>'type' = 'public';");
    this.addSql("update members set activity = null where activity = 'Open huddle';");
    this.addSql("delete from chat_messages where (id = 'message-team-5' and body = 'Open huddle is live in the Product Studio.') or (id = 'message-theo-1' and body = 'I am standing in the open meeting circle.');");
    this.addSql("alter table meetings add constraint meetings_room_location_check check (coalesce(location->>'type', '') = 'room' and nullif(location->>'roomId', '') is not null);");
  }
}
