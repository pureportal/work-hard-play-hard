import { z } from "zod";
import {
  WHITEBOARD_CARD_LIMIT, WHITEBOARD_CARD_TEXT_LIMIT, WHITEBOARD_COLORS,
  WHITEBOARD_DOCUMENT_BYTES, WHITEBOARD_HEIGHT, WHITEBOARD_STATUSES,
  WHITEBOARD_TEXT_LIMIT, WHITEBOARD_TITLE_LIMIT, WHITEBOARD_WIDTH, isWhiteboardImageSource,
} from "@workhard/shared";

const cardFields = {
  id: z.string().min(1).max(100),
  title: z.string().max(WHITEBOARD_TITLE_LIMIT),
  text: z.string().max(WHITEBOARD_CARD_TEXT_LIMIT),
  color: z.enum(WHITEBOARD_COLORS),
  status: z.enum(WHITEBOARD_STATUSES),
  dueDate: z.union([z.literal(""), z.iso.date()]),
  x: z.number().finite().min(0).max(WHITEBOARD_WIDTH),
  y: z.number().finite().min(0).max(WHITEBOARD_HEIGHT),
  width: z.number().finite().min(180).max(480),
  height: z.number().finite().min(160).max(480),
};

const card = z.discriminatedUnion("kind", [
  z.object({ ...cardFields, kind: z.literal("note") }).strict(),
  z.object({ ...cardFields, kind: z.literal("image"), src: z.string().max(2_048).refine(isWhiteboardImageSource) }).strict(),
]).refine((value) => value.x + value.width <= WHITEBOARD_WIDTH && value.y + value.height <= WHITEBOARD_HEIGHT);

export const whiteboardDocumentSchema = z.object({
  text: z.string().max(WHITEBOARD_TEXT_LIMIT),
  cards: z.array(card).max(WHITEBOARD_CARD_LIMIT)
    .refine((cards) => new Set(cards.map((value) => value.id)).size === cards.length),
}).strict().refine((document) => Buffer.byteLength(JSON.stringify(document), "utf8") <= WHITEBOARD_DOCUMENT_BYTES);
