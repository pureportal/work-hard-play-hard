import { useEffect, useState } from "react";
import { roomAccessAllows, roomBuildAllows, type GameSettings, type Member, type OrganisationState, type Room, type RoomSettings } from "@workhard/shared";
import { PermissionEditor } from "./PermissionEditor";

interface RoomPermissionEditorProps {
  room: Room;
  members: Member[];
  organisation: OrganisationState;
  settings: GameSettings;
  editable: boolean;
  canAssignUnit: boolean;
  pending: boolean;
  onSave: (settings: RoomSettings) => void;
}

export function RoomPermissionEditor({ room, members, organisation, settings, editable, canAssignUnit, pending, onSave }: RoomPermissionEditorProps) {
  const [draft, setDraft] = useState(room);
  useEffect(() => setDraft(room), [room]);
  const needsDoor = !room.privateEligible && draft.access.mode !== "open" && draft.access.mode !== "default";
  return <div className="room-permission-editor">
    <form onSubmit={(event) => {
      event.preventDefault();
      onSave({ name: draft.name, color: draft.color, access: draft.access, build: draft.build ?? { mode: "default", assignedPersonIds: [] },
        ...(draft.organisationUnitId ? { organisationUnitId: draft.organisationUnitId } : {}) });
    }}>
      <fieldset disabled={!editable || pending} className="permission-form-fields">
        <div className="permission-room-name"><label>Name<input value={draft.name} maxLength={60} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Color<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></div>
        <label>Unit<select disabled={!canAssignUnit} value={draft.organisationUnitId ?? ""} onChange={(event) => {
          const next = { ...draft };
          if (event.target.value) next.organisationUnitId = event.target.value;
          else delete next.organisationUnitId;
          setDraft(next);
        }}><option value="">None</option>{organisation.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <PermissionEditor label="Access" value={draft.access} members={members} organisation={organisation} onChange={(access) => setDraft({ ...draft, access: { ...access, knockable: access.mode !== "open" && draft.access.knockable } })} />
        {draft.access.mode !== "open" && <label className="permission-check"><input type="checkbox" checked={draft.access.knockable} onChange={(event) => setDraft({ ...draft, access: { ...draft.access, knockable: event.target.checked } })} />Allow knocking</label>}
        <PermissionEditor label="Build" value={draft.build ?? { mode: "default", assignedPersonIds: [] }} members={members} organisation={organisation} onChange={(build) => setDraft({ ...draft, build })} />
        {needsDoor && <p role="alert">Add a door before restricting access.</p>}
        {editable && <button className="primary-button" type="submit" disabled={!draft.name.trim() || needsDoor}>Save room</button>}
      </fieldset>
    </form>
    <PermissionPreview room={draft} members={members} settings={settings} organisation={organisation} />
  </div>;
}

export function PermissionPreview({ room, members, settings, organisation }: { room: Room; members: Member[]; settings: GameSettings; organisation: OrganisationState }) {
  return <details className="permission-preview"><summary>Preview</summary>
    <table><thead><tr><th>Person</th><th>Access</th><th>Build</th></tr></thead><tbody>
      {members.map((member) => <tr key={member.id}><th scope="row">{member.name}</th>
        <td>{roomAccessAllows(room, member.id, settings, organisation) ? "Yes" : "No"}</td>
        <td>{roomBuildAllows(room, member.id, settings, organisation) ? "Yes" : "No"}</td>
      </tr>)}
    </tbody></table>
  </details>;
}
