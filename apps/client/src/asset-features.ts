import { GITHUB_TRAY_ASSET_ID, SPECIAL_PROPS, type AssetDefinition, type AssetKind } from "@workhard/shared";
import { isAssetAnimated } from "./world-asset-artwork";

const interactiveKinds: ReadonlySet<AssetKind> = new Set(["game", "gong", "portal", "whiteboard"]);

export type AssetFeature = "animated" | "interactive";

export function hasAssetFeature(asset: AssetDefinition, feature: AssetFeature): boolean {
  if (feature === "animated") return isAssetAnimated(asset.id) || asset.kind === "pool" || asset.kind === "fountain";
  return Boolean(asset.interactions?.length || asset.workKind || interactiveKinds.has(asset.kind)
    || SPECIAL_PROPS[asset.id] || asset.id === GITHUB_TRAY_ASSET_ID);
}
