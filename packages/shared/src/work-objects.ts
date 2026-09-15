import { getAssetDefinition, getPlacedAssetBounds, type WorldObject } from "./assets.js";
import { isPointInRoom, type FloorLayout } from "./building.js";
import type { Position } from "./geometry.js";
import { createWhiteboardDocument, type WhiteboardDocument } from "./whiteboard.js";

export const WORK_OBJECT_RANGE = 72;
export const CHECKLIST_ITEM_LIMIT = 80;
export const CHECKLIST_TEXT_LIMIT = 240;

export type WorkObjectKind = "whiteboard" | "checklist";

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export type WorkObjectState =
  | { kind: "whiteboard"; revision: number; document: WhiteboardDocument }
  | { kind: "checklist"; revision: number; items: ChecklistItem[] };

export type WorkObjectEdit =
  | { type: "whiteboard.save"; document: WhiteboardDocument }
  | { type: "checklist.add"; text: string }
  | { type: "checklist.rename"; itemId: string; text: string }
  | { type: "checklist.complete"; itemId: string; completed: boolean }
  | { type: "checklist.remove"; itemId: string };

export function getWorkObjectState(object: WorldObject): WorkObjectState | undefined {
  const kind = getAssetDefinition(object.assetId)?.workKind;
  if (!kind) return undefined;
  return object.workState ?? (kind === "whiteboard"
    ? { kind, revision: 0, document: createWhiteboardDocument() }
    : { kind, revision: 0, items: [] });
}

export function canUseWorkObject(object: WorldObject, layout: FloorLayout, player: Position & { floorId: string }): boolean {
  if (object.floorId !== player.floorId) return false;
  const bounds = getPlacedAssetBounds(object);
  const x = Math.max(bounds.x, Math.min(player.x, bounds.x + bounds.width));
  const y = Math.max(bounds.y, Math.min(player.y, bounds.y + bounds.height));
  if (Math.hypot(player.x - x, player.y - y) > WORK_OBJECT_RANGE) return false;
  const objectRoom = layout.rooms.find((room) => isPointInRoom(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, room));
  const playerRoom = layout.rooms.find((room) => isPointInRoom(player.x, player.y, room));
  return objectRoom?.id === playerRoom?.id;
}
