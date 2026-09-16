import { getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetDefinition, AssetRotation } from "@workhard/shared";
import { getWorldAssetArtwork } from "../world-asset-artwork";
import { getAssetPreviewPath } from "../optimized-images";
import "../world-asset.css";

export function AssetShape({ asset, rotation = 0, variantId = getDefaultAssetVariantId(asset) }: {
  asset: AssetDefinition;
  rotation?: AssetRotation;
  variantId?: string;
}) {
  const artwork = getWorldAssetArtwork(asset, variantId, rotation);
  const { bounds } = artwork;
  const padding = 6;

  return (
    <svg
      className={`asset-shape asset-shape-${asset.kind}`}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}
    >
      <image
        className="asset-shape-artwork"
        href={getAssetPreviewPath(artwork.path, rotation)}
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        preserveAspectRatio="none"
      />
    </svg>
  );
}
