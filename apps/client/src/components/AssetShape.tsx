import type { CSSProperties } from "react";
import {
  getDefaultAssetVariantId,
  getPlacedAssetBounds,
  getPlacedAssetCells,
  getPlacedAssetInteractions,
  requireAssetVariant,
} from "@workhard/shared";
import type { AssetDefinition, AssetRotation, WorldObject } from "@workhard/shared";
import { AssetShapeArtwork } from "./AssetShapeArtwork";

export function AssetShape({ asset, rotation = 0, variantId = getDefaultAssetVariantId(asset) }: {
  asset: AssetDefinition;
  rotation?: AssetRotation;
  variantId?: string;
}) {
  const variant = requireAssetVariant(asset, variantId);
  const previewObject: WorldObject = {
    id: `preview-${asset.id}`,
    floorId: "preview",
    assetId: asset.id,
    x: 0,
    y: 0,
    rotation,
    variantId,
  };
  const cells = getPlacedAssetCells(previewObject);
  const bounds = getPlacedAssetBounds(previewObject);
  const padding = 6;
  const style = {
    "--asset-color": variant.color,
    "--asset-dark-color": `color-mix(in srgb, ${variant.color} 86%, #171922 14%)`,
  } as CSSProperties;

  return (
    <svg
      className={`asset-shape asset-shape-${asset.kind}`}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      style={style}
      viewBox={`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}
    >
      <AssetShapeArtwork
        asset={asset}
        variant={variant}
        cells={cells}
        bounds={bounds}
        interactions={getPlacedAssetInteractions(previewObject)}
        rotation={rotation}
      />
    </svg>
  );
}
