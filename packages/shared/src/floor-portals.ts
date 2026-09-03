import { getAssetDefinition, getPlacedAssetBounds, type WorldObject } from "./assets.js";
import type { FloorLayout } from "./building.js";
import type { Position } from "./geometry.js";

export interface FloorReference {
  id: string;
  officeId: string;
  level: number;
}

export interface FloorPortal {
  object: WorldObject;
  floorId: string;
  destinationFloorId: string;
  position: Position;
}

export function getFloorPortals(
  floors: readonly FloorReference[],
  layouts: readonly FloorLayout[],
): FloorPortal[] {
  const floorById = new Map(floors.map((floor) => [floor.id, floor]));
  const portals: FloorPortal[] = [];

  for (const layout of layouts) {
    const floor = floorById.get(layout.floorId);
    if (!floor) {
      continue;
    }
    for (const object of layout.objects) {
      if (getAssetDefinition(object.assetId)?.kind !== "portal") {
        continue;
      }
      const destinationLevel = Number(object.label);
      if (!Number.isInteger(destinationLevel)) {
        continue;
      }
      const destinations = floors.filter((candidate) => (
        candidate.officeId === floor.officeId
        && candidate.level === destinationLevel
        && candidate.id !== floor.id
      ));
      if (destinations.length !== 1) {
        continue;
      }
      const bounds = getPlacedAssetBounds(object);
      portals.push({
        object,
        floorId: floor.id,
        destinationFloorId: destinations[0]!.id,
        position: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
      });
    }
  }

  return portals;
}

export function getCorrespondingFloorPortals(
  portals: readonly FloorPortal[],
  portal: FloorPortal,
): FloorPortal[] {
  return portals.filter((candidate) => (
    candidate.floorId === portal.destinationFloorId
    && candidate.destinationFloorId === portal.floorId
  ));
}
