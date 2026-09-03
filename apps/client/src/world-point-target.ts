import {
  getPlacedAssetBounds,
  getPlacedAssetInteractions,
  isPointInPlacedAsset,
  isPointInPlacedInteraction,
  pointInRect,
  requireAssetDefinition,
} from "@workhard/shared";
import type { AssetKind, FloorLayout, Rect, WorldObject } from "@workhard/shared";

const directlyInteractiveAssetKinds: ReadonlySet<AssetKind> = new Set(["game", "gong", "portal"]);

type WorldPointTarget =
  | { type: "object"; object: WorldObject; interactionId?: string }
  | { type: "destination"; x: number; y: number };

export function resolveWorldPointTarget(layout: FloorLayout, x: number, y: number, minimumTargetSize = 0): WorldPointTarget {
  for (let index = layout.objects.length - 1; index >= 0; index -= 1) {
    const object = layout.objects[index]!;
    if (!isPointInPlacedAsset(x, y, object)) {
      continue;
    }
    const interaction = getPlacedAssetInteractions(object).find((candidate) => isPointInPlacedInteraction(x, y, candidate));
    if (interaction) {
      return { type: "object", object, interactionId: interaction.id };
    }
    if (directlyInteractiveAssetKinds.has(requireAssetDefinition(object.assetId).kind)) {
      return { type: "object", object };
    }
  }
  if (minimumTargetSize > 0) {
    for (let index = layout.objects.length - 1; index >= 0; index -= 1) {
      const object = layout.objects[index]!;
      const interaction = getPlacedAssetInteractions(object).find((candidate) => (
        isPointInWorldTarget(x, y, candidate.bounds, minimumTargetSize)
      ));
      if (interaction) {
        return { type: "object", object, interactionId: interaction.id };
      }
      if (
        directlyInteractiveAssetKinds.has(requireAssetDefinition(object.assetId).kind)
        && isPointInWorldTarget(x, y, getPlacedAssetBounds(object), minimumTargetSize)
      ) {
        return { type: "object", object };
      }
    }
  }
  return { type: "destination", x, y };
}

export function isPointInWorldTarget(x: number, y: number, bounds: Rect, minimumSize: number): boolean {
  const width = Math.max(bounds.width, minimumSize);
  const height = Math.max(bounds.height, minimumSize);
  return pointInRect(x, y, {
    x: bounds.x - (width - bounds.width) / 2,
    y: bounds.y - (height - bounds.height) / 2,
    width,
    height,
  });
}
