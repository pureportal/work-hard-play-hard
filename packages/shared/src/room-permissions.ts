import type { Room } from "./building.js";
import type { GameSettings } from "./economy.js";
import { canManageUnit, isUnitWithin, type OrganisationState } from "./organisation.js";

export interface RoomPermission {
  mode: "default" | "open" | "assigned" | "none";
  assignedPersonIds: string[];
  unitGrants?: { unitId: string; rank: "members" | "leads"; descendants: boolean }[];
  ceos?: boolean;
}

export type DefaultRoomPermission = RoomPermission & { mode: Exclude<RoomPermission["mode"], "default"> };

export function permissionAllows(permission: RoomPermission, userId: string, organisation: OrganisationState): boolean {
  if (permission.mode === "open") return true;
  if (permission.mode !== "assigned") return false;
  if (permission.assignedPersonIds.includes(userId)) return true;
  if (permission.ceos && organisation.ceoIds.includes(userId)) return true;
  const assignment = organisation.assignments.find((member) => member.userId === userId);
  return Boolean(assignment && permission.unitGrants?.some((grant) =>
    (grant.rank === "members" || assignment.rank === "lead")
    && (grant.descendants ? isUnitWithin(organisation, assignment.unitId, grant.unitId) : assignment.unitId === grant.unitId)));
}

export function roomAccessAllows(room: Room, userId: string, settings: GameSettings, organisation: OrganisationState): boolean {
  return permissionAllows(room.access.mode === "default" ? settings.roomAccess : room.access, userId, organisation);
}

export function roomBuildAllows(room: Room, userId: string, settings: GameSettings, organisation: OrganisationState): boolean {
  return roomAccessAllows(room, userId, settings, organisation)
    && permissionAllows(!room.build || room.build.mode === "default" ? settings.roomBuild : room.build, userId, organisation);
}

export function canEditRoomPermissions(room: Room, userId: string, permissions: readonly string[], organisation: OrganisationState): boolean {
  return permissions.includes("build") || organisation.ceoIds.includes(userId)
    || Boolean(room.organisationUnitId && canManageUnit(organisation, userId, room.organisationUnitId));
}
