import { randomUUID } from "node:crypto";
import { canManageUnit, canMoveOrganisationMember, isUnitWithin, type OrganisationEdit, type OrganisationState, type RoomPermission } from "@workhard/shared";
import { organisationEditSchema, organisationStateSchema, roomPermissionSchema } from "./organisation-schema.js";

export function applyOrganisationEdit(state: OrganisationState, memberIds: string[], actorId: string, baseRevision: number, input: OrganisationEdit, approved = false): OrganisationState {
  const edit = organisationEditSchema.parse(input);
  if (state.revision !== baseRevision) throw new Error("ORGANISATION_CONFLICT");
  if (!memberIds.includes(actorId)) throw new Error("USER_NOT_FOUND");
  const next = structuredClone(state);
  const isCeo = approved || next.ceoIds.includes(actorId);
  const requireUnit = (unitId: string) => {
    const unit = next.units.find((candidate) => candidate.id === unitId);
    if (!unit) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
    return unit;
  };
  const requireManagement = (unitId: string | null) => {
    if (unitId) requireUnit(unitId);
    if (!approved && !canManageUnit(next, actorId, unitId)) throw new Error("ORGANISATION_FORBIDDEN");
  };
  if ("userId" in edit && !memberIds.includes(edit.userId)) throw new Error("USER_NOT_FOUND");
  switch (edit.type) {
    case "unit.create":
      requireManagement(edit.parentId);
      if (next.units.length >= 500) throw new Error("ORGANISATION_LIMIT");
      next.units.push({ id: randomUUID(), name: edit.name, kind: edit.kind, parentId: edit.parentId });
      break;
    case "unit.update": {
      requireManagement(edit.unitId);
      Object.assign(requireUnit(edit.unitId), { name: edit.name, kind: edit.kind });
      break;
    }
    case "unit.move": {
      const unit = requireUnit(edit.unitId);
      requireManagement(unit.parentId);
      requireManagement(edit.parentId);
      if (edit.parentId && isUnitWithin(next, edit.parentId, unit.id)) throw new Error("ORGANISATION_CYCLE");
      unit.parentId = edit.parentId;
      break;
    }
    case "unit.delete": {
      const unit = requireUnit(edit.unitId);
      requireManagement(unit.parentId);
      if (next.units.some((child) => child.parentId === unit.id) || next.assignments.some((person) => person.unitId === unit.id)) throw new Error("ORGANISATION_UNIT_NOT_EMPTY");
      next.units = next.units.filter((candidate) => candidate.id !== unit.id);
      break;
    }
    case "member.move": {
      if (next.ceoIds.includes(edit.userId)) throw new Error("CEO_VOTE_REQUIRED");
      if (edit.unitId) requireUnit(edit.unitId);
      if (!approved && !canMoveOrganisationMember(next, actorId, edit.userId, edit.unitId)) throw new Error("ORGANISATION_FORBIDDEN");
      const actor = next.assignments.find((person) => person.userId === actorId);
      if (!isCeo && edit.rank === "lead" && actor?.unitId === edit.unitId) throw new Error("ORGANISATION_FORBIDDEN");
      next.assignments = next.assignments.filter((person) => person.userId !== edit.userId);
      if (edit.unitId) next.assignments.push({ userId: edit.userId, unitId: edit.unitId, rank: edit.rank });
      break;
    }
    case "ceo.promote":
      if (!isCeo) throw new Error("ORGANISATION_FORBIDDEN");
      if (next.ceoIds.includes(edit.userId)) throw new Error("CEO_ALREADY_ASSIGNED");
      next.ceoIds.push(edit.userId);
      next.assignments = next.assignments.filter((person) => person.userId !== edit.userId);
      break;
    case "ceo.propose_removal":
      if (!isCeo || actorId === edit.userId) throw new Error("ORGANISATION_FORBIDDEN");
      if (!next.ceoIds.includes(edit.userId)) throw new Error("CEO_NOT_FOUND");
      if (next.ceoIds.length < 2) throw new Error("CEO_LAST_REQUIRED");
      if (next.removalVotes.some((vote) => vote.subjectId === edit.userId && vote.status === "open")) throw new Error("CEO_VOTE_EXISTS");
      next.removalVotes.push({ id: randomUUID(), subjectId: edit.userId, proposedBy: actorId,
        electorate: next.ceoIds.filter((userId) => userId !== edit.userId), ballots: [], status: "open" });
      break;
    case "ceo.vote": {
      const vote = next.removalVotes.find((candidate) => candidate.id === edit.voteId);
      if (!vote || vote.status !== "open") throw new Error("CEO_VOTE_CLOSED");
      if (!isCeo || !vote.electorate.includes(actorId)) throw new Error("ORGANISATION_FORBIDDEN");
      if (vote.ballots.some((ballot) => ballot.userId === actorId)) throw new Error("CEO_ALREADY_VOTED");
      vote.ballots.push({ userId: actorId, approve: edit.approve });
      const required = Math.floor(vote.electorate.length / 2) + 1;
      const yes = vote.ballots.filter((ballot) => ballot.approve).length;
      if (yes >= required) {
        if (next.ceoIds.length < 2) throw new Error("CEO_LAST_REQUIRED");
        vote.status = "passed";
        next.ceoIds = next.ceoIds.filter((userId) => userId !== vote.subjectId);
        for (const pending of next.removalVotes) {
          if (pending.status === "open" && (pending.subjectId === vote.subjectId || pending.electorate.includes(vote.subjectId))) pending.status = "cancelled";
        }
      } else if (yes + vote.electorate.length - vote.ballots.length < required) vote.status = "rejected";
      break;
    }
  }
  next.revision += 1;
  validateOrganisation(next, memberIds);
  return next;
}

export function validateOrganisation(state: OrganisationState, memberIds: string[]): void {
  organisationStateSchema.parse(state);
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(state.ceoIds)
    || state.ceoIds.some((id) => !memberIds.includes(id)) || !unique(state.units.map((unit) => unit.id))
    || !unique(state.assignments.map((person) => person.userId))) throw new Error("ORGANISATION_INVALID");
  for (const unit of state.units) {
    if (unit.parentId && (!state.units.some((parent) => parent.id === unit.parentId) || isUnitWithin(state, unit.parentId, unit.id))) throw new Error("ORGANISATION_CYCLE");
  }
  for (const person of state.assignments) {
    if (!memberIds.includes(person.userId) || state.ceoIds.includes(person.userId) || !state.units.some((unit) => unit.id === person.unitId)) throw new Error("ORGANISATION_INVALID");
  }
  if (!unique(state.removalVotes.map((vote) => vote.id))) throw new Error("ORGANISATION_INVALID");
  for (const vote of state.removalVotes) {
    if (!vote.electorate.length || vote.electorate.includes(vote.subjectId) || !unique(vote.electorate)
      || !unique(vote.ballots.map((ballot) => ballot.userId)) || vote.ballots.some((ballot) => !vote.electorate.includes(ballot.userId))
      || (vote.status === "open" && (!state.ceoIds.includes(vote.subjectId) || vote.electorate.some((id) => !state.ceoIds.includes(id))))) throw new Error("ORGANISATION_INVALID");
  }
}

export function validateRoomPermission(permission: RoomPermission, state: OrganisationState, memberIds: string[]): void {
  roomPermissionSchema.parse({ mode: permission.mode, assignedPersonIds: permission.assignedPersonIds,
    ...(permission.unitGrants ? { unitGrants: permission.unitGrants } : {}), ...(permission.ceos === undefined ? {} : { ceos: permission.ceos }) });
  if (permission.assignedPersonIds.some((id) => !memberIds.includes(id))) throw new Error("ROOM_ASSIGNEE_NOT_FOUND");
  if (permission.unitGrants?.some((grant) => !state.units.some((unit) => unit.id === grant.unitId))) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
}
