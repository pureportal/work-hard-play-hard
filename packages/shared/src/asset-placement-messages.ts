import type { AssetPlacementError } from "./asset-placement.js";
import type { PlayerAssetRoomError } from "./player-asset-placement.js";

export type AssetPlacementBlockReason = AssetPlacementError | PlayerAssetRoomError | "PLAYER_IN_THE_WAY";

export const ASSET_PLACEMENT_MESSAGES: Record<AssetPlacementBlockReason, string> = {
  ASSET_OFF_RASTER: "Place it on the grid.",
  ASSET_OUT_OF_RANGE: "Place it inside the floor.",
  ASSET_BLOCKED: "That space is occupied.",
  ASSET_REQUIRES_SURFACE: "Place it on a surface.",
  ASSET_ROOM_REQUIRED: "Place it fully inside a room.",
  ASSET_ROOM_FORBIDDEN: "You cannot build in this room. Choose another room.",
  PLAYER_IN_THE_WAY: "Someone is standing there.",
};
