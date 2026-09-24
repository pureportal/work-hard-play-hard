import { Film, MousePointerClick } from "lucide-react";
import type { AssetDefinition } from "@workhard/shared";
import { hasAssetFeature } from "../asset-features";

export function AssetFeatureIndicators({ asset }: { asset: AssetDefinition }) {
  const animated = hasAssetFeature(asset, "animated");
  const interactive = hasAssetFeature(asset, "interactive");
  if (!animated && !interactive) return null;

  return <span className="asset-feature-indicators">
    {animated && <span role="img" aria-label="Animated" title="Animated"><Film size={14} aria-hidden="true" /></span>}
    {interactive && <span role="img" aria-label="Interactive" title="Interactive"><MousePointerClick size={14} aria-hidden="true" /></span>}
  </span>;
}
