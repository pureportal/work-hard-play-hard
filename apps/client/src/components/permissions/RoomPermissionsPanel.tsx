import { DoorOpen, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { canEditRoomPermissions, permissionAllows, publicFundForUnit, publicFundMemberIds, type Floor, type FloorLayout, type GameSettings, type Member, type OrganisationState, type PublicEconomy, type RoomSettings } from "@workhard/shared";
import { WorkspaceDialog } from "../WorkspaceDialog";
import { DialogTabs } from "../DialogTabs";
import { PermissionEditor } from "./PermissionEditor";
import { PermissionPreview } from "./PermissionPreview";
import { RoomPermissionEditor } from "./RoomPermissionEditor";
import "../../permissions.css";

interface RoomPermissionsPanelProps {
  initialRoomId?: string;
  equalTeam?: boolean;
  floors: Floor[];
  layouts: FloorLayout[];
  currentFloorId: string;
  currentUser: Member;
  members: Member[];
  organisation: OrganisationState;
  publicEconomy: PublicEconomy;
  settings: GameSettings;
  pending: boolean;
  error?: string | undefined;
  onSaveRoom: (roomId: string, revision: number, settings: RoomSettings) => void;
  onSaveDefaults: (settings: GameSettings) => void;
  onBack: () => void;
  onClose: () => void;
}

export function RoomPermissionsPanel({ initialRoomId = "", equalTeam = false, floors, layouts, currentFloorId, currentUser, members, organisation, publicEconomy, settings, pending, error, onSaveRoom, onSaveDefaults, onBack, onClose }: RoomPermissionsPanelProps) {
  const [tab, setTab] = useState<"rooms" | "defaults">("rooms");
  const [floorId, setFloorId] = useState(currentFloorId);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [defaults, setDefaults] = useState(settings);
  useEffect(() => setDefaults(settings), [settings]);
  const layout = layouts.find((candidate) => candidate.floorId === floorId)!;
  const room = layout.rooms.find((candidate) => candidate.id === roomId) ?? layout.rooms[0];
  const roomFund = publicFundForUnit(publicEconomy, organisation, room?.organisationUnitId);
  const canVoteOnRoom = publicFundMemberIds(roomFund, organisation, members.map((member) => member.id)).includes(currentUser.id);
  const isCeo = organisation.ceoIds.includes(currentUser.id);
  const canManageDefaults = members.some((member) => member.id === currentUser.id);
  const defaultAccessibleIds = new Set(members.filter((member) => permissionAllows(defaults.roomAccess, member.id, organisation)).map((member) => member.id));
  return <WorkspaceDialog title="Room settings" className="room-settings-dialog" error={error} onBack={onBack} onClose={onClose}>
    <DialogTabs label="Room settings views" tabs={[{ id: "rooms", label: "Rooms" }, { id: "defaults", label: "Defaults" }]} value={tab} onChange={setTab}>
      {tab === "rooms" ? <div className="room-settings-layout">
        <nav className="room-directory permission-content" aria-label="Rooms" data-guide="room-directory">
        <label>Floor<select value={floorId} onChange={(event) => { setFloorId(event.target.value); setRoomId(""); }}>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </select></label>
        <label className="mobile-room-picker">Room<select value={room?.id ?? ""} onChange={(event) => setRoomId(event.target.value)}>
          {layout.rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>
        <div className="room-directory-list">{layout.rooms.map((candidate) => {
          const restricted = (candidate.access.mode === "default" ? settings.roomAccess.mode : candidate.access.mode) !== "open";
          const Icon = restricted ? LockKeyhole : DoorOpen;
          return <button type="button" key={candidate.id} aria-pressed={room?.id === candidate.id} onClick={() => setRoomId(candidate.id)}>
            <Icon size={18} aria-hidden="true" /><span>{candidate.name}</span></button>;
        })}</div>
        </nav>
        <div className="room-settings-detail permission-content">{room ? <><h3>{room.name}</h3><RoomPermissionEditor key={room.id} room={room} members={members} organisation={organisation} settings={settings}
          editable={canVoteOnRoom || canEditRoomPermissions(room, currentUser.id, organisation)} canAssignUnit={equalTeam || isCeo || canVoteOnRoom}
          pending={pending} onSave={(value) => onSaveRoom(room.id, layout.revision, value)} /></> : <div className="dialog-empty"><DoorOpen size={32} /><p>No rooms on this floor.</p></div>}</div>
      </div> : <div className="permission-content room-defaults">
        <form onSubmit={(event) => { event.preventDefault(); onSaveDefaults(defaults); }}>
          <fieldset className="permission-form-fields" disabled={!canManageDefaults || pending}>
            <div className="room-permission-columns">
            <PermissionEditor label="Access" allowDefault={false} value={defaults.roomAccess} members={members} organisation={organisation} onChange={(value) => setDefaults({ ...defaults, roomAccess: value as GameSettings["roomAccess"] })} />
            <PermissionEditor label="Build" allowDefault={false} value={defaults.roomBuild} members={members} organisation={organisation} eligibleMemberIds={defaultAccessibleIds} onChange={(value) => setDefaults({ ...defaults, roomBuild: value as GameSettings["roomBuild"] })} />
            </div>
            {canManageDefaults && <div className="room-settings-save"><button type="submit" className="primary-button" disabled={JSON.stringify(defaults) === JSON.stringify(settings)}>Propose defaults</button></div>}
          </fieldset>
        </form>
        {room && <PermissionPreview room={{ ...room, access: { mode: "default", assignedPersonIds: [], knockable: false }, build: { mode: "default", assignedPersonIds: [] } }} members={members} settings={defaults} organisation={organisation} />}
      </div>}
    </DialogTabs>
  </WorkspaceDialog>;
}
