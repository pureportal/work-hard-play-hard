import { useImperativeHandle, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { Copy, Grip, Maximize2, Minus, Pencil, Plus, Scaling, Trash2 } from "lucide-react";
import { WHITEBOARD_CARD_LIMIT, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH, type WhiteboardCard } from "@workhard/shared";
import { IconButton } from "../IconButton";
import { positionCard, resizeCard } from "./whiteboard-model";
import { WhiteboardCardContent } from "./WhiteboardCardContent";
import { useContextActions } from "../ContextMenu";

interface Props {
  ref?: Ref<{ position: () => { x: number; y: number } }>;
  cards: WhiteboardCard[];
  disabled: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onChange: (card: WhiteboardCard) => void;
  onAdd: (position: { x: number; y: number }) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

interface Drag {
  card: WhiteboardCard;
  action: "move" | "resize";
  x: number;
  y: number;
  pointerId: number;
  preview: WhiteboardCard;
}

export function WhiteboardCanvas({ ref, cards, disabled, selectedId, onSelect, onChange, onAdd, onDuplicate, onRemove }: Props) {
  const contextActions = useContextActions();
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const [preview, setPreview] = useState<WhiteboardCard>();
  const [zoom, setZoom] = useState(0.75);
  useImperativeHandle(ref, () => ({ position: () => {
    const left = (viewport.current?.scrollLeft ?? 0) / zoom;
    const top = (viewport.current?.scrollTop ?? 0) / zoom;
    const width = (viewport.current?.clientWidth ?? 1000) / zoom;
    const height = (viewport.current?.clientHeight ?? 600) / zoom;
    for (let y = top + 60; y < top + height - 220; y += 250) {
      for (let x = left + 60; x < left + width - 240; x += 270) {
        if (!cards.some((card) => x < card.x + card.width && x + 240 > card.x && y < card.y + card.height && y + 220 > card.y)) return { x, y };
      }
    }
    return { x: left + 40 + cards.length % 4 * 20, y: top + 40 + cards.length % 4 * 20 };
  } }), [cards, zoom]);

  const start = (event: PointerEvent<HTMLButtonElement>, card: WhiteboardCard, action: Drag["action"]) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { card, action, x: event.clientX, y: event.clientY, pointerId: event.pointerId, preview: card };
  };

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || disabled) return;
    const dx = (event.clientX - current.x) / zoom;
    const dy = (event.clientY - current.y) / zoom;
    current.preview = current.action === "move"
      ? positionCard(current.card, current.card.x + dx, current.card.y + dy)
      : resizeCard(current.card, current.card.width + dx, current.card.height + dy);
    setPreview(current.preview);
  };

  const finish = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = undefined;
    setPreview(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && !disabled) onChange(current.preview);
  };

  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, card: WhiteboardCard, action: Drag["action"]) => {
    if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const dy = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    onChange(action === "move" ? positionCard(card, card.x + dx, card.y + dy) : resizeCard(card, card.width + dx, card.height + dy));
  };

  const handle = (card: WhiteboardCard, action: Drag["action"]) => ({
    disabled,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, card, action),
    onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    onLostPointerCapture: () => { drag.current = undefined; setPreview(undefined); },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboard(event, card, action),
  });

  return <div className="whiteboard-canvas-view">
    <div className="whiteboard-canvas-scroll" ref={viewport} aria-label="Whiteboard canvas" tabIndex={0}>
      <div className="whiteboard-canvas-size" style={{ width: WHITEBOARD_WIDTH * zoom, height: WHITEBOARD_HEIGHT * zoom }}>
        <div className="whiteboard-canvas" style={{ width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT, transform: `scale(${zoom})`, "--canvas-zoom": zoom } as CSSProperties}
          onDoubleClick={(event) => {
            if (disabled || event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            onAdd({ x: (event.clientX - bounds.left) / zoom, y: (event.clientY - bounds.top) / zoom });
          }}>
          {cards.map((saved) => {
            const card = preview?.id === saved.id ? preview : saved;
            return <article key={card.id} data-card-id={card.id}
              tabIndex={0} {...contextActions(() => [
                { label: "Edit", icon: Pencil, onSelect: () => onSelect(card.id) },
                { label: "Duplicate", icon: Copy, onSelect: () => onDuplicate(card.id), disabled: disabled || cards.length >= WHITEBOARD_CARD_LIMIT },
                { label: "Delete", icon: Trash2, onSelect: () => onRemove(card.id), disabled, danger: true },
              ])}
              className={`whiteboard-card canvas-card color-${card.color} kind-${card.kind}${selectedId === card.id ? " selected" : ""}${preview?.id === card.id ? " dragging" : ""}`}
              style={{ left: card.x, top: card.y, width: card.width, height: card.height }}>
              <button className="whiteboard-drag-handle" data-context-press-ignore aria-label={`Move ${card.title || "card"}`} aria-description="Use arrow keys to move. Hold Shift for larger steps." {...handle(card, "move")}>
                <Grip size={17} aria-hidden="true" />
              </button>
              <WhiteboardCardContent card={card} canvas onSelect={() => onSelect(card.id)} />
              <button className="whiteboard-resize-handle" data-context-press-ignore aria-label={`Resize ${card.title || "card"}`} aria-description="Use arrow keys to resize." {...handle(card, "resize")}>
                <Scaling size={16} aria-hidden="true" />
              </button>
            </article>;
          })}
        </div>
      </div>
    </div>
    <div className="whiteboard-zoom" role="group" aria-label="Canvas zoom">
      <IconButton label="Zoom out" icon={Minus} disabled={zoom <= 0.25} onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))} />
      <output aria-label="Zoom">{Math.round(zoom * 100)}%</output>
      <IconButton label="Zoom in" icon={Plus} disabled={zoom >= 1.5} onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} />
      <IconButton label="Fit canvas" icon={Maximize2} onClick={() => {
        if (viewport.current) {
          const style = getComputedStyle(viewport.current);
          const width = viewport.current.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const height = viewport.current.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
          setZoom(Math.max(0.15, Math.min(width / WHITEBOARD_WIDTH, height / WHITEBOARD_HEIGHT, 1)));
          viewport.current.scrollTo({ left: 0, top: 0 });
        }
      }} />
    </div>
  </div>;
}
