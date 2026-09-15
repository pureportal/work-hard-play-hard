import type { WhiteboardCard } from "@workhard/shared";
import { useHorizontalWheelScroll } from "../../hooks/useHorizontalWheelScroll";

const stickers = [
  { title: "☕ First, coffee", text: "Then we do the thing.", color: "yellow" },
  { title: "🐛 A tiny change", text: "What could possibly go wrong?", color: "pink" },
  { title: "🚀 Ship it", text: "Small win. Big celebration.", color: "mint" },
  { title: "🦆 Ask the duck", text: "Explain it out loud. The duck believes in you.", color: "blue" },
] satisfies Pick<WhiteboardCard, "title" | "text" | "color">[];

export function WhiteboardStickers({ onAdd }: { onAdd: (sticker: typeof stickers[number]) => void }) {
  const scrollStickers = useHorizontalWheelScroll();
  return <div ref={scrollStickers} className="whiteboard-stickers" aria-label="Funny notes">
    {stickers.map((sticker) => <button key={sticker.title} className={`color-${sticker.color}`} onClick={() => onAdd(sticker)}>
      <strong>{sticker.title}</strong><span>{sticker.text}</span>
    </button>)}
  </div>;
}
