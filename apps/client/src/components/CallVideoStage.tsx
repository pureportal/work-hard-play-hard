import { LayoutGrid, Pin } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface CallVideoTile {
  id: string;
  name: string;
  content: ReactNode;
  details?: ReactNode;
  background?: string;
  screen?: boolean;
}

export function CallVideoStage({ tiles, expanded, className = "" }: { tiles: CallVideoTile[]; expanded: boolean; className?: string }) {
  const [choice, setChoice] = useState<string | "gallery" | null>(null);
  const screenIds = tiles.filter((tile) => tile.screen).map((tile) => tile.id).join("|");
  const previousScreenIds = useRef(screenIds);
  useEffect(() => {
    const previous = new Set(previousScreenIds.current.split("|"));
    if (screenIds.split("|").some((id) => id && !previous.has(id))) setChoice(null);
    previousScreenIds.current = screenIds;
  }, [screenIds]);
  const selectedId = expanded && choice !== "gallery"
    ? tiles.some((tile) => tile.id === choice) ? choice : tiles.find((tile) => tile.screen)?.id
    : undefined;
  const selected = tiles.find((tile) => tile.id === selectedId);

  const renderTile = (tile: CallVideoTile, primary = false) => <article className={`video-tile${tile.screen ? " meeting-screen-tile" : ""}${primary ? " is-primary" : ""}`}
    key={tile.id} style={tile.background ? { background: tile.background } : undefined}>
    {tile.content}
    <footer><strong>{tile.name}</strong>{tile.details}</footer>
    {expanded && <button type="button" className="call-tile-focus" aria-label={primary ? "Show gallery" : `Focus ${tile.name}`}
      title={primary ? "Show gallery" : `Focus ${tile.name}`} onClick={() => setChoice(primary ? "gallery" : tile.id)}>
      {primary ? <LayoutGrid size={17} /> : <Pin size={17} />}
    </button>}
  </article>;

  return <div className={`call-video-stage ${className}${selected ? " is-focused" : ""}`}>
    {selected ? <><div className="call-stage-primary">{renderTile(selected, true)}</div>
      {tiles.length > 1 && <div className="call-stage-filmstrip">{tiles.filter((tile) => tile.id !== selected.id).map((tile) => renderTile(tile))}</div>}
    </> : <div className="video-grid" data-count={tiles.length}>{tiles.map((tile) => renderTile(tile))}</div>}
  </div>;
}
