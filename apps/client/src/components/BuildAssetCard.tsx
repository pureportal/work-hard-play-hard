import { memo } from "react";
import { getTeleporterPrice } from "@workhard/shared";
import type { AssetDefinition, AssetRotation } from "@workhard/shared";
import { hasAssetFeature } from "../asset-features";
import { AssetFeatureIndicators } from "./AssetFeatureIndicators";
import { AssetShape } from "./AssetShape";

interface BuildAssetCardProps {
  asset: AssetDefinition;
  floorCount: number;
  selected: boolean;
  rotation: AssetRotation;
  variantId: string;
  onSelect: (assetId: string) => void;
}

export const BuildAssetCard = memo(function BuildAssetCard({
  asset,
  floorCount,
  selected,
  rotation,
  variantId,
  onSelect,
}: BuildAssetCardProps) {
  const price = asset.kind === "portal" ? getTeleporterPrice(floorCount) : asset.shop?.price;

  return <button
    aria-label={asset.name}
    className={`catalog-asset catalog-selectable${selected ? " active" : ""}`}
    aria-pressed={selected}
    aria-description={[
      `${asset.rarity[0]!.toUpperCase() + asset.rarity.slice(1)} · ${price} coins`,
      ...(hasAssetFeature(asset, "animated") ? ["Animated"] : []),
      ...(hasAssetFeature(asset, "interactive") ? ["Interactive"] : []),
    ].join(" · ")}
    data-rarity={asset.rarity}
    onClick={() => onSelect(asset.id)}
  >
    <AssetShape
      asset={asset}
      rotation={rotation}
      variantId={variantId}
    />
    <span className="catalog-asset-details"><strong>{asset.name}</strong><span>{price} coins</span></span>
    <span className="catalog-asset-features"><AssetFeatureIndicators asset={asset} /></span>
  </button>;
});
