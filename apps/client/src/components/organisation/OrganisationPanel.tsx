import { useState } from "react";
import { isUnitWithin, type Member, type OrganisationEdit, type OrganisationState } from "@workhard/shared";
import { SurfaceHeader } from "../SurfaceHeader";
import { OrganisationTree, type OrganisationSelection } from "./OrganisationTree";
import "../../organisation.css";

interface OrganisationPanelProps {
  equalTeam?: boolean;
  organisation: OrganisationState;
  members: Member[];
  currentUserId: string;
  pending: boolean;
  error?: string | undefined;
  onEdit: (edit: OrganisationEdit) => void;
  onClose: () => void;
}

export function OrganisationPanel({ equalTeam = false, organisation, members, currentUserId, pending, error, onEdit, onClose }: OrganisationPanelProps) {
  const [selection, setSelection] = useState<OrganisationSelection>();
  const [creating, setCreating] = useState<{ parentId: string | null }>();
  const canPropose = members.some((member) => member.id === currentUserId);
  const unit = selection?.type === "unit" ? organisation.units.find((candidate) => candidate.id === selection.id) : undefined;
  const person = selection?.type === "person" ? members.find((candidate) => candidate.id === selection.id) : undefined;
  const personAssignment = organisation.assignments.find((assignment) => assignment.userId === person?.id);
  const personIsCeo = Boolean(person && organisation.ceoIds.includes(person.id));
  const editable = unit && canPropose;
  const editor = <>
      {unit && !creating && <section className="organisation-edit" aria-label={`Edit ${unit.name}`}>
        <form key={`${unit.id}-${organisation.revision}`} onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onEdit({ type: "unit.update", unitId: unit.id, name: String(form.get("name")), kind: form.get("kind") as "department" | "team" });
        }}><fieldset disabled={!editable || pending}>
          <label>Name<input name="name" defaultValue={unit.name} required maxLength={60} /></label>
          <label>Type<select name="kind" defaultValue={unit.kind}><option value="department">Department</option><option value="team">Team</option></select></label>
          {editable && <button className="primary-button">Propose changes</button>}
        </fieldset></form>
        {canPropose && <label>Parent<select aria-label="Move unit" disabled={pending} value={unit.parentId ?? ""} onChange={(event) => onEdit({ type: "unit.move", unitId: unit.id, parentId: event.target.value || null })}>
          {canPropose && <option value="">Organisation</option>}
          {organisation.units.filter((candidate) => !isUnitWithin(organisation, candidate.id, unit.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>}
        {editable && <button className="secondary-button" disabled={pending} onClick={() => setCreating({ parentId: unit.id })}>Add subteam</button>}
        {canPropose
          && !organisation.units.some((child) => child.parentId === unit.id)
          && !organisation.assignments.some((assignment) => assignment.unitId === unit.id)
          && <button className="secondary-button danger" disabled={pending} onClick={() => onEdit({ type: "unit.delete", unitId: unit.id })}>Propose deletion</button>}
      </section>}
      {creating && <form className="organisation-edit" aria-label="New unit" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onEdit({ type: "unit.create", name: String(form.get("name")), kind: form.get("kind") as "department" | "team", parentId: creating.parentId });
        setCreating(undefined);
      }}><h3>{creating.parentId ? "New subteam" : "New unit"}</h3><fieldset disabled={pending}>
        <label>Name<input name="name" required maxLength={60} autoFocus /></label>
        <label>Type<select name="kind" defaultValue={creating.parentId ? "team" : "department"}><option value="department">Department</option><option value="team">Team</option></select></label>
        <div className="organisation-edit-actions">
          <button className="secondary-button" type="button" onClick={() => setCreating(undefined)}>Cancel</button>
          <button className="primary-button">Propose unit</button>
        </div>
      </fieldset></form>}
      {person && <section className="organisation-edit" aria-label={`Edit ${person.name}`}>
        {!personIsCeo && canPropose && <>
          <label>Unit<select aria-label={`Move ${person.name}`} disabled={pending} value={personAssignment?.unitId ?? ""} onChange={(event) => onEdit({ type: "member.move", userId: person.id, unitId: event.target.value || null, rank: "member" })}>
            {canPropose && <option value="">Unassigned</option>}
            {organisation.units.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select></label>
          {personAssignment && <label>Rank<select disabled={pending} value={personAssignment.rank} onChange={(event) => onEdit({ type: "member.move", userId: person.id, unitId: personAssignment.unitId, rank: event.target.value as "lead" | "member" })}>
            <option value="member">Member</option>
            {canPropose && <option value="lead">Lead</option>}
          </select></label>}
        </>}
        {!equalTeam && canPropose && !personIsCeo && <button className="secondary-button" disabled={pending} onClick={() => onEdit({ type: "ceo.promote", userId: person.id })}>Propose CEO</button>}
        {canPropose && personIsCeo && organisation.ceoIds.length > 1 && <button className="secondary-button" disabled={pending} onClick={() => onEdit({ type: "ceo.remove", userId: person.id })}>Propose removal</button>}
      </section>}
  </>;
  return <aside className="side-panel organisation-panel" aria-label="Organisation">
    <SurfaceHeader className="panel-header" title="Organisation" onClose={onClose} />
    <div className="panel-scroll organisation-content">
      {error && <p role="alert">{error}</p>}
      {canPropose && <button className="secondary-button" disabled={pending} onClick={() => { setCreating({ parentId: null }); setSelection(undefined); }}>Add unit</button>}
      {creating?.parentId === null && editor}
      <OrganisationTree organisation={organisation} members={members} currentUserId={currentUserId} pending={pending} onEdit={onEdit}
        selection={selection} editor={editor} onSelect={(value) => {
          setSelection(selection?.type === value.type && selection.id === value.id ? undefined : value);
          setCreating(undefined);
        }} />

    </div>
  </aside>;
}
