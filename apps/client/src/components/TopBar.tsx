import { ChevronDown, Coins, LoaderCircle, MapPin, Moon, Sun, WifiOff } from "lucide-react";
import type { ConnectionState } from "../hooks/useRealtime";
import type { ColorTheme } from "../theme";
import type { Floor } from "@workhard/shared";
import { IconButton } from "./IconButton";

interface TopBarProps {
  officeName: string;
  floors: Floor[];
  floorId: string;
  roomName?: string | undefined;
  connection: ConnectionState;
  coinBalance?: number | undefined;
  colorTheme?: ColorTheme;
  onColorThemeChange?: (theme: ColorTheme) => void;
  onFloorChange: (floorId: string) => void;
}

export function TopBar({ officeName, floors, floorId, roomName, connection, coinBalance, colorTheme = "light", onColorThemeChange, onFloorChange }: TopBarProps) {
  const connectionLabel = connection === "online" ? "Connected" : connection === "connecting" ? "Connecting" : "Connection Lost";
  const selectedFloor = floors.find((floor) => floor.id === floorId);

  return (
    <header className="top-bar">
      <div className={`office-heading ${roomName ? "has-room" : ""}`}>
        <strong className="office-name">{officeName}</strong>
        {roomName && (
          <span className="current-room">
            <MapPin size={13} aria-hidden="true" />
            <span>{roomName}</span>
          </span>
        )}
      </div>
      <div className="top-bar-actions">
        {onColorThemeChange && (
          <IconButton
            className="theme-toggle"
            label={`Use ${colorTheme === "dark" ? "light" : "dark"} mode`}
            icon={colorTheme === "dark" ? Sun : Moon}
            onClick={() => onColorThemeChange(colorTheme === "dark" ? "light" : "dark")}
          />
        )}
        {coinBalance !== undefined && (
          <span className="top-bar-coins" aria-label={`${coinBalance.toLocaleString()} coins`}>
            <Coins size={15} aria-hidden="true" />
            {coinBalance.toLocaleString()}
          </span>
        )}
        <span className="sr-only" role="status" aria-live="polite">{connectionLabel}</span>
        {connection !== "online" && (
          <span
            className={`connection-state ${connection}`}
            role="img"
            aria-label={connectionLabel}
            tabIndex={0}
          >
            {connection === "connecting"
              ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
              : <WifiOff size={16} aria-hidden="true" />}
            <span className="connection-tooltip" role="tooltip">{connectionLabel}</span>
          </span>
        )}
        <label className="floor-picker">
          <select aria-label="Floor" value={floorId} onChange={(event) => onFloorChange(event.target.value)}>
            {floors.map((floor) => (
              <option value={floor.id} key={floor.id}>
                {floor.level} · {floor.name}
              </option>
            ))}
          </select>
          {selectedFloor && (
            <span className="floor-picker-value" aria-hidden="true">
              <span className="floor-picker-level">{selectedFloor.level} ·</span>
              <span>{selectedFloor.name}</span>
            </span>
          )}
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>
    </header>
  );
}
