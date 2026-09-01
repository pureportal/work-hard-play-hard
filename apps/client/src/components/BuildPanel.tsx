import { DoorOpen, Eraser, Flower2, LockKeyhole, PanelsTopLeft, Sofa, Square, Unlock, X } from "lucide-react";
import type { AreaSettings, FloorLayout, LayoutTool } from "@workhard/shared";
import type { LucideIcon } from "lucide-react";
import { IconButton } from "./IconButton";

interface BuildPanelProps {
  layout: FloorLayout;
  tool: LayoutTool | null;
  onToolChange: (tool: LayoutTool | null) => void;
  onUpdateArea: (areaId: string, settings: AreaSettings) => void;
  onClose: () => void;
}

const tools: { id: LayoutTool | null; label: string; icon: LucideIcon }[] = [
  { id: null, label: "Select", icon: PanelsTopLeft },
  { id: "wall", label: "Wall", icon: Square },
  { id: "door", label: "Door", icon: DoorOpen },
  { id: "desk", label: "Desk", icon: PanelsTopLeft },
  { id: "sofa", label: "Sofa", icon: Sofa },
  { id: "plant", label: "Plant", icon: Flower2 },
  { id: "erase", label: "Erase", icon: Eraser },
];

export function BuildPanel({ layout, tool, onToolChange, onUpdateArea, onClose }: BuildPanelProps) {
  const lockableAreas = layout.areas.filter((area) => area.type === "meeting" || area.type === "private");
  return (
    <aside className="side-panel build-panel" aria-label="Build">
      <div className="panel-header">
        <div>
          <h2>Build</h2>
        </div>
        <IconButton label="Close build tools" icon={X} onClick={onClose} />
      </div>

      <div className="panel-scroll build-panel-scroll">
        <div className="build-tools" role="toolbar" aria-label="Layout tools">
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={label}
              className={tool === id ? "active" : ""}
              aria-pressed={tool === id}
              onClick={() => onToolChange(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <section className="build-section">
          <h3>Rooms</h3>
          {lockableAreas.map((area) => (
            <div className="room-control" key={area.id}>
            <span className="room-swatch" style={{ background: area.color }} />
            <span>{area.name}</span>
            <select
              aria-label={`${area.name} type`}
              value={area.type}
              onChange={(event) => onUpdateArea(area.id, {
                type: event.target.value as AreaSettings["type"],
                locked: area.locked,
                visibility: area.visibility,
              })}
            >
              <option value="meeting">Meeting</option>
              <option value="private">Private</option>
            </select>
            <select
              aria-label={`${area.name} visibility`}
              value={area.visibility}
              onChange={(event) => onUpdateArea(area.id, {
                type: area.type as AreaSettings["type"],
                locked: area.locked,
                visibility: event.target.value as AreaSettings["visibility"],
              })}
            >
              <option value="public">Visible</option>
              <option value="members">Members only</option>
            </select>
            <IconButton
              label={`${area.locked ? "Unlock" : "Lock"} ${area.name}`}
              icon={area.locked ? LockKeyhole : Unlock}
              onClick={() => onUpdateArea(area.id, {
                type: area.type as AreaSettings["type"],
                locked: !area.locked,
                visibility: area.visibility,
              })}
            />
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
}
