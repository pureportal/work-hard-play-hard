import type { AssetRotation } from "@workhard/shared";
import type { LayoutPlan } from "../world/layout-plan.js";

type Furnishing = [asset: string, x: number, y: number, variant: string, rotation?: AssetRotation];

export function furnishSocialSpaces(plan: LayoutPlan): void {
  const ground: Furnishing[] = [
    ["breakroom-sink", 176, 768, "cream"], ["breakroom-microwave", 544, 784, "cream"],
    ["breakroom-bakery", 448, 752, "cream"], ["breakroom-juice", 496, 960, "cream"],
    ["breakroom-popcorn", 1216, 816, "cherry"], ["breakroom-vending", 1440, 816, "mint"],
    ["table-bar", 288, 1120, "oak"], ["sofa-banquette", 176, 1056, "white"],
    ["table-tile", 192, 1120, "white"], ["table-pedestal-square", 992, 1200, "white"],
    ["table-cable-spool", 1792, 1008, "oak"], ["sofa-slat-bench", 1792, 1104, "white", 180],
  ];
  const upper: Furnishing[] = [
    ["table-oval", 400, 224, "walnut"], ["chair-office", 544, 240, "blue", 270],
    ["table-console", 400, 160, "walnut"], ["table-nesting", 976, 432, "walnut"],
    ["table-cantilever", 1056, 432, "white"], ["table-display", 1024, 528, "white"],
    ["sofa-chesterfield", 960, 960, "blue"], ["table-trunk", 976, 896, "oak"],
    ["table-kotatsu", 1488, 944, "oak"], ["chair-rocker", 1376, 944, "white"],
    ["sofa-futon", 1760, 176, "white"], ["table-lift", 1776, 272, "white"],
    ["sofa-daybed", 1760, 736, "white"], ["table-drum", 1888, 736, "walnut"],
    ["sofa-bench-storage", 1760, 944, "white"], ["table-hairpin", 1760, 848, "oak"],
    ["table-glass", 1280, 1120, "white"], ["chair-rattan", 1392, 1120, "white", 270],
    ["table-crossbase", 1536, 1120, "white"], ["chair-dining", 1632, 1136, "white", 270],
    ["table-bistro", 1792, 1120, "white"], ["chair-dining", 1888, 1136, "white", 270],
    ["plant-olive", 1216, 1216, "sage"], ["outdoor-lantern", 1920, 1216, "sand"],
  ];
  if (plan.floor.level === 2) {
    plan.flooring("east-patio-north", "floor-pavers", "ash", 1728, 128, 256, 384);
    plan.flooring("east-patio-south", "floor-pavers", "ash", 1728, 640, 256, 384);
    plan.flooring("east-patio-walk", "floor-stone-tiles", "limestone", 1664, 512, 320, 128);
    plan.flooring("south-roof-terrace", "floor-decking", "cedar", 1216, 1056, 768, 256);
  }
  for (const [index, [asset, x, y, variant, rotation]] of (plan.floor.level === 1 ? ground : upper).entries()) {
    plan.object(`social-${index}`, asset, x, y, variant, rotation);
  }
}
