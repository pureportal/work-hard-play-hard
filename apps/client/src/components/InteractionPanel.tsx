import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { InteractionArea } from "../hooks/useInteractionAreas";

export function InteractionPanel({ areas, active, onSelect, children }: {
  areas: InteractionArea[];
  active: InteractionArea;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const [collapsedId, setCollapsedId] = useState<string>();
  const collapsed = collapsedId === active.id;
  const contentId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const focusToggle = useRef(false);
  const index = areas.findIndex((area) => area.id === active.id);
  const navigate = (offset: number) => onSelect(areas[(index + offset + areas.length) % areas.length]!.id);

  useEffect(() => setCollapsedId(undefined), [active.id]);
  useEffect(() => {
    if (!focusToggle.current) return;
    (collapsed ? toggleRef : closeRef).current?.focus({ preventScroll: true });
    focusToggle.current = false;
  }, [collapsed]);

  const collapse = () => {
    focusToggle.current = true;
    setCollapsedId(active.id);
  };

  return (
    <section className={`interaction-panel${collapsed ? " is-collapsed" : ""}`} aria-label="Nearby actions"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || collapsed) return;
        event.preventDefault();
        event.stopPropagation();
        collapse();
      }}>
      {collapsed ? (
        <button ref={toggleRef} className="interaction-expand" aria-label={`Show ${active.label}`} aria-expanded={false} aria-controls={contentId}
          onClick={() => { focusToggle.current = true; setCollapsedId(undefined); }}>
          <span>{active.label}</span><ChevronDown size={17} />
        </button>
      ) : areas.length > 1 ? (
        <nav className="interaction-navigation" aria-label="Interaction areas">
          <button aria-label="Previous interaction" onClick={() => navigate(-1)}><ChevronLeft size={17} /></button>
          <select aria-label="Active interaction" value={active.id} onChange={(event) => onSelect(event.target.value)}>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}
          </select>
          <button aria-label="Next interaction" onClick={() => navigate(1)}><ChevronRight size={17} /></button>
          <button ref={closeRef} aria-label="Hide nearby actions" aria-expanded={true} aria-controls={contentId} onClick={collapse}><X size={17} /></button>
        </nav>
      ) : (
        <button ref={closeRef} className="interaction-dismiss" aria-label="Hide nearby actions" aria-expanded={true} aria-controls={contentId} onClick={collapse}><X size={17} /></button>
      )}
      <div className="interaction-content" id={contentId} key={active.id} hidden={collapsed}>{children}</div>
    </section>
  );
}
