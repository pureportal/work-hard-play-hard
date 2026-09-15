import { useState } from "react";
import { CalendarDays, Check, ImageOff, Pencil } from "lucide-react";
import type { WhiteboardCard } from "@workhard/shared";
import { resolveServerUrl } from "../../server-url";
import { statusLabels } from "./whiteboard-model";
import { LinkedText } from "../LinkedText";

export function WhiteboardCardContent({ card, canvas, onSelect }: { card: WhiteboardCard; canvas?: boolean; onSelect: () => void }) {
  const due = card.dueDate ? new Date(`${card.dueDate}T00:00:00`) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return <>
    <div className="whiteboard-card-content" onClick={onSelect}>
      <button className="whiteboard-card-open" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`Edit ${card.title || (card.kind === "image" ? "image" : "sticky note")}`}>
      {card.kind === "image" && <CardImage key={card.src} src={card.src} title={card.title} />}
      {card.title && <strong>{card.title}</strong>}
      {!card.title && card.kind === "note" && <Pencil size={14} aria-hidden="true" />}
      </button>
      {card.text && <span className="whiteboard-card-text"><LinkedText text={card.text} /></span>}
      {!card.title && !card.text && card.kind === "note" && <span className="whiteboard-card-placeholder">Write a note…</span>}
    </div>
    {(canvas || due) && <div className="whiteboard-card-meta">
      {canvas && <span className={`whiteboard-card-status status-${card.status}`}>
        {card.status === "done" && <Check size={12} aria-hidden="true" />}{statusLabels[card.status]}
      </span>}
      {due && <time dateTime={card.dueDate} className={due < today && card.status !== "done" ? "overdue" : ""}>
        <CalendarDays size={12} aria-hidden="true" />{due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </time>}
    </div>}
  </>;
}

export function CardImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <span className="whiteboard-image-error"><ImageOff size={24} aria-hidden="true" />Image unavailable</span>
    : <img src={src.startsWith("/") ? resolveServerUrl(src) : src} alt={title} draggable={false} referrerPolicy="no-referrer"
      crossOrigin={src.startsWith("/") ? "use-credentials" : undefined} onError={() => setFailed(true)} />;
}
