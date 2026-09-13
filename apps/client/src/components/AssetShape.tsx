import { getDefaultAssetVariantId } from "@workhard/shared";
import type { AssetDefinition, AssetRotation } from "@workhard/shared";
import { getWorldAssetArtwork } from "../world-asset-artwork";
import "../world-asset.css";

export function AssetShape({ asset, rotation = 0, variantId = getDefaultAssetVariantId(asset) }: {
  asset: AssetDefinition;
  rotation?: AssetRotation;
  variantId?: string;
}) {
  const artwork = getWorldAssetArtwork(asset, variantId, rotation);
  const { bounds, frame } = artwork;
  const padding = 6;

  return (
    <svg
      className={`asset-shape asset-shape-${asset.kind}`}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`}
    >
      <svg
        className="asset-shape-artwork"
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
        preserveAspectRatio="none"
        overflow="hidden"
      >
        <image href={artwork.path} width={artwork.atlasWidth} height={artwork.atlasHeight} />
      </svg>
    </svg>
  );
}
