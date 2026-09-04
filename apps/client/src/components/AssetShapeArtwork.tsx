import { ASSET_RASTER_SIZE } from "@workhard/shared";
import type {
  AssetDefinition,
  AssetRotation,
  AssetVariantDefinition,
  PlacedAssetCell,
  PlacedAssetInteraction,
  Rect,
} from "@workhard/shared";
import { AssetShapeDetails } from "./AssetShapeDetails";
import { FloorSurfaceShape, GongShape } from "./AssetShapeSpecialArtwork";

interface AssetShapeArtworkProps {
  asset: AssetDefinition;
  variant: AssetVariantDefinition;
  cells: PlacedAssetCell[];
  bounds: Rect;
  interactions: PlacedAssetInteraction[];
  rotation: AssetRotation;
}

export function AssetShapeArtwork({ asset, variant, cells, bounds, interactions, rotation }: AssetShapeArtworkProps) {
  if (asset.kind === "floor-tile") {
    return <FloorSurfaceShape bounds={bounds} variant={variant} rotation={rotation} />;
  }
  if (asset.kind === "gong") {
    return <GongShape bounds={bounds} variant={variant} />;
  }

  return (
    <>
      <g className="asset-shape-shadow" transform="translate(3 4)">
        {cells.map((cell) => (
          <rect
            key={`${cell.x}:${cell.y}`}
            x={cell.worldX}
            y={cell.worldY}
            width={ASSET_RASTER_SIZE}
            height={ASSET_RASTER_SIZE}
          />
        ))}
      </g>
      <g className="asset-shape-body">
        {cells.map((cell) => (
          <rect
            key={`${cell.x}:${cell.y}`}
            className={`asset-shape-cell asset-shape-cell-${cell.type}`}
            x={cell.worldX}
            y={cell.worldY}
            width={ASSET_RASTER_SIZE}
            height={ASSET_RASTER_SIZE}
            rx={cell.type === "foliage" ? 5 : cell.type === "support" ? 1 : 2}
          />
        ))}
      </g>
      <path className="asset-shape-outline" d={getCellOutlinePath(cells)} />
      <AssetShapeDetails asset={asset} variant={variant} cells={cells} bounds={bounds} interactions={interactions} />
      <InteractionDetails interactions={interactions} />
    </>
  );
}

function InteractionDetails({ interactions }: { interactions: PlacedAssetInteraction[] }) {
  return (
    <g className="asset-shape-interaction-details">
      {interactions.map((interaction) => {
        const vector = directionVector(interaction.direction);
        return (
          <g key={interaction.id}>
            <rect
              x={interaction.bounds.x + 2}
              y={interaction.bounds.y + 2}
              width={interaction.bounds.width - 4}
              height={interaction.bounds.height - 4}
              rx={5}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.28}
              strokeWidth={1}
            />
            <path
              d={`M ${interaction.center.x - vector.x * 3} ${interaction.center.y - vector.y * 3} L ${interaction.center.x + vector.x * 6} ${interaction.center.y + vector.y * 6}`}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.46}
              strokeWidth={2}
            />
          </g>
        );
      })}
    </g>
  );
}

function getCellOutlinePath(cells: PlacedAssetCell[]): string {
  const occupied = new Set(cells.map((cell) => `${cell.worldX}:${cell.worldY}`));
  const segments = [];
  for (const cell of cells) {
    const left = cell.worldX;
    const top = cell.worldY;
    const right = left + ASSET_RASTER_SIZE;
    const bottom = top + ASSET_RASTER_SIZE;
    if (!occupied.has(`${left}:${top - ASSET_RASTER_SIZE}`)) {
      segments.push(`M ${left} ${top} L ${right} ${top}`);
    }
    if (!occupied.has(`${left + ASSET_RASTER_SIZE}:${top}`)) {
      segments.push(`M ${right} ${top} L ${right} ${bottom}`);
    }
    if (!occupied.has(`${left}:${top + ASSET_RASTER_SIZE}`)) {
      segments.push(`M ${right} ${bottom} L ${left} ${bottom}`);
    }
    if (!occupied.has(`${left - ASSET_RASTER_SIZE}:${top}`)) {
      segments.push(`M ${left} ${bottom} L ${left} ${top}`);
    }
  }
  return segments.join(" ");
}

function directionVector(direction: PlacedAssetInteraction["direction"]): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}
