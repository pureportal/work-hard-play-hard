import { useEffect, useState } from "react";
import type { GameSettings, Member, OrganisationState, Room, RoomSettings } from "@workhard/shared";
import { PermissionEditor } from "./PermissionEditor";
import { PermissionPreview } from "./PermissionPreview";
import { validatePersonalSpaces } from "@workhard/shared";
import { PersonalSpacesEditor } from "./PersonalSpacesEditor";

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
  let spacesError: string | undefined;
  try { validatePersonalSpaces(room, draft, members.map((member) => member.id)); }
  catch { spacesError = "Keep each area inside the room, without overlaps."; }
  return <div className="room-permission-editor">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!editable || pending || !changed || needsDoor || spacesError || !draft.name.trim()) return;
      onSave({ name: draft.name.trim(), color: draft.color, meetingRoom: Boolean(draft.meetingRoom), access: draft.access, build: draft.build ?? { mode: "default", assignedPersonIds: [] },
        ...(draft.organisationUnitId ? { organisationUnitId: draft.organisationUnitId } : {}),
        ...(draft.ownerUserId ? { ownerUserId: draft.ownerUserId } : {}), personalAreas: draft.personalAreas ?? [] });
    }}>
      <fieldset disabled={!editable || pending} className="permission-form-fields">
        <div className="permission-room-name"><label>Name<input value={draft.name} maxLength={60} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Color<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></div>
        <label className="permission-check"><input type="checkbox" checked={Boolean(draft.meetingRoom)} onChange={(event) => setDraft({ ...draft, meetingRoom: event.target.checked })} />Meeting room</label>
        {room.meetingRoom && !draft.meetingRoom && <p>Turning this off ends the room call.</p>}
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
        <PersonalSpacesEditor room={draft} members={members} onChange={setDraft} />
        {spacesError && <p role="alert">{spacesError}</p>}
        {needsDoor && <p role="alert">Add a door before restricting access.</p>}
        {editable && <div className="room-settings-save"><button className="primary-button" type="submit" disabled={!changed || !draft.name.trim() || needsDoor || Boolean(spacesError)}>{pending ? "Submitting…" : "Propose changes"}</button></div>}
      </fieldset>
    </form>
    {!editable && <p className="room-settings-readonly">You cannot change this room’s settings.</p>}
    <PermissionPreview room={draft} members={members} settings={settings} organisation={organisation} />
  </div>;
}
