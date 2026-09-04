import { EntitySchema } from "@mikro-orm/core";
import type {
  AssignableMemberPermission,
  Availability,
  ChatAttachment,
  ConversationType,
  FloorLayout,
  GameSettings,
  GlobalKidnappingSettings,
  MemberPermission,
  MemberRole,
  Meeting,
  OwnedAssetPlacement,
  Position,
  PlayerKidnappingSettings,
  WorldPlayer,
  RegistrationSettings,
  CorporateIdentitySettings,
} from "@workhard/shared";

export class MemberEntity {
  id!: string;
  name!: string;
  initials!: string;
  email!: string;
  title!: string;
  role!: MemberRole;
  permissions!: MemberPermission[];
  color!: string;
  availability!: Availability;
  online!: boolean;
  floorId!: string | null;
  activity!: string | null;
  position!: Position | null;
  sortOrder!: number;
}

export class FloorLayoutEntity {
  floorId!: string;
  revision!: number;
  walls!: FloorLayout["walls"];
  openings!: FloorLayout["openings"];
  tiles!: FloorLayout["tiles"];
  objects!: FloorLayout["objects"];
  rooms!: FloorLayout["rooms"];
  sortOrder!: number;
}

export class ConversationEntity {
  id!: string;
  name!: string;
  type!: ConversationType;
  roomId!: string | null;
  meetingId!: string | null;
  unread!: number;
  sortOrder!: number;
}

export class ConversationParticipantEntity {
  conversationId!: string;
  userId!: string;
  sortOrder!: number;
}

export class ChatMessageEntity {
  id!: string;
  conversationId!: string;
  userId!: string;
  body!: string;
  createdAt!: Date;
  sequence!: number;
  attachments!: ChatAttachment[] | null;
  sortOrder!: number;
}

export class InvitationEntity {
  id!: string;
  teamId!: string;
  email!: string;
  role!: Exclude<MemberRole, "owner">;
  permissions!: AssignableMemberPermission[];
  status!: "pending" | "accepted" | "revoked";
  expiresAt!: Date;
  sortOrder!: number;
}

export class MeetingEntity {
  id!: string;
  title!: string;
  location!: Meeting["location"];
  startsAt!: Date;
  durationMinutes!: number;
  status!: "scheduled" | "live" | "ended";
  sortOrder!: number;
}

export class MeetingParticipantEntity {
  meetingId!: string;
  userId!: string;
  sortOrder!: number;
}

export class GameScoreEntity {
  id!: string;
  roundId!: string;
  definitionId!: string;
  userId!: string;
  score!: number;
  lines!: number;
  level!: number;
  mode!: "solo" | "multiplayer";
  playerCount!: number;
  placement!: number;
  won!: boolean;
  playedAt!: Date;
  sortOrder!: number;
}

export class PlayerGameStatisticsEntity {
  definitionId!: string;
  userId!: string;
  gamesPlayed!: number;
  multiplayerGamesPlayed!: number;
  multiplayerWins!: number;
  highestScore!: number;
  highestLines!: number;
  totalScore!: number;
  totalLines!: number;
  sortOrder!: number;
}

export class EconomyAccountEntity {
  userId!: string;
  coinBalance!: number;
  lifetimeEarned!: number;
  lifetimeSpent!: number;
  dailyRewardStreak!: number;
  dailyRewardLastClaimedDay!: string | null;
  sortOrder!: number;
}

export class OwnedAssetEntity {
  id!: string;
  userId!: string;
  assetId!: string;
  acquiredAt!: Date;
  placement!: OwnedAssetPlacement | null;
  sortOrder!: number;
}

export class CoinTransactionEntity {
  id!: string;
  userId!: string;
  operationKey!: string;
  operationFingerprint!: string;
  kind!: "welcome" | "daily_bonus" | "game_reward" | "shop_purchase";
  amount!: number;
  balanceAfter!: number;
  createdAt!: Date;
  assetId!: string | null;
  ownedAssetId!: string | null;
  sourceId!: string | null;
  sortOrder!: number;
}

export class WorkspaceSettingsEntity {
  id!: string;
  gameSettings!: GameSettings;
  kidnappingSettings!: GlobalKidnappingSettings;
  playerKidnappingSettings!: Array<{ userId: string; settings: PlayerKidnappingSettings }>;
  registrationSettings!: RegistrationSettings;
  corporateIdentity!: CorporateIdentitySettings;
  updatedAt!: Date;
}

export class WorldPlayerEntity {
  userId!: string;
  floorId!: string;
  x!: number;
  y!: number;
  facing!: WorldPlayer["facing"];
  availability!: Availability;
  roomId!: string | null;
  connected!: boolean;
  wavingUntil!: Date | null;
  sortOrder!: number;
}

export const memberSchema = new EntitySchema({
  class: MemberEntity,
  tableName: "members",
  properties: {
    id: { type: String, primary: true },
    name: { type: String },
    initials: { type: String },
    email: { type: String, index: true },
    title: { type: String },
    role: { type: String },
    permissions: { type: "json" },
    color: { type: String },
    availability: { type: String },
    online: { type: Boolean },
    floorId: { type: String, fieldName: "floor_id", nullable: true },
    activity: { type: String, nullable: true },
    position: { type: "json", nullable: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "members_role_check", expression: "role in ('owner', 'admin', 'member', 'guest')" },
    { name: "members_availability_check", expression: "availability in ('available', 'busy', 'dnd', 'away')" },
    { name: "members_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const floorLayoutSchema = new EntitySchema({
  class: FloorLayoutEntity,
  tableName: "floor_layouts",
  properties: {
    floorId: { type: String, primary: true, fieldName: "floor_id" },
    revision: { type: Number },
    walls: { type: "json" },
    openings: { type: "json" },
    tiles: { type: "json" },
    objects: { type: "json" },
    rooms: { type: "json" },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "floor_layouts_revision_check", expression: "revision >= 0" },
    { name: "floor_layouts_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const conversationSchema = new EntitySchema({
  class: ConversationEntity,
  tableName: "conversations",
  properties: {
    id: { type: String, primary: true },
    name: { type: String },
    type: { type: String },
    roomId: { type: String, fieldName: "room_id", nullable: true },
    meetingId: { type: String, fieldName: "meeting_id", nullable: true },
    unread: { type: Number },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "conversations_type_check", expression: "type in ('team', 'room', 'direct', 'meeting')" },
    { name: "conversations_unread_check", expression: "unread >= 0" },
    { name: "conversations_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const conversationParticipantSchema = new EntitySchema({
  class: ConversationParticipantEntity,
  tableName: "conversation_participants",
  properties: {
    conversationId: {
      kind: "m:1",
      entity: () => ConversationEntity,
      primary: true,
      fieldName: "conversation_id",
      mapToPk: true,
      deleteRule: "cascade",
    } as never,
    userId: { type: String, primary: true, fieldName: "user_id" },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [{ name: "conversation_participants_sort_order_check", expression: "sort_order >= 0" }],
});

export const chatMessageSchema = new EntitySchema({
  class: ChatMessageEntity,
  tableName: "chat_messages",
  properties: {
    id: { type: String, primary: true },
    conversationId: {
      kind: "m:1",
      entity: () => ConversationEntity,
      fieldName: "conversation_id",
      mapToPk: true,
      deleteRule: "cascade",
      index: true,
    } as never,
    userId: { type: String, fieldName: "user_id", index: true },
    body: { type: String, columnType: "text" },
    createdAt: { type: Date, fieldName: "created_at" },
    sequence: { type: Number },
    attachments: { type: "json", nullable: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  uniques: [{ properties: ["conversationId", "sequence"] }],
  checks: [
    { name: "chat_messages_sequence_check", expression: "sequence > 0" },
    { name: "chat_messages_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const invitationSchema = new EntitySchema({
  class: InvitationEntity,
  tableName: "invitations",
  properties: {
    id: { type: String, primary: true },
    teamId: { type: String, fieldName: "team_id", index: true },
    email: { type: String, index: true },
    role: { type: String },
    permissions: { type: "json" },
    status: { type: String },
    expiresAt: { type: Date, fieldName: "expires_at", index: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "invitations_role_check", expression: "role in ('admin', 'member', 'guest')" },
    { name: "invitations_status_check", expression: "status in ('pending', 'accepted', 'revoked')" },
    { name: "invitations_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const meetingSchema = new EntitySchema({
  class: MeetingEntity,
  tableName: "meetings",
  properties: {
    id: { type: String, primary: true },
    title: { type: String },
    location: { type: "json" },
    startsAt: { type: Date, fieldName: "starts_at", index: true },
    durationMinutes: { type: Number, fieldName: "duration_minutes" },
    status: { type: String },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "meetings_duration_minutes_check", expression: "duration_minutes > 0" },
    { name: "meetings_status_check", expression: "status in ('scheduled', 'live', 'ended')" },
    { name: "meetings_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const meetingParticipantSchema = new EntitySchema({
  class: MeetingParticipantEntity,
  tableName: "meeting_participants",
  properties: {
    meetingId: {
      kind: "m:1",
      entity: () => MeetingEntity,
      primary: true,
      fieldName: "meeting_id",
      mapToPk: true,
      deleteRule: "cascade",
    } as never,
    userId: { type: String, primary: true, fieldName: "user_id" },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [{ name: "meeting_participants_sort_order_check", expression: "sort_order >= 0" }],
});

export const gameScoreSchema = new EntitySchema({
  class: GameScoreEntity,
  tableName: "game_scores",
  properties: {
    id: { type: String, primary: true },
    roundId: { type: String, fieldName: "round_id", index: true },
    definitionId: { type: String, fieldName: "definition_id", index: true },
    userId: { type: String, fieldName: "user_id", index: true },
    score: { type: Number },
    lines: { type: Number },
    level: { type: Number },
    mode: { type: String },
    playerCount: { type: Number, fieldName: "player_count" },
    placement: { type: Number },
    won: { type: Boolean },
    playedAt: { type: Date, fieldName: "played_at", index: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  uniques: [{ properties: ["roundId", "userId"] }],
  checks: [
    { name: "game_scores_score_check", expression: "score >= 0" },
    { name: "game_scores_lines_check", expression: "lines >= 0" },
    { name: "game_scores_level_check", expression: "level >= 0" },
    { name: "game_scores_mode_check", expression: "mode in ('solo', 'multiplayer')" },
    { name: "game_scores_player_count_check", expression: "player_count > 0" },
    { name: "game_scores_placement_check", expression: "placement > 0" },
    { name: "game_scores_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const playerGameStatisticsSchema = new EntitySchema({
  class: PlayerGameStatisticsEntity,
  tableName: "player_game_statistics",
  properties: {
    definitionId: { type: String, primary: true, fieldName: "definition_id" },
    userId: { type: String, primary: true, fieldName: "user_id" },
    gamesPlayed: { type: Number, fieldName: "games_played" },
    multiplayerGamesPlayed: { type: Number, fieldName: "multiplayer_games_played" },
    multiplayerWins: { type: Number, fieldName: "multiplayer_wins" },
    highestScore: { type: Number, fieldName: "highest_score" },
    highestLines: { type: Number, fieldName: "highest_lines" },
    totalScore: { type: Number, fieldName: "total_score" },
    totalLines: { type: Number, fieldName: "total_lines" },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "player_game_statistics_games_played_check", expression: "games_played >= 0" },
    { name: "player_game_statistics_multiplayer_games_played_check", expression: "multiplayer_games_played >= 0" },
    { name: "player_game_statistics_multiplayer_wins_check", expression: "multiplayer_wins >= 0" },
    { name: "player_game_statistics_highest_score_check", expression: "highest_score >= 0" },
    { name: "player_game_statistics_highest_lines_check", expression: "highest_lines >= 0" },
    { name: "player_game_statistics_total_score_check", expression: "total_score >= 0" },
    { name: "player_game_statistics_total_lines_check", expression: "total_lines >= 0" },
    { name: "player_game_statistics_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const economyAccountSchema = new EntitySchema({
  class: EconomyAccountEntity,
  tableName: "economy_accounts",
  properties: {
    userId: {
      kind: "m:1",
      entity: () => MemberEntity,
      primary: true,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
    } as never,
    coinBalance: { type: Number, fieldName: "coin_balance" },
    lifetimeEarned: { type: Number, fieldName: "lifetime_earned" },
    lifetimeSpent: { type: Number, fieldName: "lifetime_spent" },
    dailyRewardStreak: { type: Number, fieldName: "daily_reward_streak" },
    dailyRewardLastClaimedDay: {
      type: "date",
      fieldName: "daily_reward_last_claimed_day",
      nullable: true,
    },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "economy_accounts_coin_balance_check", expression: "coin_balance >= 0" },
    { name: "economy_accounts_lifetime_earned_check", expression: "lifetime_earned >= 0" },
    { name: "economy_accounts_lifetime_spent_check", expression: "lifetime_spent >= 0" },
    { name: "economy_accounts_daily_reward_streak_check", expression: "daily_reward_streak >= 0" },
    { name: "economy_accounts_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const ownedAssetSchema = new EntitySchema({
  class: OwnedAssetEntity,
  tableName: "owned_assets",
  properties: {
    id: { type: String, primary: true },
    userId: {
      kind: "m:1",
      entity: () => EconomyAccountEntity,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
      index: true,
    } as never,
    assetId: { type: String, fieldName: "asset_id" },
    acquiredAt: { type: Date, fieldName: "acquired_at" },
    placement: { type: "json", nullable: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [{ name: "owned_assets_sort_order_check", expression: "sort_order >= 0" }],
});

export const coinTransactionSchema = new EntitySchema({
  class: CoinTransactionEntity,
  tableName: "coin_transactions",
  properties: {
    id: { type: String, primary: true },
    userId: {
      kind: "m:1",
      entity: () => EconomyAccountEntity,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
      index: true,
    } as never,
    operationKey: { type: String, fieldName: "operation_key" },
    operationFingerprint: { type: String, fieldName: "operation_fingerprint" },
    kind: { type: String },
    amount: { type: Number },
    balanceAfter: { type: Number, fieldName: "balance_after" },
    createdAt: { type: Date, fieldName: "created_at", index: true },
    assetId: { type: String, fieldName: "asset_id", nullable: true },
    ownedAssetId: { type: String, fieldName: "owned_asset_id", nullable: true },
    sourceId: { type: String, fieldName: "source_id", nullable: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  uniques: [{ properties: ["userId", "operationKey"] }],
  checks: [
    { name: "coin_transactions_kind_check", expression: "kind in ('welcome', 'daily_bonus', 'game_reward', 'shop_purchase')" },
    { name: "coin_transactions_balance_after_check", expression: "balance_after >= 0" },
    { name: "coin_transactions_sort_order_check", expression: "sort_order >= 0" },
  ],
});

export const workspaceSettingsSchema = new EntitySchema({
  class: WorkspaceSettingsEntity,
  tableName: "workspace_settings",
  properties: {
    id: { type: String, primary: true },
    gameSettings: { type: "json", fieldName: "game_settings" },
    kidnappingSettings: { type: "json", fieldName: "kidnapping_settings" },
    playerKidnappingSettings: { type: "json", fieldName: "player_kidnapping_settings" },
    registrationSettings: { type: "json", fieldName: "registration_settings" },
    corporateIdentity: { type: "json", fieldName: "corporate_identity" },
    updatedAt: { type: Date, fieldName: "updated_at" },
  },
});

export const worldPlayerSchema = new EntitySchema({
  class: WorldPlayerEntity,
  tableName: "world_players",
  properties: {
    userId: {
      kind: "m:1",
      entity: () => MemberEntity,
      primary: true,
      fieldName: "user_id",
      mapToPk: true,
      deleteRule: "cascade",
    } as never,
    floorId: { type: String, fieldName: "floor_id", index: true },
    x: { type: Number, columnType: "double precision" },
    y: { type: Number, columnType: "double precision" },
    facing: { type: String },
    availability: { type: String },
    roomId: { type: String, fieldName: "room_id", nullable: true },
    connected: { type: Boolean },
    wavingUntil: { type: Date, fieldName: "waving_until", nullable: true },
    sortOrder: { type: Number, fieldName: "sort_order" },
  },
  checks: [
    { name: "world_players_facing_check", expression: "facing in ('up', 'down', 'left', 'right')" },
    { name: "world_players_availability_check", expression: "availability in ('available', 'busy', 'dnd', 'away')" },
    { name: "world_players_sort_order_check", expression: "sort_order >= 0" },
  ],
});
