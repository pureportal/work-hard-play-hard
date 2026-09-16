import { canManageUnit as mayManageUnit, canMoveOrganisationMember as mayMoveMember, isUnitWithin, type Member, type OrganisationEdit, type OrganisationState } from "@workhard/shared";
import { useId, type DragEvent, type ReactNode } from "react";

export type OrganisationSelection = { type: "unit" | "person"; id: string };

interface OrganisationTreeProps {
  equalTeam?: boolean;
  organisation: OrganisationState;
  members: Member[];
  currentUserId: string;
  pending: boolean;
  selection: OrganisationSelection | undefined;
  editor: ReactNode;
  onSelect: (selection: OrganisationSelection) => void;
  onEdit: (edit: OrganisationEdit) => void;
}

const dragType = "application/x-organisation";

export function OrganisationTree({ equalTeam = false, organisation, members, currentUserId, pending, selection, editor, onSelect, onEdit }: OrganisationTreeProps) {
  const treeId = useId();
  const canManageUnit = (...args: Parameters<typeof mayManageUnit>) => equalTeam || mayManageUnit(...args);
  const canMoveOrganisationMember = (...args: Parameters<typeof mayMoveMember>) => equalTeam || mayMoveMember(...args);
  const isCeo = organisation.ceoIds.includes(currentUserId);
  const drop = (event: DragEvent, parentId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const raw = event.dataTransfer.getData(dragType);
    if (!raw) return;
    let dragged: OrganisationSelection;
    try { dragged = JSON.parse(raw) as OrganisationSelection; } catch { return; }
    if (dragged.type === "person") {
      if (!canMoveOrganisationMember(organisation, currentUserId, dragged.id, parentId)) return;
      const assignment = organisation.assignments.find((person) => person.userId === dragged.id);
      const actor = organisation.assignments.find((person) => person.userId === currentUserId);
      const rank = !isCeo && actor?.unitId === parentId ? "member" : assignment?.rank ?? "member";
      onEdit({ type: "member.move", userId: dragged.id, unitId: parentId, rank });
    } else if (dragged.type === "unit") {
      const unit = organisation.units.find((candidate) => candidate.id === dragged.id);
      if (!unit || !canManageUnit(organisation, currentUserId, unit.parentId) || !canManageUnit(organisation, currentUserId, parentId)
        || (parentId && isUnitWithin(organisation, parentId, unit.id))) return;
      onEdit({ type: "unit.move", unitId: unit.id, parentId });
    }
  };
  const person = (member: Member) => {
    const assignment = organisation.assignments.find((item) => item.userId === member.id);
    const ceo = organisation.ceoIds.includes(member.id);
    const manageable = !ceo && (equalTeam || isCeo || Boolean(assignment && canMoveOrganisationMember(organisation, currentUserId, member.id, assignment.unitId)));
    const selectable = manageable || (isCeo && ceo && member.id !== currentUserId
      && !organisation.removalVotes.some((vote) => vote.subjectId === member.id && vote.status === "open"));
    const selected = selection?.type === "person" && selection.id === member.id;
    const content = <><span>{member.name}</span>{assignment?.rank === "lead" && <small>Lead</small>}</>;
    return <li key={member.id} className="organisation-person" data-person-id={member.id}>
      {selectable ? <button type="button" className="organisation-person-row" draggable={!pending && manageable}
        aria-expanded={selected} aria-controls={selected ? `${treeId}-${member.id}` : undefined}
        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData(dragType, JSON.stringify({ type: "person", id: member.id })); }}
        onClick={() => onSelect({ type: "person", id: member.id })}>{content}</button>
        : <div className="organisation-person-row">{content}</div>}
      {selected && selectable && <div id={`${treeId}-${member.id}`}>{editor}</div>}
    </li>;
  };
  const branch = (parentId: string | null) => <ul className="organisation-branches">
    {organisation.units.filter((unit) => unit.parentId === parentId).map((unit) => {
      const manageable = canManageUnit(organisation, currentUserId, unit.id);
      const selected = selection?.type === "unit" && selection.id === unit.id;
      return <li key={unit.id} data-unit-id={unit.id} className="organisation-unit"
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={(event) => drop(event, unit.id)}>
      {manageable ? <button type="button" className="organisation-unit-title" draggable={!pending && canManageUnit(organisation, currentUserId, unit.parentId)}
        aria-expanded={selected} aria-controls={selected ? `${treeId}-${unit.id}` : undefined}
        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData(dragType, JSON.stringify({ type: "unit", id: unit.id })); }} onClick={() => onSelect({ type: "unit", id: unit.id })}>
        {unit.name}
      </button> : <div className="organisation-unit-title">{unit.name}</div>}
      {selected && manageable && <div id={`${treeId}-${unit.id}`}>{editor}</div>}
      <ul className="organisation-members">{members.filter((member) => organisation.assignments.some((assignment) => assignment.userId === member.id && assignment.unitId === unit.id)).map(person)}</ul>
      {branch(unit.id)}
    </li>; })}
  </ul>;
  return <div className="organisation-tree">
    {organisation.ceoIds.length > 0 && <section aria-label="CEOs"><h3>CEOs</h3><ul className="organisation-members">{members.filter((member) => organisation.ceoIds.includes(member.id)).map(person)}</ul></section>}
    <section aria-label="Units" data-drop="root" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, null)}><h3>Units</h3>{branch(null)}</section>
    <section aria-label="Unassigned" data-drop="unassigned" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, null)}><h3>Unassigned</h3>
      <ul className="organisation-members">{members.filter((member) => !organisation.ceoIds.includes(member.id) && !organisation.assignments.some((assignment) => assignment.userId === member.id)).map(person)}</ul>
    </section>
  </div>;
}
