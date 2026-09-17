export interface OrganisationalUnit {
  id: string;
  name: string;
  kind: "department" | "team";
  parentId: string | null;
}

export interface OrganisationAssignment {
  userId: string;
  unitId: string;
  rank: "lead" | "member";
}

export interface OrganisationState {
  revision: number;
  ceoIds: string[];
  units: OrganisationalUnit[];
  assignments: OrganisationAssignment[];
}

export type OrganisationEdit =
  | { type: "unit.create"; name: string; kind: OrganisationalUnit["kind"]; parentId: string | null }
  | { type: "unit.update"; unitId: string; name: string; kind: OrganisationalUnit["kind"] }
  | { type: "unit.move"; unitId: string; parentId: string | null }
  | { type: "unit.delete"; unitId: string }
  | { type: "member.move"; userId: string; unitId: string | null; rank: OrganisationAssignment["rank"] }
  | { type: "ceo.promote"; userId: string }
  | { type: "ceo.remove"; userId: string };

export function createOrganisation(firstUserId?: string): OrganisationState {
  return { revision: 0, ceoIds: firstUserId ? [firstUserId] : [], units: [], assignments: [] };
}

export function isUnitWithin(organisation: OrganisationState, unitId: string, ancestorId: string): boolean {
  const visited = new Set<string>();
  let current: string | null = unitId;
  while (current && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = organisation.units.find((unit) => unit.id === current)?.parentId ?? null;
  }
  return false;
}

export function canManageUnit(organisation: OrganisationState, actorId: string, unitId: string | null): boolean {
  if (organisation.ceoIds.includes(actorId)) return true;
  if (!unitId) return false;
  return organisation.assignments.some((assignment) => assignment.userId === actorId
    && assignment.rank === "lead" && isUnitWithin(organisation, unitId, assignment.unitId));
}
