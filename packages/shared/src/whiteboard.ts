export const WHITEBOARD_TEXT_LIMIT = 8_000;
export const WHITEBOARD_CARD_LIMIT = 60;
export const WHITEBOARD_CARD_TEXT_LIMIT = 1_000;
export const WHITEBOARD_TITLE_LIMIT = 120;
export const WHITEBOARD_DOCUMENT_BYTES = 192 * 1024;
export const WHITEBOARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const WHITEBOARD_WIDTH = 1_600;
export const WHITEBOARD_HEIGHT = 1_000;

export const WHITEBOARD_COLORS = ["yellow", "mint", "blue", "pink", "lavender"] as const;
export const WHITEBOARD_STATUSES = ["todo", "doing", "done"] as const;
export type WhiteboardColor = typeof WHITEBOARD_COLORS[number];
export type WhiteboardStatus = typeof WHITEBOARD_STATUSES[number];
export type WhiteboardView = "canvas" | "board" | "notes";

interface WhiteboardCardBase {
  id: string;
  title: string;
  text: string;
  color: WhiteboardColor;
  status: WhiteboardStatus;
  dueDate: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WhiteboardCard = WhiteboardCardBase & (
  | { kind: "note" }
  | { kind: "image"; src: string }
);

export interface WhiteboardDocument {
  text: string;
  cards: WhiteboardCard[];
}

export function createWhiteboardDocument(): WhiteboardDocument {
  return { text: "", cards: [] };
}

export function isWhiteboardImageSource(value: string): boolean {
  if (/^\/v1\/whiteboards\/images\/[a-f0-9]{64}$/.test(value)) return true;
  return /^https:\/\/[^/@\\\s?#]+(?:[/?#][^\s\\]*)?$/i.test(value);
}
