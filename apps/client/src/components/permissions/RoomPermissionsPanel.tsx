import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { canEditRoomPermissions, type Floor, type FloorLayout, type GameSettings, type Member, type OrganisationState, type RoomSettings } from "@workhard/shared";
import { IconButton } from "../IconButton";
import { PermissionEditor } from "./PermissionEditor";
import { PermissionPreview, RoomPermissionEditor } from "./RoomPermissionEditor";
import "../../permissions.css";

interface RoomPermissionsPanelProps {
  floors: Floor[];
  layouts: FloorLayout[];
  currentFloorId: string;
  currentUser: Member;
  members: Member[];
  organisation: OrganisationState;
  settings: GameSettings;
  pending: boolean;
  onSaveRoom: (roomId: string, revision: number, settings: RoomSettings) => void;
  onSaveDefaults: (settings: GameSettings) => void;
  onBack: () => void;
  onClose: () => void;
}

export function RoomPermissionsPanel({ floors, layouts, currentFloorId, currentUser, members, organisation, settings, pending, onSaveRoom, onSaveDefaults, onBack, onClose }: RoomPermissionsPanelProps) {
  const [tab, setTab] = useState<"rooms" | "defaults">("rooms");
  const [floorId, setFloorId] = useState(currentFloorId);
  const [roomId, setRoomId] = useState("");
  const [defaults, setDefaults] = useState(settings);
  useEffect(() => setDefaults(settings), [settings]);
  const layout = layouts.find((candidate) => candidate.floorId === floorId)!;
  const room = layout.rooms.find((candidate) => candidate.id === roomId) ?? layout.rooms[0];
  const isCeo = organisation.ceoIds.includes(currentUser.id);
  const canManageDefaults = currentUser.permissions.includes("manage_members") || isCeo;
  return <aside className="side-panel permissions-panel" aria-label="Room settings">
    <div className="panel-header"><IconButton label="Back to build" icon={ArrowLeft} onClick={onBack} /><h2>Room settings</h2><IconButton label="Close room settings" icon={X} onClick={onClose} /></div>
    <div className="permission-tabs" role="tablist" aria-label="Room settings views">
      <button role="tab" aria-selected={tab === "rooms"} onClick={() => setTab("rooms")}>Rooms</button>
      <button role="tab" aria-selected={tab === "defaults"} onClick={() => setTab("defaults")}>Defaults</button>
    </div>
    <div className="panel-scroll permission-content">
      {tab === "rooms" ? <>
        <label>Floor<select value={floorId} onChange={(event) => { setFloorId(event.target.value); setRoomId(""); }}>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </select></label>
        <label>Room<select value={room?.id ?? ""} onChange={(event) => setRoomId(event.target.value)}>
          {layout.rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>
        {room && <RoomPermissionEditor key={room.id} room={room} members={members} organisation={organisation} settings={settings}
          editable={canEditRoomPermissions(room, currentUser.id, currentUser.permissions, organisation)} canAssignUnit={isCeo || currentUser.permissions.includes("build")}
          pending={pending} onSave={(value) => onSaveRoom(room.id, layout.revision, value)} />}
      </> : <>
        <form onSubmit={(event) => { event.preventDefault(); onSaveDefaults(defaults); }}>
          <fieldset className="permission-form-fields" disabled={!canManageDefaults || pending}>
            <PermissionEditor label="Access" allowDefault={false} value={defaults.roomAccess} members={members} organisation={organisation} onChange={(value) => setDefaults({ ...defaults, roomAccess: value as GameSettings["roomAccess"] })} />
            <PermissionEditor label="Build" allowDefault={false} value={defaults.roomBuild} members={members} organisation={organisation} onChange={(value) => setDefaults({ ...defaults, roomBuild: value as GameSettings["roomBuild"] })} />
            {canManageDefaults && <button type="submit" className="primary-button">Save defaults</button>}
          </fieldset>
        </form>
        {room && <PermissionPreview room={{ ...room, access: { mode: "default", assignedPersonIds: [], knockable: false }, build: { mode: "default", assignedPersonIds: [] } }} members={members} settings={defaults} organisation={organisation} />}
      </>}
    </div>
  </aside>;
}
