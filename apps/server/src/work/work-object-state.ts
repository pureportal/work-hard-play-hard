import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CHECKLIST_ITEM_LIMIT,
  CHECKLIST_TEXT_LIMIT,
  WHITEBOARD_TEXT_LIMIT,
  type WorkObjectEdit,
  type WorkObjectState,
} from "@workhard/shared";

const itemId = z.string().min(1).max(100);
const itemText = z.string().trim().min(1).max(CHECKLIST_TEXT_LIMIT);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);

export const workObjectEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("whiteboard.save"), text: z.string().max(WHITEBOARD_TEXT_LIMIT) }).strict(),
  z.object({ type: z.literal("checklist.add"), text: itemText }).strict(),
  z.object({ type: z.literal("checklist.rename"), itemId, text: itemText }).strict(),
  z.object({ type: z.literal("checklist.complete"), itemId, completed: z.boolean() }).strict(),
  z.object({ type: z.literal("checklist.remove"), itemId }).strict(),
]);

export const workObjectStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("whiteboard"), revision, text: z.string().max(WHITEBOARD_TEXT_LIMIT) }).strict(),
  z.object({
    kind: z.literal("checklist"), revision,
    items: z.array(z.object({ id: itemId, text: itemText, completed: z.boolean() }).strict())
      .max(CHECKLIST_ITEM_LIMIT)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  }).strict(),
]);

export function applyWorkObjectEdit(state: WorkObjectState, edit: WorkObjectEdit): WorkObjectState {
  if (state.kind === "whiteboard" && edit.type === "whiteboard.save") {
    return { ...state, revision: state.revision + 1, text: edit.text };
  }
  if (state.kind !== "checklist" || edit.type === "whiteboard.save") throw new Error("WORK_OBJECT_INVALID");
  let items = state.items;
  if (edit.type === "checklist.add") {
    if (items.length >= CHECKLIST_ITEM_LIMIT) throw new Error("CHECKLIST_FULL");
    items = [...items, { id: randomUUID(), text: edit.text, completed: false }];
  } else {
    if (!items.some((item) => item.id === edit.itemId)) throw new Error("CHECKLIST_ITEM_NOT_FOUND");
    if (edit.type === "checklist.remove") {
      items = items.filter((item) => item.id !== edit.itemId);
    } else {
      items = items.map((item) => item.id !== edit.itemId ? item : edit.type === "checklist.rename"
        ? { ...item, text: edit.text }
        : { ...item, completed: edit.completed });
    }
  }
  return { ...state, revision: state.revision + 1, items };
}
