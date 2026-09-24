import { useRef, useState, type PointerEvent } from "react";
import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { WHITEBOARD_STATUSES, type WhiteboardCard, type WhiteboardStatus } from "@workhard/shared";
import { WhiteboardCardContent } from "./WhiteboardCardContent";
import { statusLabels } from "./whiteboard-model";
import { useContextActions } from "../ContextMenu";

interface Props {
  cards: WhiteboardCard[];
  disabled: boolean;
  full: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onAdd: (status: WhiteboardStatus) => void;
  onMove: (id: string, status: WhiteboardStatus, beforeId?: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function WhiteboardBoard({ cards, disabled, full, selectedId, onSelect, onAdd, onMove, onDuplicate, onRemove }: Props) {
  const contextActions = useContextActions();
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number } | undefined>(undefined);
  const didDrag = useRef(false);
  const [target, setTarget] = useState<{ status: WhiteboardStatus; beforeId?: string }>();
  const [draggedId, setDraggedId] = useState<string>();

  const dropTarget = (event: PointerEvent<HTMLButtonElement>) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const column = element?.closest<HTMLElement>("[data-whiteboard-status]");
    const status = column?.dataset.whiteboardStatus as WhiteboardStatus | undefined;
    if (!status) return undefined;
    const card = element?.closest<HTMLElement>("[data-whiteboard-card]");
    return { status, ...(card?.dataset.whiteboardCard ? { beforeId: card.dataset.whiteboardCard } : {}) };
  };

  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const destination = dropTarget(event);
    drag.current = undefined;
    setDraggedId(undefined);
    setTarget(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && !disabled && destination && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5) {
      onMove(current.id, destination.status, destination.beforeId);
    }
  };

  return <div className="whiteboard-columns" aria-label="Task board">
    {WHITEBOARD_STATUSES.map((status) => <section key={status} data-whiteboard-status={status}
      className={`whiteboard-column column-${status}${target?.status === status ? " drop-target" : ""}`} aria-label={statusLabels[status]}>
      <header><span className="whiteboard-column-dot" /><h3>{statusLabels[status]}</h3><span className="whiteboard-column-count">{cards.filter((card) => card.status === status).length}</span></header>
      <div className="whiteboard-column-cards">
        {cards.filter((card) => card.status === status).map((card) => <article key={card.id} data-whiteboard-card={card.id}
          tabIndex={0} {...contextActions(() => [
            { label: "Edit", icon: Pencil, onSelect: () => onSelect(card.id) },
            { label: "Duplicate", icon: Copy, onSelect: () => onDuplicate(card.id), disabled: disabled || full },
            { label: "Delete", icon: Trash2, onSelect: () => onRemove(card.id), disabled, danger: true },
          ])}
          className={`whiteboard-card board-card color-${card.color} kind-${card.kind}${selectedId === card.id ? " selected" : ""}${draggedId === card.id ? " dragging" : ""}${target?.beforeId === card.id ? " insert-before" : ""}`}>
          <button className="whiteboard-drag-handle" data-context-press-ignore aria-label={`Drag ${card.title || "card"}`} disabled={disabled}
            onPointerDown={(event) => {
              if (disabled || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              didDrag.current = false;
              drag.current = { id: card.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              if (!drag.current || disabled || event.pointerId !== drag.current.pointerId) return;
              if (Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 5) {
                didDrag.current = true;
                setDraggedId(card.id);
                setTarget(dropTarget(event));
              }
            }}
            onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
            onLostPointerCapture={() => { drag.current = undefined; setDraggedId(undefined); setTarget(undefined); }}
            onClick={() => { if (!didDrag.current) onSelect(card.id); }}>
            <GripVertical size={17} aria-hidden="true" />
          </button>
          <WhiteboardCardContent card={card} onSelect={() => onSelect(card.id)} />
        </article>)}
      </div>
      <button className="whiteboard-add-card" disabled={disabled || full} onClick={() => onAdd(status)} aria-label={`Add card to ${statusLabels[status]}`}><Plus size={16} aria-hidden="true" />Add card</button>
    </section>)}
  </div>;
}
