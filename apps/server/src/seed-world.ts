import {
  ASSET_RASTER_SIZE,
  getAssetRasterSize,
  getDefaultAssetVariantId,
  requireAssetDefinition,
  requireAssetVariant,
  type AssetRotation,
  type Floor,
  type FloorLayout,
  type WorldObject,
} from "@workhard/shared";
import { createSeedLayouts } from "./seed-layouts.js";

export interface SeedWorld {
  floors: Floor[];
  layouts: FloorLayout[];
}

type SeedObject = Omit<WorldObject, "floorId" | "variantId"> & { variantId?: string };

const floorTileDefinition = requireAssetDefinition("floor-tile");
const floorTileRasterSize = getAssetRasterSize(floorTileDefinition);
const floorTileWidth = floorTileRasterSize.width * ASSET_RASTER_SIZE;
const floorTileHeight = floorTileRasterSize.height * ASSET_RASTER_SIZE;

const studioObjects = objectsForFloor("floor-studio", [
  ...tiledSurface("studio-commons-rug", "wood", 112, 112, 6, 4),
  ...tiledSurface("studio-product-rug", "wood", 96, 704, 4, 3),
  ...tiledSurface("studio-entry-step", "stone", 736, 928, 1, 1),
  ...tiledSurface("studio-courtyard", "stone", 640, 992, 7, 3),
  ...tiledSurface("studio-east-lawn", "grass", 1568, 80, 4, 13),
  ...tiledSurface("studio-south-lawn", "grass", 1088, 944, 11, 4),
  { id: "object-commons-table", assetId: "table-meeting", x: 256, y: 224, rotation: 0 },
  { id: "object-commons-sofa-a", assetId: "sofa-straight", x: 144, y: 128, rotation: 0, variantId: "blue" },
  { id: "object-commons-sofa-b", assetId: "sofa-straight", x: 368, y: 352, rotation: 180, variantId: "blue" },
  { id: "object-commons-chair-left", assetId: "chair-office", x: 224, y: 240, rotation: 90, variantId: "gray" },
  { id: "object-commons-chair-right", assetId: "chair-office", x: 384, y: 240, rotation: 270, variantId: "gray" },
  { id: "object-commons-chair-top", assetId: "chair-office", x: 304, y: 176, rotation: 0, variantId: "gray" },
  { id: "object-commons-plant", assetId: "plant-floor", x: 96, y: 384, rotation: 0, variantId: "sage" },
  { id: "object-daily-table", assetId: "table-meeting", x: 656, y: 208, rotation: 0 },
  { id: "object-daily-chair-top", assetId: "chair-office", x: 704, y: 160, rotation: 0 },
  { id: "object-daily-chair-bottom", assetId: "chair-office", x: 704, y: 288, rotation: 180 },
  { id: "object-daily-chair-west", assetId: "chair-office", x: 608, y: 224, rotation: 90, variantId: "gray" },
  { id: "object-daily-chair-east", assetId: "chair-office", x: 800, y: 224, rotation: 270, variantId: "gray" },
  { id: "object-daily-board", assetId: "equipment-whiteboard", x: 672, y: 112, rotation: 0, label: "Roadmap" },
  { id: "object-daily-plant", assetId: "plant-floor", x: 896, y: 384, rotation: 0, variantId: "sage" },
  { id: "object-commons-gong", assetId: "equipment-gong", x: 448, y: 112, rotation: 0 },
  { id: "object-focus-desk-a", assetId: "desk-corner", x: 1024, y: 160, rotation: 0, variantId: "navy" },
  { id: "object-focus-desk-b", assetId: "desk-corner", x: 1248, y: 160, rotation: 90, variantId: "navy" },
  { id: "object-focus-chair-a", assetId: "chair-office", x: 1072, y: 272, rotation: 180, variantId: "gray" },
  { id: "object-focus-chair-b", assetId: "chair-office", x: 1264, y: 224, rotation: 180, variantId: "gray" },
  { id: "object-focus-bookshelf", assetId: "equipment-bookshelf", x: 1360, y: 352, rotation: 0, variantId: "white" },
  { id: "object-focus-palm", assetId: "plant-palm", x: 1456, y: 128, rotation: 0, variantId: "sage" },
  { id: "object-product-bookshelf", assetId: "equipment-bookshelf", x: 112, y: 496, rotation: 0, variantId: "white" },
  { id: "object-desk-maya", assetId: "desk-straight", x: 288, y: 592, rotation: 0, label: "Maya" },
  { id: "object-desk-leo", assetId: "desk-straight", x: 528, y: 592, rotation: 0, label: "Leo" },
  { id: "object-desk-amara", assetId: "desk-straight", x: 752, y: 592, rotation: 0, label: "Amara" },
  { id: "object-chair-maya", assetId: "chair-office", x: 320, y: 656, rotation: 180, variantId: "gray" },
  { id: "object-chair-leo", assetId: "chair-office", x: 560, y: 656, rotation: 180, variantId: "gray" },
  { id: "object-chair-amara", assetId: "chair-office", x: 784, y: 656, rotation: 180, variantId: "gray" },
  { id: "object-product-standing-desk", assetId: "desk-standing", x: 176, y: 752, rotation: 0, variantId: "navy" },
  { id: "object-product-board", assetId: "equipment-whiteboard", x: 480, y: 496, rotation: 0, label: "Sprint" },
  { id: "object-tetris", assetId: "equipment-tetris", x: 1088, y: 576, rotation: 0, label: "Tetris" },
  { id: "object-arcade-b", assetId: "equipment-arcade", x: 1296, y: 576, rotation: 0, label: "Dash" },
  { id: "object-arcade-sofa", assetId: "sofa-straight", x: 1056, y: 800, rotation: 180, variantId: "blue" },
  { id: "object-arcade-palm", assetId: "plant-palm", x: 1344, y: 480, rotation: 0, variantId: "sage" },
  { id: "object-portal-up", assetId: "infrastructure-portal", x: 1440, y: 848, rotation: 0, label: "2" },
  { id: "object-plant-a", assetId: "plant-floor", x: 112, y: 816, rotation: 0 },
  { id: "object-plant-b", assetId: "plant-planter-row", x: 896, y: 752, rotation: 0, variantId: "sage" },
  { id: "object-courtyard-planter-west", assetId: "plant-planter-row", x: 640, y: 960, rotation: 90, variantId: "sage" },
  { id: "object-courtyard-planter-east", assetId: "plant-planter-row", x: 976, y: 960, rotation: 90, variantId: "sage" },
  { id: "object-courtyard-table", assetId: "table-round", x: 800, y: 1024, rotation: 0, variantId: "walnut" },
  { id: "object-courtyard-chair-west", assetId: "chair-lounge", x: 688, y: 1040, rotation: 90, variantId: "blue" },
  { id: "object-courtyard-chair-east", assetId: "chair-lounge", x: 912, y: 1040, rotation: 270, variantId: "blue" },
  { id: "object-east-pool", assetId: "outdoor-pool", x: 1584, y: 112, rotation: 0 },
  { id: "object-east-garden-bed-a", assetId: "outdoor-garden-bed", x: 1600, y: 304, rotation: 0 },
  { id: "object-east-garden-bed-b", assetId: "outdoor-garden-bed", x: 1600, y: 416, rotation: 0, variantId: "sage" },
  { id: "object-east-bench", assetId: "outdoor-bench", x: 1600, y: 576, rotation: 0, variantId: "gray" },
  { id: "object-east-palm", assetId: "plant-palm", x: 1728, y: 304, rotation: 0 },
  { id: "object-south-palm-west", assetId: "plant-palm", x: 1104, y: 1008, rotation: 0, variantId: "sage" },
  { id: "object-south-bench", assetId: "outdoor-bench", x: 1216, y: 1008, rotation: 0, variantId: "gray" },
  { id: "object-south-planter", assetId: "plant-planter-row", x: 1376, y: 976, rotation: 90, variantId: "sage" },
  { id: "object-south-garden-bed", assetId: "outdoor-garden-bed", x: 1504, y: 992, rotation: 0, variantId: "sage" },
  { id: "object-south-palm-east", assetId: "plant-palm", x: 1696, y: 1008, rotation: 0, variantId: "sage" },
  { id: "object-desk-maya-monitor", assetId: "decor-monitor", x: 320, y: 592, rotation: 0, variantId: "ivory" },
  { id: "object-desk-maya-laptop", assetId: "decor-laptop", x: 320, y: 608, rotation: 0 },
  { id: "object-desk-leo-plant", assetId: "decor-desk-plant", x: 592, y: 608, rotation: 0 },
  { id: "object-desk-amara-laptop", assetId: "decor-laptop", x: 800, y: 608, rotation: 0, variantId: "ivory" },
  { id: "object-standing-desk-monitor", assetId: "decor-monitor", x: 192, y: 752, rotation: 0 },
  { id: "object-commons-lamp", assetId: "decor-lamp", x: 304, y: 240, rotation: 0, variantId: "ivory" },
  { id: "object-commons-coffee", assetId: "decor-coffee", x: 336, y: 256, rotation: 0, variantId: "coral" },
  { id: "object-daily-lamp", assetId: "decor-lamp", x: 720, y: 224, rotation: 0 },
  { id: "object-daily-laptop", assetId: "decor-laptop", x: 752, y: 240, rotation: 0, variantId: "ivory" },
  { id: "object-courtyard-coffee", assetId: "decor-coffee", x: 832, y: 1040, rotation: 0, variantId: "coral" },
]);

const rooftopObjects = objectsForFloor("floor-rooftop", [
  ...tiledSurface("rooftop-garden-rug", "wood", 224, 192, 4, 3),
  ...tiledSurface("rooftop-deck", "stone", 512, 752, 11, 3),
  ...tiledSurface("rooftop-east-garden", "grass", 1232, 80, 3, 10),
  { id: "object-garden-table", assetId: "table-meeting", x: 288, y: 256, rotation: 0, variantId: "walnut" },
  { id: "object-garden-sofa", assetId: "sofa-straight", x: 144, y: 128, rotation: 0, variantId: "gray" },
  { id: "object-garden-sofa-south", assetId: "sofa-straight", x: 144, y: 592, rotation: 180, variantId: "blue" },
  { id: "object-garden-chair-left", assetId: "chair-office", x: 256, y: 272, rotation: 90 },
  { id: "object-garden-chair-right", assetId: "chair-office", x: 416, y: 272, rotation: 270 },
  { id: "object-garden-chair-north", assetId: "chair-office", x: 336, y: 208, rotation: 0, variantId: "gray" },
  { id: "object-garden-bed", assetId: "outdoor-garden-bed", x: 128, y: 448, rotation: 0, variantId: "sage" },
  { id: "object-garden-palm", assetId: "plant-palm", x: 560, y: 112, rotation: 0, variantId: "sage" },
  { id: "object-workshop-table", assetId: "table-workbench", x: 800, y: 176, rotation: 0 },
  { id: "object-workshop-chair-west", assetId: "chair-office", x: 752, y: 192, rotation: 90, variantId: "gray" },
  { id: "object-workshop-chair-east", assetId: "chair-office", x: 1008, y: 192, rotation: 270, variantId: "gray" },
  { id: "object-workshop-chair-south-a", assetId: "chair-office", x: 848, y: 256, rotation: 180 },
  { id: "object-workshop-chair-south-b", assetId: "chair-office", x: 944, y: 256, rotation: 180 },
  { id: "object-rooftop-board", assetId: "equipment-whiteboard", x: 832, y: 112, rotation: 0, label: "Ideas" },
  { id: "object-workshop-plant", assetId: "plant-floor", x: 1152, y: 336, rotation: 0, variantId: "sage" },
  { id: "object-quiet-sofa", assetId: "sofa-corner", x: 736, y: 512, rotation: 0, variantId: "gray" },
  { id: "object-quiet-bookshelf", assetId: "equipment-bookshelf", x: 896, y: 448, rotation: 90, variantId: "white" },
  { id: "object-quiet-table", assetId: "table-cafe", x: 848, y: 624, rotation: 0, variantId: "walnut" },
  { id: "object-quiet-plant", assetId: "plant-floor", x: 688, y: 672, rotation: 0, variantId: "sage" },
  { id: "object-cafe-table", assetId: "table-cafe", x: 1024, y: 496, rotation: 0 },
  { id: "object-cafe-chair-west", assetId: "chair-office", x: 976, y: 512, rotation: 90 },
  { id: "object-cafe-chair", assetId: "chair-office", x: 1088, y: 512, rotation: 270 },
  { id: "object-cafe-plant", assetId: "plant-floor", x: 1152, y: 576, rotation: 0, variantId: "sage" },
  { id: "object-portal-down", assetId: "infrastructure-portal", x: 1120, y: 656, rotation: 0, label: "1" },
  { id: "object-plant-c", assetId: "plant-planter-row", x: 496, y: 400, rotation: 90 },
  { id: "object-rooftop-deck-table", assetId: "table-round", x: 720, y: 800, rotation: 0, variantId: "walnut" },
  { id: "object-rooftop-deck-chair-west", assetId: "chair-lounge", x: 640, y: 816, rotation: 90, variantId: "blue" },
  { id: "object-rooftop-deck-chair-east", assetId: "chair-lounge", x: 816, y: 816, rotation: 270, variantId: "blue" },
  { id: "object-rooftop-deck-cafe-table", assetId: "table-cafe", x: 1024, y: 800, rotation: 0, variantId: "walnut" },
  { id: "object-rooftop-deck-cafe-chair-west", assetId: "chair-lounge", x: 960, y: 816, rotation: 90, variantId: "gray" },
  { id: "object-rooftop-deck-cafe-chair-east", assetId: "chair-lounge", x: 1104, y: 816, rotation: 270, variantId: "gray" },
  { id: "object-rooftop-deck-bench", assetId: "outdoor-bench", x: 800, y: 896, rotation: 180, variantId: "blue" },
  { id: "object-rooftop-deck-palm-west", assetId: "plant-palm", x: 528, y: 864, rotation: 0, variantId: "sage" },
  { id: "object-rooftop-deck-palm-east", assetId: "plant-palm", x: 1168, y: 864, rotation: 0, variantId: "sage" },
  { id: "object-rooftop-garden-bed", assetId: "outdoor-garden-bed", x: 1248, y: 128, rotation: 0, variantId: "sage" },
  { id: "object-rooftop-garden-bed-b", assetId: "outdoor-garden-bed", x: 1248, y: 272, rotation: 0, variantId: "autumn" },
  { id: "object-rooftop-bench", assetId: "outdoor-bench", x: 1264, y: 432, rotation: 0, variantId: "blue" },
  { id: "object-rooftop-palm-west", assetId: "plant-palm", x: 1248, y: 576, rotation: 0, variantId: "sage" },
  { id: "object-rooftop-palm", assetId: "plant-palm", x: 1344, y: 576, rotation: 0 },
  { id: "object-garden-lamp", assetId: "decor-lamp", x: 336, y: 272, rotation: 0 },
  { id: "object-garden-coffee", assetId: "decor-coffee", x: 368, y: 288, rotation: 0, variantId: "coral" },
  { id: "object-workshop-laptop", assetId: "decor-laptop", x: 864, y: 192, rotation: 0 },
  { id: "object-workshop-table-plant", assetId: "decor-desk-plant", x: 944, y: 208, rotation: 0, variantId: "sage" },
  { id: "object-quiet-coffee", assetId: "decor-coffee", x: 864, y: 640, rotation: 0, variantId: "coral" },
  { id: "object-cafe-table-plant", assetId: "decor-desk-plant", x: 1040, y: 512, rotation: 0 },
  { id: "object-cafe-coffee", assetId: "decor-coffee", x: 1072, y: 544, rotation: 0, variantId: "coral" },
  { id: "object-rooftop-deck-coffee", assetId: "decor-coffee", x: 752, y: 816, rotation: 0, variantId: "coral" },
  { id: "object-rooftop-deck-cafe-coffee", assetId: "decor-coffee", x: 1056, y: 816, rotation: 0, variantId: "coral" },
]);

export function createSeedWorld(officeId: string): SeedWorld {
  const floors: Floor[] = [
    {
      id: "floor-studio",
      officeId,
      name: "Studio",
      level: 1,
      width: 1792,
      height: 1088,
      spawn: { x: 770, y: 890 },
      background: "#e5ded3",
    },
    {
      id: "floor-rooftop",
      officeId,
      name: "Rooftop",
      level: 2,
      width: 1408,
      height: 896,
      spawn: { x: 640, y: 710 },
      background: "#dbe6dc",
    },
  ];
  const objects = [...studioObjects, ...rooftopObjects];
  return { floors, layouts: createSeedLayouts(floors, objects) };
}

function objectsForFloor(floorId: string, objects: SeedObject[]): WorldObject[] {
  return objects.map((object) => {
    const definition = requireAssetDefinition(object.assetId);
    const variantId = object.variantId ?? getDefaultAssetVariantId(definition);
    requireAssetVariant(definition, variantId);
    return { ...object, floorId, variantId };
  });
}

function tiledSurface(
  idPrefix: string,
  variantId: string,
  x: number,
  y: number,
  columns: number,
  rows: number,
  rotation: AssetRotation = 0,
): SeedObject[] {
  requireAssetVariant(floorTileDefinition, variantId);
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `object-${idPrefix}-${column + 1}-${row + 1}`,
      assetId: floorTileDefinition.id,
      x: x + column * floorTileWidth,
      y: y + row * floorTileHeight,
      rotation,
      variantId,
    };
  });
}
