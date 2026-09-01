import { ChevronDown, MapPin } from "lucide-react";
import type { ConnectionState } from "../hooks/useRealtime";
import type { Floor } from "@workhard/shared";

interface TopBarProps {
  officeName: string;
  floors: Floor[];
  floorId: string;
  areaName?: string | undefined;
  connection: ConnectionState;
  onFloorChange: (floorId: string) => void;
}

export function TopBar({ officeName, floors, floorId, areaName, connection, onFloorChange }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="office-heading">
        <strong>{officeName}</strong>
        {areaName && (
          <span className="current-area">
            <MapPin size={13} aria-hidden="true" />
            {areaName}
          </span>
        )}
      </div>
      <div className="top-bar-actions">
        <span className={`connection-state ${connection}`} aria-live="polite">
          <span className="connection-dot" aria-hidden="true" />
          <span className={connection === "online" ? "sr-only" : ""}>
            {connection === "online" ? "Online" : connection === "connecting" ? "Connecting" : "Offline"}
          </span>
        </span>
        <label className="floor-picker">
          <span className="sr-only">Floor</span>
          <select value={floorId} onChange={(event) => onFloorChange(event.target.value)}>
            {floors.map((floor) => (
              <option value={floor.id} key={floor.id}>
                {floor.level} · {floor.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>
    </header>
  );
}
