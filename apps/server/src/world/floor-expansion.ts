import { randomUUID } from "node:crypto";
import type { Floor, FloorLayout, WorldObject } from "@workhard/shared";

export function createFloorExpansion(source: Floor, teleporter: WorldObject): { floor: Floor; layout: FloorLayout } {
  const id = randomUUID();
  const level = Number(teleporter.label);
  const floor: Floor = {
    id, officeId: source.officeId, level, name: `Floor ${level}`,
    width: source.width, height: source.height, background: source.background, spawn: { x: 160, y: 224 },
  };
  const layout: FloorLayout = {
    floorId: id, revision: 0, walls: [], openings: [], rooms: [], tiles: [], objects: [
      { id: randomUUID(), floorId: id, assetId: "floor-wood", variantId: "oak", rotation: 0, x: 128, y: 128 },
      { ...teleporter, id: randomUUID(), floorId: id, x: 128, y: 128, rotation: 0, label: String(source.level) },
    ],
  };
  return { floor, layout };
}
