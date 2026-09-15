import { getAssetRasterSize, requireAssetDefinition, type AssetRotation } from "@workhard/shared";
import type { LayoutPlan } from "../world/layout-plan.js";

type Furniture = [id: string, asset: string, x: number, y: number, variant?: string, rotation?: AssetRotation];

export function furnishGroundFloor(plan: LayoutPlan): void {
  for (const [id, x, y, asset] of [
    ["soren", 192, 208, "desk-straight"], ["mei", 416, 208, "desk-straight"],
    ["dev", 192, 368, "desk-straight"], ["rafael", 416, 368, "desk-standing"],
    ["yuki", 704, 208, "desk-corner"], ["ines", 928, 208, "desk-atelier"],
    ["celia", 704, 368, "desk-drafting"], ["ada", 928, 368, "desk-standing"],
  ] as const) workstation(plan, id, asset, x, y, id === "yuki" ? "navy" : "sage");
  const furniture: Furniture[] = [
    ["engineering-bookcase", "equipment-bookshelf", 320, 144, "white"],
    ["engineering-board", "equipment-whiteboard", 448, 160, "white"],
    ["engineering-plant", "plant-floor", 576, 448, "sage"],
    ["design-board", "equipment-whiteboard", 928, 144, "white"],
    ["design-cubby", "storage-cubby", 816, 144, "oak"],
    ["design-bonsai", "plant-bonsai", 1072, 432, "sage"],
    ["juniper-board", "equipment-whiteboard", 1280, 160, "white"],
    ["juniper-table", "table-meeting", 1312, 288, "walnut"],
    ["juniper-seat-nw", "chair-office", 1328, 240, "blue"],
    ["juniper-seat-ne", "chair-office", 1408, 240, "blue"],
    ["juniper-seat-sw", "chair-office", 1328, 368, "blue", 180],
    ["juniper-seat-se", "chair-office", 1408, 368, "blue", 180],
    ["juniper-seat-w", "chair-office", 1264, 304, "blue", 90],
    ["juniper-seat-e", "chair-office", 1456, 304, "blue", 270],
    ["juniper-sideboard", "storage-credenza", 1504, 192, "oak"],
    ["juniper-palm", "plant-palm", 1584, 416, "sage"],
    ["fridge", "breakroom-fridge", 560, 848, "cream"],
    ["coffee-bar", "breakroom-coffee-bar", 256, 688, "cream"],
    ["water-cooler", "breakroom-water-cooler", 416, 688, "cream"],
    ["cafe-table", "table-cafe", 224, 832, "white"],
    ["cafe-seat-n", "chair-dining", 240, 784, "white"],
    ["cafe-seat-s", "chair-dining", 240, 928, "white", 180],
    ["cafe-round-table", "table-round", 448, 832, "oak"],
    ["cafe-round-seat", "chair-stool", 464, 944, "white", 180],
    ["cafe-checklist", "equipment-checklist", 448, 688, "white"],
    ["cafe-monstera", "plant-monstera", 160, 944, "forest"],
    ["reception", "desk-reception", 976, 688, "oak"],
    ["reception-chair", "chair-office", 1024, 768, "white", 180],
    ["mail-desk", "desk-compact", 976, 880, "oak"],
    ["mail-stool", "chair-stool", 992, 928, "white", 180],
    ["lockers", "storage-locker", 688, 752, "sage"],
    ["welcome-rug", "rug-woven", 688, 816, "white"],
    ["welcome-sofa", "sofa-straight", 704, 816, "white"],
    ["welcome-table", "table-coffee", 720, 880, "oak"],
    ["welcome-light", "light-floor", 656, 832, "brass"],
    ["welcome-palm", "plant-palm", 1072, 960, "sage"],
    ["arcade", "equipment-arcade", 1280, 688, "violet"],
    ["falling-blocks", "equipment-falling-blocks", 1344, 736, "violet"],
    ["tic-tac-toe", "equipment-tic-tac-toe", 1504, 688, "white"],
    ["chess", "equipment-chess", 1504, 880, "white"],
    ["gaming-desk", "desk-gaming", 1216, 880, "navy"],
    ["gaming-chair", "chair-office", 1248, 944, "blue", 180],
    ["games-beanbag", "chair-beanbag", 1408, 944, "blue"],
    ["gong", "equipment-gong", 784, 688, "graphite"],
    ["gallery-display", "storage-display", 448, 528, "oak"],
    ["gallery-crystal", "light-crystal", 704, 544, "brass"],
    ["juniper-vase", "decor-vase", 1536, 192, "ivory"],
    ["juniper-laptop", "decor-laptop", 1328, 304, "graphite"],
    ["coffee", "decor-coffee", 240, 848, "coral"],
    ["round-plant", "decor-desk-plant", 480, 864, "sage"],
    ["reception-monitor", "decor-monitor", 1008, 704, "ivory"],
    ["welcome-cat", "decor-maneki-cat", 1088, 704, "sakura"],
    ["mail-tray", "decor-pr-tray", 992, 880, "ivory"],
    ["mail-clock", "decor-clock", 1024, 896, "ivory"],
    ["welcome-books", "decor-books", 736, 880, "ivory"],
    ["gaming-monitor", "decor-monitor", 1248, 880, "graphite"],
    ["gaming-headphones", "decor-headphones", 1296, 896, "coral"],
  ];
  for (const args of furniture) plan.object(...args);
}

export function furnishUpperFloor(plan: LayoutPlan): void {
  workstation(plan, "rowan", "desk-executive", 224, 256, "oak");
  workstation(plan, "imani", "desk-corner", 736, 256, "navy");
  workstation(plan, "lucia", "desk-straight", 1248, 256, "sage");
  const furniture: Furniture[] = [
    ["rowan-credenza", "storage-credenza", 288, 160, "oak"],
    ["rowan-sofa", "sofa-velvet", 448, 352, "blue"],
    ["rowan-side-table", "table-side", 560, 368, "walnut"],
    ["rowan-round-rug", "rug-round", 448, 336, "walnut"],
    ["rowan-trophy", "decor-trophy", 320, 160, "ivory"],
    ["rowan-terrarium", "decor-terrarium", 560, 368, "forest"],
    ["rowan-arc-light", "light-arc", 576, 160, "brass"],
    ["imani-filing", "storage-filing", 832, 160, "ink"],
    ["imani-bookcase", "equipment-bookshelf", 944, 160, "white"],
    ["imani-loveseat", "sofa-loveseat", 992, 352, "gray"],
    ["imani-cactus", "plant-cactus", 1088, 176, "sage"],
    ["lucia-corner-sofa", "sofa-corner", 1504, 320, "white"],
    ["lucia-marble", "table-marble", 1408, 384, "white"],
    ["lucia-light", "light-paper", 1584, 160, "brass"],
    ["lucia-sakura", "plant-sakura", 1408, 160, "sakura"],
    ["workbench", "table-workbench", 240, 768, "oak"],
    ["workshop-stool-a", "chair-stool", 272, 720, "gray"],
    ["workshop-stool-b", "chair-stool", 368, 720, "gray"],
    ["workshop-stool-c", "chair-stool", 272, 864, "gray", 180],
    ["workshop-stool-d", "chair-stool", 368, 864, "gray", 180],
    ["workshop-board", "equipment-checklist", 448, 688, "white"],
    ["workshop-cubby", "storage-cubby", 176, 944, "sage"],
    ["workshop-laptop", "decor-laptop", 304, 784, "graphite"],
    ["library-books-a", "equipment-bookshelf", 784, 688, "white"],
    ["library-books-b", "equipment-bookshelf", 976, 688, "white"],
    ["library-chair", "chair-lounge", 720, 800, "white"],
    ["library-ottoman", "chair-ottoman", 736, 880, "white"],
    ["library-sofa", "sofa-reading-bench", 992, 800, "matcha"],
    ["library-side-table", "table-side", 1072, 816, "oak"],
    ["library-lamp", "light-floor", 688, 816, "brass"],
    ["library-books", "decor-books", 1072, 816, "ivory"],
    ["tea-screen", "decor-shoji-screen", 1184, 752, "matcha"],
    ["tea-cart", "breakroom-tea-cart", 1504, 688, "matcha"],
    ["tea-rug", "rug-tatami", 1264, 800, "matcha"],
    ["tea-table", "table-chabudai", 1296, 816, "matcha"],
    ["tea-seat", "sofa-reading-bench", 1296, 736, "matcha"],
    ["tea-ottoman", "chair-ottoman", 1312, 896, "white", 180],
    ["tea-bamboo", "plant-bamboo", 1584, 864, "matcha"],
    ["tea-pinwheel", "decor-pinwheel", 1328, 832, "matcha"],
    ["tea-vase", "decor-vase", 1296, 832, "ivory"],
    ["balcony-bench", "outdoor-bench", 704, 1184, "white", 180],
    ["balcony-tree", "plant-sakura", 1056, 1184, "sakura"],
    ["balcony-lantern", "outdoor-lantern", 656, 1184, "sand"],
    ["balcony-table", "table-cafe", 992, 1104, "white"],
    ["balcony-chair", "chair-dining", 1072, 1120, "white", 270],
    ["balcony-lawn-bench", "outdoor-bench", 192, 1152, "white"],
  ];
  for (const args of furniture) plan.object(...args);
}

function workstation(plan: LayoutPlan, id: string, assetId: string, x: number, y: number, variant: string): void {
  const size = getAssetRasterSize(requireAssetDefinition(assetId));
  plan.object(`${id}-desk`, assetId, x, y, variant);
  plan.object(`${id}-monitor`, "decor-monitor", x + 32, y, "graphite");
  plan.object(`${id}-lamp`, "decor-lamp", x, y + 16, "ivory");
  if (assetId !== "desk-standing") {
    plan.object(`${id}-chair`, "chair-office", x + 32, y + size.height * 16 + 16, "gray", 180);
  }
}
