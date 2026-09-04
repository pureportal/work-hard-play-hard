import type { AssetRotation } from "./assets.js";
import type { FloorLayout, LayoutEdit, RoomSettings } from "./building.js";
import type { CoinTransaction, GameCoinReward, GameSettings, PlayerEconomy } from "./economy.js";
import type { Position } from "./geometry.js";
import type { TetrominoType, TetrisCellPosition, TetrisCommand } from "./tetris.js";
import type {
  GlobalKidnappingSettings,
  KidnappingConfiguration,
  PlayerKidnappingSettings,
} from "./kidnapping.js";

export * from "./building.js";
export * from "./assets.js";
export * from "./asset-placement.js";
export * from "./layout-placement.js";
export * from "./geometry.js";
export * from "./floor-portals.js";
export * from "./room-detection.js";
export * from "./economy.js";
export * from "./player-asset-placement.js";
export * from "./kidnapping.js";
export * from "./tetris.js";

export type Availability = "available" | "busy" | "dnd" | "away";

export const PROXIMITY_INTERACTION_RADIUS = 80;
export const PROXIMITY_GROUP_REACH_RADIUS = 96;
export const GONG_INTERACTION_RANGE = 72;
export const GONG_COOLDOWN_MS = 30_000;

export const REACTION_KINDS = ["wave", "heart", "celebrate", "thumbs_up", "laugh", "clap"] as const;

export type ReactionKind = typeof REACTION_KINDS[number];

export type ReactionScope =
  | { type: "floor"; floorId: string }
  | { type: "meeting"; meetingId: string };

export interface GongRing {
  id: string;
  objectId: string;
  userId: string;
  floorId: string;
  rungAt: number;
  cooldownUntil: number;
}

export type MemberRole = "owner" | "admin" | "member" | "guest";

export interface RegistrationSettings {
  enabled: boolean;
  invitationRequired: boolean;
  whitelistedDomains: string[];
  defaultRole: Exclude<MemberRole, "owner">;
}

export interface RegistrationAvailability {
  enabled: boolean;
  invitationRequired: boolean;
}

export type AuthenticationLayout = "split" | "centered";

export interface CorporateIdentitySettings {
  applicationName: string;
  primaryColor: string;
  secondaryColor: string;
  authenticationLayout: AuthenticationLayout;
}

export interface CorporateIdentity extends CorporateIdentitySettings {
  logoUrl?: string;
}

export const DEFAULT_CORPORATE_IDENTITY: CorporateIdentity = {
  applicationName: "Northstar",
  primaryColor: "#6757e8",
  secondaryColor: "#ee9571",
  authenticationLayout: "split",
};

const EMAIL_DOMAIN_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function normalizeEmailDomain(domain: string): string {
  return domain.normalize("NFC").trim().toLowerCase();
}

export function isValidEmailDomain(domain: string): boolean {
  return EMAIL_DOMAIN_PATTERN.test(normalizeEmailDomain(domain));
}

export function getEmailDomain(email: string): string {
  const separator = email.lastIndexOf("@");
  return separator < 0 ? "" : normalizeEmailDomain(email.slice(separator + 1));
}

export const MEMBER_PERMISSIONS = ["manage_members", "build"] as const;
export const ASSIGNABLE_MEMBER_PERMISSIONS = ["build"] as const;

export type MemberPermission = typeof MEMBER_PERMISSIONS[number];
export type AssignableMemberPermission = typeof ASSIGNABLE_MEMBER_PERMISSIONS[number];

export function permissionsForMemberRole(
  role: MemberRole,
  assigned: readonly AssignableMemberPermission[] = [],
): MemberPermission[] {
  if (role === "owner" || role === "admin") {
    return [...MEMBER_PERMISSIONS];
  }
  if (role === "member") {
    return ASSIGNABLE_MEMBER_PERMISSIONS.filter((permission) => assigned.includes(permission));
  }
  return [];
}

export function hasMemberPermission(member: Pick<Member, "permissions">, permission: MemberPermission): boolean {
  return member.permissions.includes(permission);
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  accent: string;
}

export interface Office {
  id: string;
  teamId: string;
  name: string;
}

export interface Floor {
  id: string;
  officeId: string;
  name: string;
  level: number;
  width: number;
  height: number;
  spawn: Position;
  background: string;
}

export interface Member {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
  email: string;
  title: string;
  role: MemberRole;
  permissions: MemberPermission[];
  color: string;
  availability: Availability;
  online: boolean;
  floorId?: string;
  activity?: string;
  position?: Position;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export type ConversationType = "team" | "room" | "direct" | "meeting";

export interface Conversation {
  id: string;
  name: string;
  type: ConversationType;
  participantIds?: string[];
  roomId?: string;
  meetingId?: string;
  unread: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  body: string;
  createdAt: string;
  sequence: number;
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  type: "image";
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  size: number;
  url: string;
}

export interface Invitation {
  id: string;
  teamId: string;
  email: string;
  role: Exclude<MemberRole, "owner">;
  permissions: AssignableMemberPermission[];
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
}

interface MeetingDetails {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  status: "scheduled" | "live" | "ended";
  participantIds: string[];
}

export type Meeting = MeetingDetails & (
  | { location: { type: "room"; roomId: string } }
  | { location: { type: "public"; floorId: string; x: number; y: number; radius: number } }
);

export interface MiniGameDefinition {
  id: string;
  name: string;
  accent: string;
  objectId: string;
}

export const TETRIS_DEFINITION_ID = "game-tetris" as const;

export interface GameScore {
  id: string;
  roundId: string;
  definitionId: string;
  userId: string;
  score: number;
  lines: number;
  level: number;
  mode: "solo" | "multiplayer";
  playerCount: number;
  placement: number;
  won: boolean;
  playedAt: string;
}

export interface PlayerGameStatistics {
  definitionId: string;
  userId: string;
  gamesPlayed: number;
  multiplayerGamesPlayed: number;
  multiplayerWins: number;
  highestScore: number;
  highestLines: number;
  totalScore: number;
  totalLines: number;
}

export interface GameLobbyState {
  definitionId: string;
  objectId: string;
  floorId: string;
  participantIds: string[];
  capacity: number;
}

export interface GameRoundParticipantState {
  userId: string;
  score: number;
  lines: number;
  level: number;
  status: "playing" | "finished";
  placement?: number;
}

export interface GameRoundState {
  id: string;
  definitionId: string;
  floorId: string;
  startedAt: string;
  status: "playing" | "completed";
  participants: GameRoundParticipantState[];
  completedAt?: string;
  winnerUserId?: string;
}

export interface WorkspaceAccessData {
  conversations: Conversation[];
  messages: ChatMessage[];
  meetings: Meeting[];
  invitations: Invitation[];
}

export interface BootstrapData extends WorkspaceAccessData {
  currentUserId: string;
  corporateIdentity: CorporateIdentity;
  team: Team;
  office: Office;
  floors: Floor[];
  members: Member[];
  layouts: FloorLayout[];
  miniGames: MiniGameDefinition[];
  scores: GameScore[];
  gameStatistics: PlayerGameStatistics[];
  economy: PlayerEconomy;
  gameSettings: GameSettings;
  kidnapping: KidnappingConfiguration;
  registrationSettings?: RegistrationSettings;
}

export interface WorldPlayer {
  userId: string;
  floorId: string;
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
  availability: Availability;
  roomId?: string;
  connected: boolean;
  seat?: {
    objectId: string;
    interactionId: string;
  };
  wavingUntil?: number;
  carriedByUserId?: string;
  proximity?: {
    microphone: boolean;
    camera: boolean;
    callId?: string;
  };
}

export interface WorldSnapshot {
  type: "world.snapshot";
  tick: number;
  floorId: string;
  layoutRevision: number;
  players: WorldPlayer[];
}

export type CallDirection = "incoming" | "outgoing";
export type CallState = "ringing" | "accepted" | "ended" | "declined" | "missed";

export interface RoomKnock {
  id: string;
  roomId: string;
  requesterUserId: string;
  expiresAt: string;
}

export type RoomKnockState = "pending" | "accepted" | "declined" | "expired";

export interface GameState {
  type: "game.state";
  roundId: string;
  definitionId: string;
  grid: number[][];
  score: number;
  lines: number;
  level: number;
  running: boolean;
  paused: boolean;
  activePiece: TetrominoType | null;
  activeCells: TetrisCellPosition[];
  ghostCells: TetrisCellPosition[];
  heldPiece: TetrominoType | null;
  nextPieces: TetrominoType[];
  canHold: boolean;
}

export type ServerEvent =
  | WorldSnapshot
  | { type: "session.ready"; userId: string; floorId: string }
  | { type: "session.synced" }
  | { type: "workspace.snapshot"; data: BootstrapData }
  | { type: "corporate_identity.updated"; corporateIdentity: CorporateIdentity }
  | { type: "presence.changed"; member: Member }
  | { type: "conversation.created"; conversation: Conversation }
  | { type: "chat.message_created"; message: ChatMessage }
  | { type: "chat.ack"; requestId: string; messageId: string }
  | { type: "layout.updated"; layout: FloorLayout; requestId?: string }
  | { type: "workspace.access_updated"; access: WorkspaceAccessData }
  | { type: "layout.conflict"; requestId: string; revision: number }
  | { type: "room.knock_requested"; knock: RoomKnock }
  | { type: "room.knock_state"; knock: RoomKnock; state: RoomKnockState; responderUserId?: string }
  | { type: "room.access_snapshot"; roomIds: string[] }
  | { type: "room.access_revoked"; roomId: string }
  | { type: "interaction.wave"; fromUserId: string; toUserId: string; floorId: string }
  | { type: "interaction.reaction"; id: string; userId: string; reaction: ReactionKind; scope: ReactionScope }
  | { type: "interaction.high_five"; id: string; userIds: [string, string]; floorId: string }
  | { type: "interaction.gong_rang"; ring: GongRing }
  | { type: "interaction.gong_cooldown"; objectId: string; floorId: string; cooldownUntil: number }
  | { type: "call.state"; callId: string; peerUserId: string; direction: CallDirection; state: CallState }
  | { type: "meeting.updated"; meeting: Meeting }
  | { type: "meeting.joined"; meeting: Meeting }
  | { type: "meeting.left"; meetingId: string }
  | { type: "game.lobby_updated"; lobby: GameLobbyState }
  | { type: "game.round_started"; round: GameRoundState }
  | { type: "game.round_updated"; round: GameRoundState }
  | {
    type: "game.round_completed";
    round: GameRoundState;
    scores: GameScore[];
    statistics: PlayerGameStatistics[];
    coinRewards: GameCoinReward[];
  }
  | { type: "economy.updated"; economy: PlayerEconomy; requestId?: string; transaction?: CoinTransaction }
  | { type: "game.settings_updated"; settings: GameSettings }
  | { type: "kidnapping.global_settings_updated"; settings: GlobalKidnappingSettings }
  | { type: "kidnapping.player_settings_updated"; settings: PlayerKidnappingSettings }
  | { type: "kidnapping.started"; carrierUserId: string; carriedUserId: string }
  | { type: "kidnapping.ended"; carrierUserId: string; carriedUserId: string; reason: KidnappingEndReason }
  | GameState
  | { type: "command.error"; requestId?: string; code: string; message: string };

export type ClientCommand =
  | { type: "movement.input"; sequence: number; dx: number; dy: number }
  | { type: "movement.set_destination"; requestId: string; floorId: string; x: number; y: number }
  | { type: "movement.stop"; requestId: string }
  | { type: "movement.approach_user"; requestId: string; targetUserId: string }
  | { type: "kidnapping.start"; requestId: string; targetUserId: string }
  | { type: "kidnapping.stop"; requestId: string }
  | { type: "kidnapping.global_settings_update"; requestId: string; settings: GlobalKidnappingSettings }
  | { type: "kidnapping.player_settings_update"; requestId: string; settings: PlayerKidnappingSettings }
  | { type: "presence.set_availability"; requestId: string; availability: Availability }
  | { type: "proximity.set_media"; requestId: string; microphone: boolean; camera: boolean }
  | { type: "chat.send"; requestId: string; conversationId: string; body: string }
  | { type: "layout.apply"; requestId: string; baseRevision: number; edit: LayoutEdit }
  | { type: "player_asset.place"; requestId: string; baseRevision: number; ownedAssetId: string; position: Position; variantId: string; rotation: AssetRotation }
  | { type: "player_asset.move"; requestId: string; baseRevision: number; objectId: string; position: Position; variantId: string; rotation: AssetRotation }
  | { type: "player_asset.remove"; requestId: string; baseRevision: number; objectId: string }
  | { type: "economy.claim_daily"; requestId: string }
  | { type: "economy.purchase_asset"; requestId: string; assetId: string }
  | { type: "game.settings_update"; requestId: string; settings: GameSettings }
  | { type: "asset.interact"; requestId: string; objectId: string; interactionId: string }
  | { type: "seat.leave"; requestId: string }
  | { type: "room.update_settings"; requestId: string; baseRevision: number; roomId: string; settings: RoomSettings }
  | { type: "room.knock"; requestId: string; roomId: string }
  | { type: "room.knock_respond"; requestId: string; knockId: string; accept: boolean }
  | { type: "interaction.wave"; requestId: string; targetUserId: string }
  | { type: "interaction.react"; requestId: string; reaction: ReactionKind }
  | { type: "interaction.ring_gong"; requestId: string; objectId: string }
  | { type: "call.request"; requestId: string; targetUserId: string }
  | { type: "call.respond"; requestId: string; callId: string; accept: boolean }
  | { type: "call.end"; requestId: string; callId: string }
  | { type: "meeting.join"; requestId: string; meetingId: string }
  | { type: "meeting.leave"; requestId: string; meetingId: string }
  | { type: "game.start"; requestId: string; definitionId: typeof TETRIS_DEFINITION_ID }
  | { type: "game.end"; requestId: string }
  | { type: "game.command"; requestId: string; command: TetrisCommand };

export type KidnappingEndReason = "cancelled" | "interrupted" | "access_revoked";
