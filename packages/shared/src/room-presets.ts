import type { Room } from "./building.js";
import type { GameSettings } from "./economy.js";

export type RoomPreset = "shared" | "personal" | "meeting";

export function applyRoomPreset(room: Room, preset: RoomPreset, ownerUserId?: string): Room {
  const next: Room = { ...room, meetingRoom: preset === "meeting", personalAreas: [],
    access: { mode: "open", assignedPersonIds: [], knockable: false },
    build: { mode: "open", assignedPersonIds: [] } };
  delete next.ownerUserId;
  delete next.ownerBuildApproval;
  if (preset !== "personal") return next;
  return { ...next, ...(ownerUserId ? { ownerUserId } : {}), ownerBuildApproval: "direct",
    access: { mode: "assigned", assignedPersonIds: ownerUserId ? [ownerUserId] : [], knockable: true },
    build: { mode: "assigned", assignedPersonIds: ownerUserId ? [ownerUserId] : [] } };
}

export function getRoomPreset(room: Room, settings: GameSettings): RoomPreset | "custom" {
  if (room.personalAreas?.length) return "custom";
  if (room.ownerUserId && !room.meetingRoom && room.access.mode === "assigned" && room.access.knockable
    && room.access.assignedPersonIds.length === 1 && room.access.assignedPersonIds[0] === room.ownerUserId
    && !room.access.unitGrants?.length && !room.access.ceos
    && room.build?.mode === "assigned" && room.build.assignedPersonIds.length === 1
    && room.build.assignedPersonIds[0] === room.ownerUserId && !room.build.unitGrants?.length && !room.build.ceos
    && room.ownerBuildApproval !== "vote") return "personal";
  const access = room.access.mode === "default" ? settings.roomAccess : room.access;
  const build = !room.build || room.build.mode === "default" ? settings.roomBuild : room.build;
  if (!room.ownerUserId && access.mode === "open" && build.mode === "open") return room.meetingRoom ? "meeting" : "shared";
  return "custom";
}
