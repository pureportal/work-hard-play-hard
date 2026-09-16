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
  const accessMode = draft.access.mode === "default" ? settings.roomAccess.mode : draft.access.mode;
  const needsDoor = !room.privateEligible && accessMode !== "open";
  const changed = JSON.stringify(draft) !== JSON.stringify(room);
  return <div className="room-permission-editor">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!editable || pending || !changed || needsDoor || !draft.name.trim()) return;
      onSave({ name: draft.name.trim(), color: draft.color, access: draft.access, build: draft.build ?? { mode: "default", assignedPersonIds: [] },
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
        <div className="room-permission-columns"><div>
        <PermissionEditor label="Access" value={draft.access} members={members} organisation={organisation} onChange={(access) => setDraft({ ...draft, access: { ...access, knockable: (access.mode === "default" ? settings.roomAccess.mode : access.mode) !== "open" && draft.access.knockable } })} />
        {accessMode !== "open" && <label className="permission-check room-knocking"><input type="checkbox" checked={draft.access.knockable} onChange={(event) => setDraft({ ...draft, access: { ...draft.access, knockable: event.target.checked } })} />Allow knocking</label>}
        </div>
        <PermissionEditor label="Build" value={draft.build ?? { mode: "default", assignedPersonIds: [] }} members={members} organisation={organisation} onChange={(build) => setDraft({ ...draft, build })} />
        </div>
        {needsDoor && <p role="alert">Add a door before restricting access.</p>}
        {editable && <div className="room-settings-save"><button className="primary-button" type="submit" disabled={!changed || !draft.name.trim() || needsDoor}>{pending ? "Submitting…" : "Propose changes"}</button></div>}
      </fieldset>
    </form>
    {!editable && <p className="room-settings-readonly">You cannot change this room’s settings.</p>}
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
