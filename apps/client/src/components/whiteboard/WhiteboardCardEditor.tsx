import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Copy, Trash2, X } from "lucide-react";
import { WHITEBOARD_CARD_TEXT_LIMIT, WHITEBOARD_COLORS, WHITEBOARD_STATUSES, WHITEBOARD_TITLE_LIMIT, type WhiteboardCard } from "@workhard/shared";
import { IconButton } from "../IconButton";
import { statusLabels } from "./whiteboard-model";

interface Props {
  card: WhiteboardCard;
  disabled: boolean;
  full: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (card: WhiteboardCard) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReorder: (direction: -1 | 1) => void;
  onClose: () => void;
}

export function WhiteboardCardEditor({ card, disabled, full, canMoveUp, canMoveDown, onChange, onDuplicate, onRemove, onReorder, onClose }: Props) {
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => { title.current?.focus(); }, [card.id]);

  return <aside className="whiteboard-card-editor" aria-label="Card editor">
    <header><h3>{card.kind === "image" ? "Image" : "Sticky note"}</h3><IconButton label="Close card editor" icon={X} onClick={onClose} /></header>
    <fieldset disabled={disabled}>
      <label>Title<input ref={title} value={card.title} maxLength={WHITEBOARD_TITLE_LIMIT} onChange={(event) => onChange({ ...card, title: event.target.value })} /></label>
      <label>Card notes<textarea aria-label="Card notes" value={card.text} rows={5} maxLength={WHITEBOARD_CARD_TEXT_LIMIT} onChange={(event) => onChange({ ...card, text: event.target.value })} /></label>
      <div className="whiteboard-colors" role="group" aria-label="Card color">
        {WHITEBOARD_COLORS.map((color) => <button key={color} className={`whiteboard-color color-${color}`} aria-label={color[0]!.toUpperCase() + color.slice(1)} aria-pressed={card.color === color} onClick={() => onChange({ ...card, color })} />)}
      </div>
      <label>Status<select aria-label="Status" value={card.status} onChange={(event) => onChange({ ...card, status: event.target.value as WhiteboardCard["status"] })}>
        {WHITEBOARD_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select></label>
      <label>Due date<input type="date" min="0001-01-01" max="9999-12-31" value={card.dueDate} onChange={(event) => onChange({ ...card, dueDate: event.target.value })} /></label>
      <div className="whiteboard-editor-actions">
        <IconButton label="Move card earlier" icon={ArrowUp} disabled={disabled || !canMoveUp} onClick={() => onReorder(-1)} />
        <IconButton label="Move card later" icon={ArrowDown} disabled={disabled || !canMoveDown} onClick={() => onReorder(1)} />
        <IconButton label="Duplicate card" icon={Copy} disabled={disabled || full} onClick={onDuplicate} />
        <IconButton label="Delete card" icon={Trash2} onClick={onRemove} />
      </div>
    </fieldset>
  </aside>;
}
