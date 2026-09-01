export type Availability = "available" | "busy" | "dnd" | "away";

export const REACTION_KINDS = ["wave", "heart", "celebrate", "thumbs_up", "laugh", "clap"] as const;

export type ReactionKind = typeof REACTION_KINDS[number];

export type ReactionScope =
  | { type: "floor"; floorId: string }
  | { type: "meeting"; meetingId: string };

export type MemberRole = "owner" | "admin" | "member" | "guest";

export type AreaType =
  | "meeting"
  | "lounge"
  | "desk"
  | "private"
  | "arcade"
  | "kitchen";

export type AreaVisibility = "public" | "members";

export type AreaDoorSide = "top" | "right" | "bottom" | "left";

export type ObjectType =
  | "desk"
  | "table"
  | "sofa"
  | "plant"
  | "arcade"
  | "whiteboard"
  | "portal";

export interface Position {
  x: number;
  y: number;
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
  email: string;
  title: string;
  role: MemberRole;
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

export interface Wall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorTile {
  id: string;
  x: number;
  y: number;
  color: string;
}

export interface WorldObject {
  id: string;
  floorId: string;
  type: ObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  solid: boolean;
  interactive: boolean;
}

export interface Area {
  id: string;
  floorId: string;
  name: string;
  type: AreaType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  capacity: number;
  locked: boolean;
  visibility: AreaVisibility;
  memberIds?: string[];
  doors: AreaDoor[];
}

export interface AreaDoor {
  id: string;
  side: AreaDoorSide;
  offset: number;
  width: number;
}

export interface FloorLayout {
  floorId: string;
  revision: number;
  walls: Wall[];
  tiles: FloorTile[];
  objects: WorldObject[];
  areas: Area[];
}

export type ConversationType = "team" | "area" | "direct" | "meeting";

export interface Conversation {
  id: string;
  name: string;
  type: ConversationType;
  participantIds?: string[];
  areaId?: string;
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
  | { location: { type: "room"; areaId: string } }
  | { location: { type: "public"; floorId: string; x: number; y: number; radius: number } }
);

export interface MiniGameDefinition {
  id: string;
  name: string;
  accent: string;
  objectId: string;
}

export interface GameScore {
  id: string;
  definitionId: string;
  userId: string;
  score: number;
  lines: number;
  playedAt: string;
}

export interface WorkspaceAccessData {
  conversations: Conversation[];
  messages: ChatMessage[];
  meetings: Meeting[];
  invitations: Invitation[];
}

export interface BootstrapData extends WorkspaceAccessData {
  currentUserId: string;
  team: Team;
  office: Office;
  floors: Floor[];
  members: Member[];
  layouts: FloorLayout[];
  miniGames: MiniGameDefinition[];
  scores: GameScore[];
}

export interface WorldPlayer {
  userId: string;
  floorId: string;
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
  availability: Availability;
  areaId?: string;
  connected: boolean;
  wavingUntil?: number;
}

export interface WorldSnapshot {
  type: "world.snapshot";
  tick: number;
  floorId: string;
  layoutRevision: number;
  players: WorldPlayer[];
}

export type CallDirection = "incoming" | "outgoing";
export type CallState = "ringing" | "connected" | "ended" | "declined" | "missed";

export interface AreaKnock {
  id: string;
  areaId: string;
  requesterUserId: string;
  expiresAt: string;
}

export type AreaKnockState = "pending" | "accepted" | "declined" | "expired";

export type LayoutTool = "wall" | "door" | "desk" | "sofa" | "plant" | "erase";

export interface AreaSettings {
  type: "meeting" | "private";
  locked: boolean;
  visibility: AreaVisibility;
}

export interface GameState {
  type: "game.state";
  definitionId: string;
  grid: number[][];
  score: number;
  lines: number;
  level: number;
  running: boolean;
  paused: boolean;
}

export type ServerEvent =
  | WorldSnapshot
  | { type: "session.ready"; userId: string; floorId: string }
  | { type: "workspace.snapshot"; data: BootstrapData }
  | { type: "presence.changed"; member: Member }
  | { type: "conversation.created"; conversation: Conversation }
  | { type: "chat.message_created"; message: ChatMessage }
  | { type: "chat.ack"; requestId: string; messageId: string }
  | { type: "layout.updated"; layout: FloorLayout }
  | { type: "workspace.access_updated"; access: WorkspaceAccessData }
  | { type: "layout.conflict"; revision: number }
  | { type: "area.knock_requested"; knock: AreaKnock }
  | { type: "area.knock_state"; knock: AreaKnock; state: AreaKnockState; responderUserId?: string }
  | { type: "area.access_snapshot"; areaIds: string[] }
  | { type: "area.access_revoked"; areaId: string }
  | { type: "interaction.wave"; fromUserId: string; toUserId: string; floorId: string }
  | { type: "interaction.reaction"; id: string; userId: string; reaction: ReactionKind; scope: ReactionScope }
  | { type: "interaction.high_five"; id: string; userIds: [string, string]; floorId: string }
  | { type: "call.state"; callId: string; peerUserId: string; direction: CallDirection; state: CallState }
  | { type: "meeting.updated"; meeting: Meeting }
  | { type: "meeting.joined"; meeting: Meeting }
  | { type: "meeting.left"; meetingId: string }
  | GameState
  | { type: "game.completed"; score: GameScore }
  | { type: "command.error"; requestId?: string; code: string; message: string };

export type ClientCommand =
  | { type: "movement.input"; sequence: number; dx: number; dy: number }
  | { type: "movement.set_destination"; requestId: string; x: number; y: number }
  | { type: "movement.approach_user"; requestId: string; targetUserId: string }
  | { type: "floor.change"; requestId: string; floorId: string }
  | { type: "presence.set_availability"; requestId: string; availability: Availability }
  | { type: "chat.send"; requestId: string; conversationId: string; body: string }
  | { type: "layout.apply"; requestId: string; baseRevision: number; tool: LayoutTool; x: number; y: number }
  | { type: "area.update_settings"; requestId: string; areaId: string; settings: AreaSettings }
  | { type: "area.knock"; requestId: string; areaId: string }
  | { type: "area.knock_respond"; requestId: string; knockId: string; accept: boolean }
  | { type: "interaction.wave"; requestId: string; targetUserId: string }
  | { type: "interaction.react"; requestId: string; reaction: ReactionKind }
  | { type: "call.request"; requestId: string; targetUserId: string }
  | { type: "call.respond"; requestId: string; callId: string; accept: boolean }
  | { type: "call.end"; requestId: string; callId: string }
  | { type: "meeting.join"; requestId: string; meetingId: string }
  | { type: "meeting.leave"; requestId: string; meetingId: string }
  | { type: "game.start"; requestId: string; definitionId: string }
  | { type: "game.end"; requestId: string }
  | { type: "game.command"; requestId: string; command: "left" | "right" | "rotate" | "down" | "drop" | "pause" };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ROOM_WALL_THICKNESS = 12;

export function isEnclosedArea(area: Area): boolean {
  return area.type === "meeting" || area.type === "private";
}

export function getAreaDoorRect(area: Area, door: AreaDoor, thickness = ROOM_WALL_THICKNESS): Rect {
  const halfThickness = thickness / 2;
  if (door.side === "top" || door.side === "bottom") {
    return {
      x: area.x + door.offset,
      y: (door.side === "top" ? area.y : area.y + area.height) - halfThickness,
      width: door.width,
      height: thickness,
    };
  }
  return {
    x: (door.side === "left" ? area.x : area.x + area.width) - halfThickness,
    y: area.y + door.offset,
    width: thickness,
    height: door.width,
  };
}

export function getAreaDoorPosition(
  area: Area,
  door: AreaDoor,
  position: "center" | "inside" | "outside" = "center",
  distance = 36,
): Position {
  const direction = position === "center" ? 0 : position === "inside" ? 1 : -1;
  if (door.side === "top") {
    return { x: area.x + door.offset + door.width / 2, y: area.y + direction * distance };
  }
  if (door.side === "bottom") {
    return { x: area.x + door.offset + door.width / 2, y: area.y + area.height - direction * distance };
  }
  if (door.side === "left") {
    return { x: area.x + direction * distance, y: area.y + door.offset + door.width / 2 };
  }
  return { x: area.x + area.width - direction * distance, y: area.y + door.offset + door.width / 2 };
}

export function getAreaBoundaryWalls(area: Area, thickness = ROOM_WALL_THICKNESS): Rect[] {
  const walls: Rect[] = [];
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const length = side === "top" || side === "bottom" ? area.width : area.height;
    const doors = area.doors
      .filter((door) => door.side === side)
      .map((door) => ({ start: Math.max(0, door.offset), end: Math.min(length, door.offset + door.width) }))
      .filter((door) => door.end > door.start)
      .sort((left, right) => left.start - right.start);
    let cursor = 0;
    for (const door of doors) {
      if (door.start > cursor) {
        walls.push(areaBoundarySegment(area, side, cursor, door.start - cursor, thickness));
      }
      cursor = Math.max(cursor, door.end);
    }
    if (cursor < length) {
      walls.push(areaBoundarySegment(area, side, cursor, length - cursor, thickness));
    }
  }
  return walls;
}

function areaBoundarySegment(
  area: Area,
  side: AreaDoorSide,
  offset: number,
  length: number,
  thickness: number,
): Rect {
  const halfThickness = thickness / 2;
  if (side === "top" || side === "bottom") {
    return {
      x: area.x + offset,
      y: (side === "top" ? area.y : area.y + area.height) - halfThickness,
      width: length,
      height: thickness,
    };
  }
  return {
    x: (side === "left" ? area.x : area.x + area.width) - halfThickness,
    y: area.y + offset,
    width: thickness,
    height: length,
  };
}
