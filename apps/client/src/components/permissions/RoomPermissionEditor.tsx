import { useEffect, useState } from "react";
import type { GameSettings, Member, OrganisationState, Room, RoomSettings } from "@workhard/shared";
import { PermissionEditor } from "./PermissionEditor";
import { PermissionPreview } from "./PermissionPreview";
import { applyRoomPreset, getRoomPreset, roomAccessAllows, validatePersonalSpaces, type RoomPreset } from "@workhard/shared";
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
  const [preset, setPreset] = useState(getRoomPreset(room, settings));
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => { setDraft(room); setPreset(getRoomPreset(room, settings)); setAdvanced(false); }, [room, settings]);
  const accessMode = draft.access.mode === "default" ? settings.roomAccess.mode : draft.access.mode;
  const needsDoor = !room.privateEligible && accessMode !== "open";
  const changed = JSON.stringify(draft) !== JSON.stringify(room);
  const accessibleMemberIds = new Set(members.filter((member) => roomAccessAllows(draft, member.id, settings, organisation)).map((member) => member.id));
  const missingOwner = preset === "personal" && !draft.ownerUserId;
  const ownerBuildApproval = draft.ownerBuildApproval ?? (room.privateEligible ? "direct" : "vote");
  const ownerNeedsAccess = ownerBuildApproval === "direct" && Boolean(draft.ownerUserId && !accessibleMemberIds.has(draft.ownerUserId));
  let spacesError: string | undefined;
  try { validatePersonalSpaces(room, draft, members.map((member) => member.id)); }
  catch { spacesError = "Keep each area inside the room, without overlaps."; }
  return <div className="room-permission-editor">
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!editable || pending || !changed || needsDoor || ownerNeedsAccess || missingOwner || spacesError || !draft.name.trim()) return;
      onSave({ name: draft.name.trim(), color: draft.color, meetingRoom: Boolean(draft.meetingRoom), access: draft.access, build: draft.build ?? { mode: "default", assignedPersonIds: [] },
        ...(draft.ownerUserId ? { ownerBuildApproval } : {}),
        ...(draft.organisationUnitId ? { organisationUnitId: draft.organisationUnitId } : {}),
        ...(draft.ownerUserId ? { ownerUserId: draft.ownerUserId } : {}), personalAreas: draft.personalAreas ?? [] });
    }}>
      <fieldset disabled={!editable || pending} className="permission-form-fields">
        <div className="permission-room-name"><label>Name<input value={draft.name} maxLength={60} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Color<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label></div>
        <label>Room type<select value={preset} onChange={(event) => {
          const value = event.target.value as RoomPreset | "custom";
          if (value === "custom") return;
          setPreset(value);
          setDraft(applyRoomPreset(draft, value, draft.ownerUserId));
        }}><option value="shared">Shared room</option><option value="personal" disabled={!room.privateEligible}>Personal room</option><option value="meeting">Meeting room</option>
          {preset === "custom" && <option value="custom" disabled>Custom</option>}
        </select></label>
        {(preset === "personal" || draft.ownerUserId) && <label>Room owner<select value={draft.ownerUserId ?? ""} onChange={(event) => {
          const ownerUserId = event.target.value;
          if (preset === "personal") setDraft(applyRoomPreset(draft, "personal", ownerUserId));
          else { const next = { ...draft, personalAreas: [] }; if (ownerUserId) next.ownerUserId = ownerUserId; else { delete next.ownerUserId; delete next.ownerBuildApproval; } setDraft(next); }
        }}><option value="">Select owner</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
        {room.meetingRoom && !draft.meetingRoom && <p>Turning this off ends the room call.</p>}
        {room.personalAreas?.length && !draft.personalAreas?.length ? <p>This removes the room’s personal areas.</p> : null}
      </fieldset>
      <button type="button" className="secondary-button" disabled={pending} aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>Advanced</button>
      <fieldset disabled={!editable || pending} className="permission-form-fields">
        {advanced && <div className="room-advanced-settings" inert={!editable || pending} onChange={() => setPreset("custom")}>
          <label className="permission-check"><input type="checkbox" checked={Boolean(draft.meetingRoom)} onChange={(event) => setDraft({ ...draft, meetingRoom: event.target.checked })} />Meeting room</label>
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
          <PermissionEditor label="Build" value={draft.build ?? { mode: "default", assignedPersonIds: [] }} members={members} organisation={organisation} eligibleMemberIds={accessibleMemberIds} onChange={(build) => setDraft({ ...draft, build })} />
          </div>
          <PersonalSpacesEditor room={draft} members={members} onChange={(next) => { setDraft(next); setPreset("custom"); }} />
          {!draft.ownerUserId && <label>Room owner<select value="" onChange={(event) => setDraft({ ...draft, ownerUserId: event.target.value, ownerBuildApproval: room.privateEligible ? "direct" : "vote", personalAreas: [] })}>
            <option value="">None</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>}
          {draft.ownerUserId && <label>Owner's furnishing<select value={ownerBuildApproval} onChange={(event) => setDraft({ ...draft, ownerBuildApproval: event.target.value as "vote" | "direct" })}>
            <option value="vote">With approval</option><option value="direct" disabled={!room.privateEligible || !accessibleMemberIds.has(draft.ownerUserId)}>Apply directly</option>
          </select></label>}
        </div>}
        {missingOwner && <p role="alert">Choose a room owner.</p>}
        {ownerNeedsAccess && <p role="alert">Give the owner room access to skip approval.</p>}
        {spacesError && <p role="alert">{spacesError}</p>}
        {needsDoor && <p role="alert">Add a door before restricting access.</p>}
        {editable && <div className="room-settings-save"><button className="primary-button" type="submit" disabled={!changed || !draft.name.trim() || needsDoor || ownerNeedsAccess || missingOwner || Boolean(spacesError)}>{pending ? "Submitting…" : "Propose changes"}</button></div>}
      </fieldset>
    </form>
    {!editable && <p className="room-settings-readonly">You cannot change this room’s settings.</p>}
    {advanced && <PermissionPreview room={draft} members={members} settings={settings} organisation={organisation} />}
  </div>;
}
