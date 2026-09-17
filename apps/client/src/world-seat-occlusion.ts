import type { AssetRotation, Rect } from "@workhard/shared";
import source from "./world-seat-occlusion.json";
import type { WorldTextureRegion } from "./world-asset-textures";

interface SeatOcclusion {
  path?: string;
  width?: number;
  height?: number;
  seats: Record<string, readonly ({ frame: Rect; bounds: Rect } | null)[]>;
}

const occlusion: Record<string, SeatOcclusion> = source;

export function getSeatOcclusionArtwork(assetId: string, interactionId: string, rotation: AssetRotation): WorldTextureRegion | undefined {
  const entry = occlusion[assetId];
  const region = entry?.seats[interactionId]?.[rotation / 90];
  if (region === undefined) throw new Error(`Missing seat occlusion: ${assetId}/${interactionId}/${rotation}`);
  if (region === null) return;
  return { ...region, path: entry!.path!, atlasWidth: entry!.width!, atlasHeight: entry!.height! };
}
