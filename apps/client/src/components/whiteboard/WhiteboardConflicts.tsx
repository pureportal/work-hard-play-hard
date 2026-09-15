import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH, type WhiteboardDocument } from "@workhard/shared";
import { conflictValue, type WhiteboardConflict } from "./whiteboard-merge";
import { CardImage } from "./WhiteboardCardContent";
import { statusLabels } from "./whiteboard-model";

function describe(value: unknown): string {
  if (value === undefined) return "Removed";
  if (typeof value === "string") return value || "Empty";
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object" && "title" in value && "text" in value) return [value.title, value.text].filter(Boolean).join("\n") || "Card";
  return String(value);
}

export function WhiteboardConflicts({ conflicts, document, remote, onResolve }: {
  conflicts: WhiteboardConflict[]; document: WhiteboardDocument; remote: WhiteboardDocument;
  onResolve: (conflict: WhiteboardConflict, theirs: boolean) => void;
}) {
  return <div className="whiteboard-conflicts" role="alert">
    <p>Choose which changes to keep.</p>
    {conflicts.map((conflict) => {
      const card = document.cards.find((card) => card.id === conflict.cardId) ?? remote.cards.find((card) => card.id === conflict.cardId);
      const labels = { text: "Notes", title: "Title", color: "Color", status: "Status", dueDate: "Due date", geometry: "Position and size", src: "Image", card: "Card", order: "Card order" };
      const preview = (source: WhiteboardDocument) => {
        const card = source.cards.find((card) => card.id === conflict.cardId);
        if (card && conflict.field === "geometry") return <svg className={`whiteboard-conflict-position color-${card.color}`} viewBox={`0 0 ${WHITEBOARD_WIDTH} ${WHITEBOARD_HEIGHT}`} role="img"
          aria-label={`Card at ${Math.round(card.x / WHITEBOARD_WIDTH * 100)}% from the left and ${Math.round(card.y / WHITEBOARD_HEIGHT * 100)}% from the top, ${Math.round(card.width / WHITEBOARD_WIDTH * 100)}% wide and ${Math.round(card.height / WHITEBOARD_HEIGHT * 100)}% tall`}>
          <rect x={card.x} y={card.y} width={card.width} height={card.height} rx={12} />
        </svg>;
        if (card?.kind === "image" && (conflict.field === "src" || conflict.field === "card")) return <CardImage src={card.src} title={card.title || "Image"} />;
        const value = conflict.field === "order" ? source.cards.map((card) => card.title || (card.kind === "image" ? "Image" : "Sticky note")).join(" → ")
          : card && conflict.field === "status" ? statusLabels[card.status] : describe(conflictValue(source, conflict));
        return <pre>{value}</pre>;
      };
      return <section key={`${conflict.cardId ?? "board"}:${conflict.field}`}>
        <h3>{card?.title ? `${card.title} · ` : ""}{labels[conflict.field]}</h3>
        <div className="whiteboard-conflict-options">
          <div>{preview(document)}<button className="secondary-button" onClick={() => onResolve(conflict, false)}>Keep mine</button></div>
          <div>{preview(remote)}<button className="secondary-button" onClick={() => onResolve(conflict, true)}>Use theirs</button></div>
        </div>
      </section>;
    })}
  </div>;
}
