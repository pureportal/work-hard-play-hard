import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { InteractionArea } from "../hooks/useInteractionAreas";

export function InteractionPanel({ areas, active, onSelect, children }: {
  areas: InteractionArea[];
  active: InteractionArea;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const index = areas.findIndex((area) => area.id === active.id);
  const navigate = (offset: number) => onSelect(areas[(index + offset + areas.length) % areas.length]!.id);
  return (
    <section className="interaction-panel" aria-label="Nearby actions">
      {areas.length > 1 && (
        <nav className="interaction-navigation" aria-label="Interaction areas">
          <button aria-label="Previous interaction" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button>
          <select aria-label="Active interaction" value={active.id} onChange={(event) => onSelect(event.target.value)}>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
          <span aria-hidden="true">{index + 1}/{areas.length}</span>
          <button aria-label="Next interaction" onClick={() => navigate(1)}><ChevronRight size={17} /></button>
        </nav>
      )}
      <div className="interaction-content" key={active.id}>{children}</div>
    </section>
  );
}
