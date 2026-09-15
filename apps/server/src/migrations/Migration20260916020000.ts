import { Migration } from "@mikro-orm/migrations";
import { isDeepStrictEqual } from "node:util";
import type { FloorLayout, GameSettings, OrganisationState, PlayerKidnappingSettings, RoomPermission } from "@workhard/shared";

export class Migration20260916020000 extends Migration {
  override name = "Migration20260916020000";

  override async up(): Promise<void> {
    await removeDemoData(this);
  }
}

interface SavedSettings {
  id: string;
  organisation: OrganisationState;
  game_settings: GameSettings;
  kidnapping_settings: { enabled: boolean; targetPolicy: { mode: string; userIds: string[] } };
  player_kidnapping_settings: Array<{ userId: string; settings: PlayerKidnappingSettings }>;
}

async function removeDemoData(migration: Migration): Promise<void> {
  for (const message of demoRecords.messages) {
    await migration.execute("delete from chat_messages where id = ? and user_id = ? and conversation_id = ? and body = ?",
      [message.id, message.userId, message.conversationId, message.body]);
  }
  for (const score of demoRecords.scores) {
    const deleted = await migration.execute(
      "delete from game_scores where id = ? and round_id = ? returning user_id, definition_id, score, lines, mode, won", [score.id, score.roundId]
    ) as Array<{ user_id: string; definition_id: string; score: number; lines: number; mode: string; won: boolean }>;
    for (const result of deleted) {
      await migration.execute(`update player_game_statistics set games_played = greatest(0, games_played - 1),
        multiplayer_games_played = greatest(0, multiplayer_games_played - ?), multiplayer_wins = greatest(0, multiplayer_wins - ?),
        total_score = greatest(0, total_score - ?), total_lines = greatest(0, total_lines - ?),
        highest_score = case when highest_score = ? then coalesce((select max(score) from game_scores where user_id = ? and definition_id = ?), 0) else highest_score end,
        highest_lines = case when highest_lines = ? then coalesce((select max(lines) from game_scores where user_id = ? and definition_id = ?), 0) else highest_lines end
        where user_id = ? and definition_id = ?`,
      [result.mode === "multiplayer" ? 1 : 0, result.won ? 1 : 0, result.score, result.lines,
        result.score, result.user_id, result.definition_id, result.lines, result.user_id, result.definition_id, result.user_id, result.definition_id]);
    }
  }
  for (const invitation of demoRecords.invitations) {
    await migration.execute("delete from invitations where id = ? and email = ?", [invitation.id, invitation.email]);
  }
  for (const meeting of demoRecords.meetings) {
    const rows = await migration.execute(`select id from meetings where id = ? and title = ?
      and not exists (select 1 from conversations conversation join chat_messages message on message.conversation_id = conversation.id
        where conversation.meeting_id = meetings.id)`, [meeting.id, meeting.title]);
    if (rows.length === 0) continue;
    await migration.execute("delete from conversations where meeting_id = ?", [meeting.id]);
    await migration.execute("delete from meeting_participants where meeting_id = ?", [meeting.id]);
    await migration.execute("delete from meetings where id = ?", [meeting.id]);
  }

  const removedPeople = new Set<string>();
  for (const member of demoRecords.members) {
    const rows = await migration.execute(`select id from members where id = ? and name = ? and email = ?
      and not exists (select 1 from chat_messages where user_id = members.id)
      and not exists (select 1 from game_scores where user_id = members.id)
      and not exists (select 1 from chess_matches where state->>'whiteUserId' = members.id or state->>'blackUserId' = members.id)
      and not exists (select 1 from spotify_connections where user_id = members.id and encrypted_tokens is not null)
      and not exists (select 1 from github_connections where user_id = members.id)`, [member.id, member.name, member.email]);
    if (rows.length === 0) continue;
    removedPeople.add(member.id);
    await migration.execute("delete from auth_accounts where id = ? and email = ?", [member.id, member.email]);
    await migration.execute("delete from conversation_participants where user_id = ?", [member.id]);
    await migration.execute("delete from meeting_participants where user_id = ?", [member.id]);
    await migration.execute("delete from player_game_statistics where user_id = ?", [member.id]);
    await migration.execute("delete from world_players where user_id = ?", [member.id]);
    await migration.execute("delete from members where id = ?", [member.id]);
  }

  for (const conversation of demoRecords.conversations) {
    await migration.execute("update conversations set unread = 0 where id = ? and name = ?", [conversation.id, conversation.name]);
    if (conversation.type === "direct") {
      await migration.execute(`delete from conversations where id = ? and name = ?
        and not exists (select 1 from chat_messages where conversation_id = conversations.id)
        and not exists (select 1 from conversation_participants where conversation_id = conversations.id)`,
      [conversation.id, conversation.name]);
    }
  }
  await migration.execute("update conversations set name = 'Team' where id = 'conversation-team' and name = 'Northstar'");
  await migration.execute("update invitations set team_id = 'team' where team_id = 'team-northstar'");
  await migration.execute(`update members set role = 'owner', permissions = '["manage_members","build"]'::jsonb
    where id = (select id from members order by sort_order, id limit 1) and not exists (select 1 from members where role = 'owner')`);

  const settings = await migration.execute("select * from workspace_settings") as SavedSettings[];
  for (const workspace of settings) await cleanWorkspace(migration, workspace, removedPeople);
}

async function cleanWorkspace(migration: Migration, workspace: SavedSettings, removedPeople: Set<string>): Promise<void> {
  const organisation = workspace.organisation;
  const removedUnits = new Set(organisation.units.filter((unit) => demoRecords.units.some((demo) => isDeepStrictEqual(demo, unit))).map((unit) => unit.id));
  organisation.units = organisation.units.filter((unit) => !removedUnits.has(unit.id)).map((unit) => ({
    ...unit, parentId: unit.parentId && removedUnits.has(unit.parentId) ? null : unit.parentId,
  }));
  organisation.ceoIds = organisation.ceoIds.filter((id) => !removedPeople.has(id));
  if (organisation.ceoIds.length === 0) {
    const owners = await migration.execute("select id from members where role = 'owner' order by sort_order, id limit 1") as Array<{ id: string }>;
    organisation.ceoIds = owners.map((owner) => owner.id);
  }
  organisation.assignments = organisation.assignments.filter((assignment) => !removedPeople.has(assignment.userId) && !removedUnits.has(assignment.unitId));
  organisation.removalVotes = organisation.removalVotes.filter((vote) => !removedPeople.has(vote.subjectId) && !removedPeople.has(vote.proposedBy)).map((vote) => ({
    ...vote, electorate: vote.electorate.filter((id) => !removedPeople.has(id)), ballots: vote.ballots.filter((ballot) => !removedPeople.has(ballot.userId)),
  }));
  organisation.revision += 1;
  const gameSettings = workspace.game_settings;
  gameSettings.roomAccess = cleanPermission(gameSettings.roomAccess, removedPeople, removedUnits);
  gameSettings.roomBuild = cleanPermission(gameSettings.roomBuild, removedPeople, removedUnits);
  workspace.kidnapping_settings.targetPolicy.userIds = workspace.kidnapping_settings.targetPolicy.userIds.filter((id) => !removedPeople.has(id));
  const players = workspace.player_kidnapping_settings.filter((player) => !removedPeople.has(player.userId)).map((player) => ({
    ...player, settings: { carrierPolicy: { ...player.settings.carrierPolicy, userIds: player.settings.carrierPolicy.userIds.filter((id) => !removedPeople.has(id)) } },
  }));
  await migration.execute(`update workspace_settings set organisation = ?::jsonb, game_settings = ?::jsonb,
    kidnapping_settings = ?::jsonb, player_kidnapping_settings = ?::jsonb where id = ?`,
  [JSON.stringify(organisation), JSON.stringify(gameSettings), JSON.stringify(workspace.kidnapping_settings), JSON.stringify(players), workspace.id]);

  const layouts = await migration.execute("select floor_id, objects, rooms from floor_layouts") as Array<{ floor_id: string; objects: FloorLayout["objects"]; rooms: FloorLayout["rooms"] }>;
  for (const layout of layouts) {
    const objects = layout.objects.map((object) => {
      const result = { ...object };
      if (demoRecords.deskLabels.some((desk) => desk.id === object.id && desk.label === object.label)) delete result.label;
      if (result.ownerUserId && removedPeople.has(result.ownerUserId)) {
        delete result.ownerUserId;
        delete result.ownedAssetId;
      }
      return result;
    });
    const rooms = layout.rooms.map((room) => {
      const result = { ...room, access: cleanPermission(room.access, removedPeople, removedUnits),
        ...(room.build ? { build: cleanPermission(room.build, removedPeople, removedUnits) } : {}) };
      if (result.organisationUnitId && removedUnits.has(result.organisationUnitId)) delete result.organisationUnitId;
      return result;
    });
    if (isDeepStrictEqual(objects, layout.objects) && isDeepStrictEqual(rooms, layout.rooms)) continue;
    await migration.execute("update floor_layouts set objects = ?::jsonb, rooms = ?::jsonb, revision = revision + 1 where floor_id = ?",
      [JSON.stringify(objects), JSON.stringify(rooms), layout.floor_id]);
  }
}

function cleanPermission<T extends RoomPermission>(permission: T, removedPeople: Set<string>, removedUnits: Set<string>): T {
  return { ...permission, assignedPersonIds: permission.assignedPersonIds.filter((id) => !removedPeople.has(id)),
    ...(permission.unitGrants ? { unitGrants: permission.unitGrants.filter((grant) => !removedUnits.has(grant.unitId)) } : {}) };
}

const demoRecords = {
  members: [
    {"id":"user-maya","name":"Maya Chen","email":"maya@northstar.studio"},
    {"id":"user-leo","name":"Leo Martins","email":"leo@northstar.studio"},
    {"id":"user-amara","name":"Amara Okafor","email":"amara@northstar.studio"},
    {"id":"user-jonas","name":"Jonas Berg","email":"jonas@northstar.studio"},
    {"id":"user-priya","name":"Priya Nair","email":"priya@northstar.studio"},
    {"id":"user-noah","name":"Noah Williams","email":"noah@northstar.studio"},
    {"id":"user-elena","name":"Elena Rossi","email":"elena@northstar.studio"},
    {"id":"user-theo","name":"Theo Park","email":"theo@northstar.studio"},
    {"id":"user-aisha","name":"Aisha Khan","email":"aisha@northstar.studio"},
    {"id":"user-sam","name":"Sam Rivera","email":"sam@northstar.studio"},
    {"id":"user-owen","name":"Owen Brooks","email":"owen@northstar.studio"},
  ],
  messages: [
    {"id":"message-team-1","userId":"user-amara","conversationId":"conversation-team","body":"API contract is ready for review."},
    {"id":"message-team-2","userId":"user-leo","conversationId":"conversation-team","body":"Nice. I left the latest flow on the board."},
    {"id":"message-team-3","userId":"user-elena","conversationId":"conversation-team","body":"The preview environment is stable again."},
    {"id":"message-team-4","userId":"user-jonas","conversationId":"conversation-team","body":"Falling Blocks score to beat: 4,820."},
    {"id":"message-team-6","userId":"user-theo","conversationId":"conversation-team","body":"I will run the entry checks from there."},
    {"id":"message-product-1","userId":"user-maya","conversationId":"conversation-product","body":"Product crit starts in ten."},
    {"id":"message-product-2","userId":"user-priya","conversationId":"conversation-product","body":"I will bring the compact-mode pass."},
    {"id":"message-product-3","userId":"user-elena","conversationId":"conversation-product","body":"Loading states are ready for a look."},
    {"id":"message-product-4","userId":"user-maya","conversationId":"conversation-product","body":"Let us use the Daily Room."},
    {"id":"message-garden-1","userId":"user-noah","conversationId":"conversation-garden","body":"Coffee outside after planning?"},
    {"id":"message-garden-2","userId":"user-aisha","conversationId":"conversation-garden","body":"Yes, I will bring the interview notes."},
    {"id":"message-garden-3","userId":"user-noah","conversationId":"conversation-garden","body":"Perfect."},
    {"id":"message-daily-1","userId":"user-amara","conversationId":"conversation-daily","body":"Join when you are ready."},
    {"id":"message-daily-2","userId":"user-leo","conversationId":"conversation-daily","body":"Reviewing the final flow now."},
    {"id":"message-daily-3","userId":"user-priya","conversationId":"conversation-daily","body":"I added the mobile frames."},
    {"id":"message-planning-1","userId":"user-noah","conversationId":"conversation-planning","body":"The workshop board has the draft agenda."},
    {"id":"message-planning-2","userId":"user-aisha","conversationId":"conversation-planning","body":"I added the research themes."},
    {"id":"message-leo-1","userId":"user-leo","conversationId":"conversation-leo","body":"Can you check the lounge spacing?"},
    {"id":"message-leo-2","userId":"user-maya","conversationId":"conversation-leo","body":"On it."},
    {"id":"message-leo-3","userId":"user-leo","conversationId":"conversation-leo","body":"Thanks. I am by the commons table."},
    {"id":"message-amara-1","userId":"user-amara","conversationId":"conversation-amara","body":"Can we pair after the crit?"},
    {"id":"message-amara-2","userId":"user-maya","conversationId":"conversation-amara","body":"Yes, meet me in the studio."},
    {"id":"message-jonas-1","userId":"user-maya","conversationId":"conversation-jonas","body":"How is the arcade input feeling?"},
    {"id":"message-jonas-2","userId":"user-jonas","conversationId":"conversation-jonas","body":"Much tighter. Come try a round."},
    {"id":"message-priya-1","userId":"user-priya","conversationId":"conversation-priya","body":"I am in focus mode for the next half hour."},
    {"id":"message-priya-2","userId":"user-maya","conversationId":"conversation-priya","body":"Got it. I will knock if it is urgent."},
    {"id":"message-noah-1","userId":"user-noah","conversationId":"conversation-noah","body":"Rooftop planning still works for me."},
    {"id":"message-noah-2","userId":"user-maya","conversationId":"conversation-noah","body":"See you in the Workshop."},
    {"id":"message-elena-1","userId":"user-elena","conversationId":"conversation-elena","body":"Could you review the reconnect copy?"},
    {"id":"message-elena-2","userId":"user-maya","conversationId":"conversation-elena","body":"Send it over."},
    {"id":"message-aisha-1","userId":"user-aisha","conversationId":"conversation-aisha","body":"The first interview theme is ready."},
    {"id":"message-aisha-2","userId":"user-maya","conversationId":"conversation-aisha","body":"Add it to the planning thread."},
    {"id":"message-sam-1","userId":"user-sam","conversationId":"conversation-sam","body":"I will be back online this afternoon."},
  ],
  invitations: [
    {"id":"invite-ana","email":"ana@example.com"},
    {"id":"invite-guest","email":"guest@example.com"},
    {"id":"invite-revoked","email":"former@example.com"},
  ],
  meetings: [
    {"id":"meeting-product-crit","title":"Product crit"},
    {"id":"meeting-planning","title":"September planning"},
    {"id":"meeting-retro","title":"Sprint retro"},
  ],
  scores: [
    {"id":"score-jonas","roundId":"round-seed-jonas"},
    {"id":"score-priya","roundId":"round-seed-priya-leo"},
    {"id":"score-leo","roundId":"round-seed-priya-leo"},
    {"id":"score-elena","roundId":"round-seed-elena-theo"},
    {"id":"score-theo","roundId":"round-seed-elena-theo"},
    {"id":"score-noah","roundId":"round-seed-noah"},
  ],
  units: [
    {"id":"unit-product","name":"Product","kind":"department","parentId":null},
    {"id":"unit-engineering","name":"Engineering","kind":"department","parentId":null},
    {"id":"unit-design","name":"Design","kind":"team","parentId":"unit-product"},
    {"id":"unit-research","name":"Research","kind":"team","parentId":"unit-design"},
    {"id":"unit-platform","name":"Platform","kind":"team","parentId":"unit-engineering"},
    {"id":"unit-web","name":"Web","kind":"team","parentId":"unit-platform"},
  ],
  conversations: [
    {"id":"conversation-team","name":"Northstar","type":"team"},
    {"id":"conversation-product","name":"Product Studio","type":"room"},
    {"id":"conversation-garden","name":"Garden","type":"room"},
    {"id":"conversation-daily","name":"Daily Room","type":"meeting"},
    {"id":"conversation-planning","name":"September planning","type":"meeting"},
    {"id":"conversation-leo","name":"Leo Martins","type":"direct"},
    {"id":"conversation-amara","name":"Amara Okafor","type":"direct"},
    {"id":"conversation-jonas","name":"Jonas Berg","type":"direct"},
    {"id":"conversation-priya","name":"Priya Nair","type":"direct"},
    {"id":"conversation-noah","name":"Noah Williams","type":"direct"},
    {"id":"conversation-elena","name":"Elena Rossi","type":"direct"},
    {"id":"conversation-theo","name":"Theo Park","type":"direct"},
    {"id":"conversation-aisha","name":"Aisha Khan","type":"direct"},
    {"id":"conversation-sam","name":"Sam Rivera","type":"direct"},
    {"id":"conversation-owen","name":"Owen Brooks","type":"direct"},
  ],
  deskLabels: [
    {"id":"object-desk-maya","label":"Maya"},
    {"id":"object-desk-leo","label":"Leo"},
    {"id":"object-desk-amara","label":"Amara"},
  ],
} as const;
