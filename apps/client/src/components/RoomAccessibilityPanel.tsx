import { ArrowLeft, Check, LockKeyhole, Users, X } from "lucide-react";
import { useId } from "react";
import type { Floor, FloorLayout, Member, PlayerRoomAccessibility, RoomEntryStatus } from "@workhard/shared";
import { roomEntryAppearance } from "../room-accessibility";
import { IconButton } from "./IconButton";
import "../room-accessibility.css";

interface RoomAccessibilityPanelProps {
  members: Member[];
  floors: Floor[];
  layouts: FloorLayout[];
  selectedUserId: string;
  accessibility: PlayerRoomAccessibility | undefined;
  connected: boolean;
  onPlayerChange: (userId: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export function RoomAccessibilityPanel({ members, floors, layouts, selectedUserId, accessibility, connected, onPlayerChange, onBack, onClose }: RoomAccessibilityPanelProps) {
  const playerInputId = useId();
  const results = connected && accessibility?.userId === selectedUserId ? accessibility.floors : undefined;
  return (
    <aside className="side-panel build-panel" aria-label="Room access">
      <div className="panel-header">
        <IconButton label="Back to build" icon={ArrowLeft} onClick={onBack} />
        <h2>Room access</h2>
        <IconButton label="Close room access" icon={X} onClick={onClose} />
      </div>
      <div className="panel-scroll build-panel-scroll room-access-panel">
        <div className="room-access-player">
          <label htmlFor={playerInputId}>Player</label>
          <select id={playerInputId} value={selectedUserId} onChange={(event) => onPlayerChange(event.target.value)}>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </div>
        {!results && <p role="status">{connected ? "Loading…" : "Reconnecting…"}</p>}
        {results && floors.map((floor) => {
          const result = results.find((item) => item.floorId === floor.id);
          const layout = layouts.find((item) => item.floorId === floor.id);
          if (!result || !layout) return null;
          return (
            <section className="build-section" key={floor.id} aria-label={floor.name}>
              <h3>{floor.name}</h3>
              <ul className="room-access-list">
                <li><span>Open areas</span><RoomEntryStatusView status="accessible" /></li>
                {layout.rooms.map((room) => {
                  const entry = result.rooms.find((item) => item.roomId === room.id);
                  return entry && <li key={room.id}><span>{room.name}</span><RoomEntryStatusView status={entry.status} /></li>;
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function RoomEntryStatusView({ status }: { status: RoomEntryStatus }) {
  const { label, color } = roomEntryAppearance[status];
  const Icon = status === "accessible" ? Check : status === "restricted" ? LockKeyhole : Users;
  return <span className="room-entry-status"><Icon size={16} color={color} aria-hidden="true" />{label}</span>;
}
