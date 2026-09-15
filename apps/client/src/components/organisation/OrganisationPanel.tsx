import { useState } from "react";
import { X } from "lucide-react";
import { canManageUnit, canMoveOrganisationMember, isUnitWithin, type Member, type OrganisationEdit, type OrganisationState } from "@workhard/shared";
import { IconButton } from "../IconButton";
import { OrganisationTree, type OrganisationSelection } from "./OrganisationTree";
import "../../organisation.css";

interface OrganisationPanelProps {
  organisation: OrganisationState;
  members: Member[];
  currentUserId: string;
  pending: boolean;
  onEdit: (edit: OrganisationEdit) => void;
  onClose: () => void;
}

export function OrganisationPanel({ organisation, members, currentUserId, pending, onEdit, onClose }: OrganisationPanelProps) {
  const [selection, setSelection] = useState<OrganisationSelection>();
  const [creating, setCreating] = useState<{ parentId: string | null }>();
  const isCeo = organisation.ceoIds.includes(currentUserId);
  const unit = selection?.type === "unit" ? organisation.units.find((candidate) => candidate.id === selection.id) : undefined;
  const person = selection?.type === "person" ? members.find((candidate) => candidate.id === selection.id) : undefined;
  const personAssignment = organisation.assignments.find((assignment) => assignment.userId === person?.id);
  const personIsCeo = Boolean(person && organisation.ceoIds.includes(person.id));
  const editable = unit && canManageUnit(organisation, currentUserId, unit.id);
  const votes = organisation.removalVotes.filter((vote) => vote.status === "open").concat(organisation.removalVotes.filter((vote) => vote.status !== "open").slice(-5));
  const editor = <>
      {unit && !creating && <section className="organisation-edit" aria-label={`Edit ${unit.name}`}>
        <form key={`${unit.id}-${organisation.revision}`} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onEdit({ type: "unit.update", unitId: unit.id, name: String(form.get("name")), kind: form.get("kind") as "department" | "team" });
        }}><fieldset disabled={!editable || pending}>
          <label>Name<input name="name" defaultValue={unit.name} required maxLength={60} /></label>
          <label>Type<select name="kind" defaultValue={unit.kind}><option value="department">Department</option><option value="team">Team</option></select></label>
          {editable && <button className="primary-button">Save unit</button>}
        </fieldset></form>
        {canManageUnit(organisation, currentUserId, unit.parentId) && <label>Parent<select aria-label="Move unit" disabled={pending} value={unit.parentId ?? ""} onChange={(event) => onEdit({ type: "unit.move", unitId: unit.id, parentId: event.target.value || null })}>
          {isCeo && <option value="">Organisation</option>}
          {organisation.units.filter((candidate) => canManageUnit(organisation, currentUserId, candidate.id) && !isUnitWithin(organisation, candidate.id, unit.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>}
        {editable && <button className="secondary-button" disabled={pending} onClick={() => setCreating({ parentId: unit.id })}>Add subteam</button>}
        {canManageUnit(organisation, currentUserId, unit.parentId)
          && !organisation.units.some((child) => child.parentId === unit.id)
          && !organisation.assignments.some((assignment) => assignment.unitId === unit.id)
          && <button className="secondary-button danger" disabled={pending} onClick={() => onEdit({ type: "unit.delete", unitId: unit.id })}>Delete unit</button>}
      </section>}
      {creating && <form className="organisation-edit" aria-label="New unit" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onEdit({ type: "unit.create", name: String(form.get("name")), kind: form.get("kind") as "department" | "team", parentId: creating.parentId });
        setCreating(undefined);
      }}><h3>{creating.parentId ? "New subteam" : "New unit"}</h3><fieldset disabled={pending}>
        <label>Name<input name="name" required maxLength={60} autoFocus /></label>
        <label>Type<select name="kind" defaultValue={creating.parentId ? "team" : "department"}><option value="department">Department</option><option value="team">Team</option></select></label>
        <button className="primary-button">Create unit</button>
        <button className="secondary-button" type="button" onClick={() => setCreating(undefined)}>Cancel</button>
      </fieldset></form>}
      {person && <section className="organisation-edit" aria-label={`Edit ${person.name}`}>
        {!personIsCeo && (isCeo || Boolean(personAssignment && canMoveOrganisationMember(organisation, currentUserId, person.id, personAssignment.unitId))) && <>
          <label>Unit<select aria-label={`Move ${person.name}`} disabled={pending} value={personAssignment?.unitId ?? ""} onChange={(event) => onEdit({ type: "member.move", userId: person.id, unitId: event.target.value || null, rank: "member" })}>
            {isCeo && <option value="">Unassigned</option>}
            {organisation.units.filter((candidate) => canMoveOrganisationMember(organisation, currentUserId, person.id, candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select></label>
          {personAssignment && <label>Rank<select disabled={pending} value={personAssignment.rank} onChange={(event) => onEdit({ type: "member.move", userId: person.id, unitId: personAssignment.unitId, rank: event.target.value as "lead" | "member" })}>
            <option value="member">Member</option>
            {(isCeo || !organisation.assignments.some((assignment) => assignment.userId === currentUserId && assignment.unitId === personAssignment.unitId)) && <option value="lead">Lead</option>}
          </select></label>}
        </>}
        {isCeo && !personIsCeo && <button className="secondary-button" disabled={pending} onClick={() => {
          if (window.confirm(`Promote ${person.name} to CEO? Removing them will require a vote.`)) onEdit({ type: "ceo.promote", userId: person.id });
        }}>Promote to CEO</button>}
        {isCeo && personIsCeo && person.id !== currentUserId && !votes.some((vote) => vote.subjectId === person.id && vote.status === "open") && <button className="secondary-button" disabled={pending} onClick={() => onEdit({ type: "ceo.propose_removal", userId: person.id })}>Start removal vote</button>}
      </section>}
  </>;
  return <aside className="side-panel organisation-panel" aria-label="Organisation">
    <div className="panel-header"><h2>Organisation</h2><IconButton label="Close organisation" icon={X} onClick={onClose} /></div>
    <div className="panel-scroll organisation-content">
      {isCeo && <button className="secondary-button" disabled={pending} onClick={() => { setCreating({ parentId: null }); setSelection(undefined); }}>Add unit</button>}
      {creating?.parentId === null && editor}
      <OrganisationTree organisation={organisation} members={members} currentUserId={currentUserId} pending={pending} onEdit={onEdit}
        selection={selection} editor={editor} onSelect={(value) => {
          setSelection(selection?.type === value.type && selection.id === value.id ? undefined : value);
          setCreating(undefined);
        }} />
      {votes.length > 0 && <section className="organisation-votes" aria-label="CEO votes"><h3>CEO votes</h3>{votes.map((vote) => <div className="organisation-vote" key={vote.id}>
        <strong>Remove {members.find((member) => member.id === vote.subjectId)?.name} as CEO</strong>
        <span>{vote.status === "open" ? `${vote.ballots.filter((ballot) => ballot.approve).length} of ${Math.floor(vote.electorate.length / 2) + 1} required votes` : vote.status[0]!.toUpperCase() + vote.status.slice(1)}</span>
        {vote.status === "open" && vote.electorate.includes(currentUserId) && !vote.ballots.some((ballot) => ballot.userId === currentUserId) && <div>
          <button className="secondary-button" disabled={pending} onClick={() => onEdit({ type: "ceo.vote", voteId: vote.id, approve: true })}>Vote to remove</button>
          <button className="secondary-button" disabled={pending} onClick={() => onEdit({ type: "ceo.vote", voteId: vote.id, approve: false })}>Vote to keep</button>
        </div>}
      </div>)}</section>}
    </div>
  </aside>;
}
