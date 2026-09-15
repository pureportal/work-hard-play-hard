import { requireAssetDefinition, type WorldObject } from "@workhard/shared";
import { getWorldAssetArtwork } from "./world-asset-artwork";

export function getCharacterSeatLayout(object: WorldObject | undefined): { offsetY: number; hasBack: boolean } {
  if (!object) return { offsetY: 0, hasBack: false };
  const artwork = getWorldAssetArtwork(requireAssetDefinition(object.assetId), object.variantId, object.rotation);
  return { offsetY: artwork.seatOffset, hasBack: artwork.seatHasBack };
}
