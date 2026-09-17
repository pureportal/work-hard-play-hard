import { useRef, useState, type PointerEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { BUILD_GRID_SIZE, rectanglesOverlap, roomContainsBounds, type Member, type Rect, type Room } from "@workhard/shared";

export function PersonalSpacesEditor({ room, members, onChange }: { room: Room; members: Member[]; onChange: (room: Room) => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [drawing, setDrawing] = useState(false);
  const [preview, setPreview] = useState<Rect>();
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const areas = room.personalAreas ?? [];
  const selected = areas.find((area) => area.id === selectedId);
  const bounds = room.bounds;
  const addArea = () => {
    if (!members.length) return;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += BUILD_GRID_SIZE) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += BUILD_GRID_SIZE) {
        const areaBounds = { x, y, width: BUILD_GRID_SIZE, height: BUILD_GRID_SIZE };
        if (!roomContainsBounds(room, areaBounds) || areas.some((area) => rectanglesOverlap(area.bounds, areaBounds))) continue;
        const id = crypto.randomUUID();
        onChange({ ...room, personalAreas: [...areas, { id, name: "Workspace", ownerUserId: members[0]!.id, bounds: areaBounds }] });
        setSelectedId(id);
        setDrawing(true);
        return;
      }
    }
  };
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const world = point.matrixTransform(event.currentTarget.getScreenCTM()!.inverse());
    return { x: Math.round(world.x / BUILD_GRID_SIZE) * BUILD_GRID_SIZE, y: Math.round(world.y / BUILD_GRID_SIZE) * BUILD_GRID_SIZE };
  };
  const rectangle = (end: { x: number; y: number }): Rect => ({ x: Math.min(start.current!.x, end.x), y: Math.min(start.current!.y, end.y),
    width: Math.max(BUILD_GRID_SIZE, Math.abs(end.x - start.current!.x)), height: Math.max(BUILD_GRID_SIZE, Math.abs(end.y - start.current!.y)) });
  return <section className="personal-spaces-editor" aria-label="Personal spaces">
    <label>Room owner<select value={room.ownerUserId ?? ""} onChange={(event) => {
      const next = { ...room };
      if (event.target.value) { next.ownerUserId = event.target.value; next.personalAreas = []; }
      else delete next.ownerUserId;
      onChange(next);
    }}><option value="">Shared room</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    {!room.ownerUserId && <>
      <div className="personal-spaces-heading"><h4>Personal areas</h4><button type="button" className="secondary-button" disabled={areas.length >= 100}
        onClick={addArea}><Plus size={15} />Add area</button></div>
      {drawing && <p>Drag in the room to mark an area.</p>}
      <svg className={`personal-space-map${drawing ? " is-drawing" : ""}`} viewBox={`${bounds.x - 16} ${bounds.y - 16} ${bounds.width + 32} ${bounds.height + 32}`}
        role="img" aria-label={`Personal areas in ${room.name}`}
        onPointerDown={(event) => { if (!drawing) return; event.currentTarget.setPointerCapture(event.pointerId); start.current = position(event); }}
        onPointerMove={(event) => { if (drawing && start.current) setPreview(rectangle(position(event))); }}
        onPointerCancel={() => { start.current = undefined; setPreview(undefined); }}
        onPointerUp={(event) => {
          if (!drawing || !start.current) return;
          onChange({ ...room, personalAreas: areas.map((area) => area.id === selectedId ? { ...area, bounds: rectangle(position(event)) } : area) });
          start.current = undefined;
          setPreview(undefined);
          setDrawing(false);
        }}>
        {room.footprint.map((rect, index) => <rect key={index} {...rect} className="personal-space-floor" />)}
        {areas.map((area, index) => <g key={area.id} onClick={() => { if (!drawing) setSelectedId(area.id); }}>
          <rect {...area.bounds} className={`personal-space-region${selectedId === area.id ? " selected" : ""}`} />
          <text x={area.bounds.x + area.bounds.width / 2} y={area.bounds.y + area.bounds.height / 2} textAnchor="middle" dominantBaseline="middle">{index + 1}</text>
        </g>)}
        {preview && <rect {...preview} className="personal-space-region selected" />}
      </svg>
      {areas.length > 0 && <label>Area<select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">Select area</option>{areas.map((area, index) => <option key={area.id} value={area.id}>{index + 1} · {area.name} · {members.find((member) => member.id === area.ownerUserId)?.name}</option>)}
      </select></label>}
      {selected && <div className="personal-area-fields">
        <label>Name<input value={selected.name} maxLength={60} required onChange={(event) => onChange({ ...room, personalAreas: areas.map((area) => area.id === selected.id ? { ...area, name: event.target.value } : area) })} /></label>
        <label>Owner<select value={selected.ownerUserId} onChange={(event) => onChange({ ...room, personalAreas: areas.map((area) => area.id === selected.id ? { ...area, ownerUserId: event.target.value } : area) })}>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select></label>
        <div className="personal-area-dimensions">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "x" ? "Left" : key === "y" ? "Top" : key === "width" ? "Width" : "Height"}
          <input type="number" step={BUILD_GRID_SIZE} min={key === "width" || key === "height" ? BUILD_GRID_SIZE : bounds[key]} value={selected.bounds[key]}
            onChange={(event) => onChange({ ...room, personalAreas: areas.map((area) => area.id === selected.id ? { ...area, bounds: { ...area.bounds, [key]: Number(event.target.value) } } : area) })} />
        </label>)}</div>
        <button type="button" className="secondary-button" onClick={() => { onChange({ ...room, personalAreas: areas.filter((area) => area.id !== selected.id) }); setSelectedId(undefined); }}><Trash2 size={15} />Remove area</button>
      </div>}
    </>}
  </section>;
}
