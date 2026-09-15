import { WHITEBOARD_COLORS, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH, type WhiteboardCard, type WhiteboardDocument, type WhiteboardStatus } from "@workhard/shared";

export const statusLabels: Record<WhiteboardStatus, string> = { todo: "To do", doing: "In progress", done: "Done" };

export function createWhiteboardCard(cards: WhiteboardCard[], status: WhiteboardStatus = "todo", src?: string): WhiteboardCard {
  const index = cards.length;
  const position = { x: 60 + (index % 5) * 270, y: 60 + (Math.floor(index / 5) % 3) * 280 };
  const base = { id: crypto.randomUUID(), title: "", text: "", color: WHITEBOARD_COLORS[index % WHITEBOARD_COLORS.length]!, status, dueDate: "", ...position, width: 240, height: 220 };
  return src ? { ...base, kind: "image", src, height: 260 } : { ...base, kind: "note" };
}

export function moveBoardCard(document: WhiteboardDocument, id: string, status: WhiteboardStatus, beforeId?: string): WhiteboardDocument {
  const card = document.cards.find((candidate) => candidate.id === id);
  if (!card || beforeId === id) return document;
  const cards = document.cards.filter((candidate) => candidate.id !== id);
  const index = beforeId ? cards.findIndex((candidate) => candidate.id === beforeId) : cards.length;
  cards.splice(index < 0 ? cards.length : index, 0, { ...card, status });
  return { ...document, cards };
}

export function positionCard(card: WhiteboardCard, x: number, y: number): WhiteboardCard {
  return { ...card, x: Math.max(0, Math.min(WHITEBOARD_WIDTH - card.width, Math.round(x))), y: Math.max(0, Math.min(WHITEBOARD_HEIGHT - card.height, Math.round(y))) };
}

export function resizeCard(card: WhiteboardCard, width: number, height: number): WhiteboardCard {
  return { ...card, width: Math.max(180, Math.min(480, WHITEBOARD_WIDTH - card.x, Math.round(width))), height: Math.max(160, Math.min(480, WHITEBOARD_HEIGHT - card.y, Math.round(height))) };
}
