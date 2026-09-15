import { getAssetRasterSize, requireAssetDefinition, type FloorLayout, type RoomTemplate } from "@workhard/shared";
import type { LayoutPlan } from "../world/layout-plan.js";

export function createMakerStudios(plan: LayoutPlan): FloorLayout {
  const definitions = [
    ["animation", "Animation Studio", "felt", "#e4dbe6"], ["sound", "Sound Studio", "cork", "#dfd8cc"],
    ["materials", "Materials Lab", "grating", "#d8e3e4"], ["craft", "Craft Studio", "concrete", "#deddd4"],
    ["archive", "Project Library", "leather", "#dfd5c8"], ["conservatory", "Winter Garden", "seagrass", "#d8e1cf"],
  ];
  const rooms = definitions.map<RoomTemplate>(([id, name, material, color], index) => {
    const x = 128 + index % 3 * 512;
    const y = index < 3 ? 128 : 640;
    const height = index === 5 ? 256 : 384;
    const variant = material === "cork" ? "natural" : material === "concrete" ? "smooth" : "classic";
    plan.flooring(`floor-${id}`, `floor-${material}`, variant, x, y, 512, height);
    return { id: `room-${id}`, name: name!, color: color!, capacity: 8, anchor: { x: x + 256, y: y + 48 },
      access: { mode: "open", assignedPersonIds: [], knockable: false }, build: { mode: "default", assignedPersonIds: [] } };
  });
  plan.flooring("winter-display-floor", "floor-glass", "crafted", 1152, 896, 512, 128);
  plan.flooring("gallery-floor", "floor-terrazzo", "fine", 128, 512, 1536, 128);
  plan.flooring("roof-deck", "floor-decking", "cedar", 640, 1024, 512, 256);
  plan.flooring("potting-bed", "floor-earth", "classic", 1216, 1088, 448, 192);
  plan.object("stairs", "infrastructure-portal", 1536, 544, "blue").label = "2";
  rooms.push({ id: "room-makers-gallery", name: "Gallery", color: "#e8e3da", capacity: 16,
    anchor: { x: 896, y: 576 }, access: { mode: "open", assignedPersonIds: [], knockable: false }, build: { mode: "default", assignedPersonIds: [] } });
  furnishStudios(plan);
  return plan.finish(rooms);
}

function furnishStudios(plan: LayoutPlan): void {
  const desks = [
    ["animation", "chair-director", 176, 192], ["glass", "chair-shell", 448, 192], ["computer-hutch", "chair-cantilever", 176, 352],
    ["music", "chair-saddle", 704, 192], ["modular", "chair-office", 976, 192], ["pipe", "chair-folding", 704, 352],
    ["laboratory", "chair-stool", 1312, 192], ["jeweler", "chair-drum", 1472, 192], ["sawhorse", "chair-office", 1216, 352],
    ["sewing", "chair-windsor", 176, 704], ["calligraphy", "chair-zaisu", 448, 704], ["campaign", "chair-office", 176, 864],
    ["library", "chair-wingback", 752, 720], ["carrel", "chair-office", 976, 704], ["secretary", "chair-office", 688, 864],
    ["ladder", "chair-rattan", 1312, 704], ["traveler", "chair-office", 1504, 704], ["floating-shelf", "chair-office", 1216, 864],
  ] as const;
  for (const [desk, chair, x, y] of desks) {
    const size = getAssetRasterSize(requireAssetDefinition(`desk-${desk}`));
    plan.object(`desk-${desk}`, `desk-${desk}`, x, y, "oak");
    plan.object(`seat-${desk}`, chair, x + 16, y + size.height * 16 + 16, "white", 180);
  }
  for (const [id, asset, x, y, variant, rotation] of [
    ["animation-drafting", "table-drafting", 448, 368, "white", 0],
    ["sound-partner", "desk-partner", 976, 352, "navy", 0],
    ["materials-pedestal", "desk-pedestal", 1472, 352, "sage", 0],
    ["craft-rolltop", "desk-rolltop", 448, 864, "oak", 0],
    ["animation-chair", "chair-director", 464, 448, "white", 180],
    ["sound-chair", "chair-office", 1008, 448, "gray", 180],
    ["materials-chair", "chair-stool", 1504, 416, "white", 180],
    ["craft-chair", "chair-windsor", 480, 944, "white", 180],
    ["animation-projector", "equipment-projector", 304, 144, "white", 0],
    ["sound-speakers", "equipment-speakers", 832, 144, "graphite", 0],
    ["materials-chest", "storage-plan-chest", 1472, 144, "sage", 0],
    ["craft-apothecary", "storage-apothecary", 304, 672, "oak", 0],
    ["archive-ladder", "storage-ladder", 832, 656, "oak", 0],
    ["archive-trunk", "storage-trunk", 800, 960, "oak", 0],
    ["materials-cart", "storage-rolling-cart", 1584, 448, "sage", 0],
    ["animation-light", "light-studio", 544, 144, "silver", 0],
    ["sound-light", "light-tripod", 1088, 144, "brass", 0],
    ["archive-light", "light-mushroom", 1088, 944, "brass", 0],
    ["winter-light", "light-tulip", 1584, 960, "brass", 0],
    ["craft-light", "light-cage", 576, 944, "copper", 0],
    ["winter-olive", "plant-olive", 1392, 736, "sage", 0],
    ["winter-bird-paradise", "plant-bird-paradise", 1584, 816, "forest", 0],
    ["animation-divider", "fixture-divider", 176, 304, "oak", 0],
    ["sound-slats", "fixture-slats", 704, 304, "oak", 0],
    ["lab-barrier", "fixture-barrier", 1216, 304, "sage", 0],
    ["gallery-coats", "fixture-coat-rack", 256, 544, "oak", 0],
    ["gallery-umbrella", "fixture-umbrella", 448, 544, "oak", 0],
    ["gallery-recycling", "fixture-recycling", 1088, 528, "sage", 0],
    ["craft-shoes", "fixture-shoe-rack", 448, 656, "oak", 0],
    ["lab-parcels", "fixture-parcels", 1344, 144, "sage", 0],
    ["roof-bike", "fixture-bicycle", 656, 1056, "oak", 0],
    ["roof-sign", "fixture-signpost", 1088, 1056, "oak", 0],
    ["roof-pergola", "outdoor-pergola", 976, 1168, "sand", 0],
    ["roof-project-table", "table-folding", 752, 1120, "oak", 0],
    ["roof-project-seat", "chair-folding", 784, 1200, "white", 180],
    ["winter-slab", "table-slab", 1440, 816, "oak", 0],
    ["roof-birdbath", "outdoor-birdbath", 1488, 1168, "sand", 0],
    ["roof-wheelbarrow", "outdoor-wheelbarrow", 1280, 1152, "sand", 0],
    ["archive-rug", "rug-kilim", 976, 864, "oak", 0],
    ["archive-chaise", "sofa-chaise", 976, 864, "white", 0],
    ["winter-rug", "rug-cloud", 1440, 896, "white", 0],
    ["winter-papasan", "chair-papasan", 1440, 896, "white", 0],
    ["winter-tray", "table-tea-tray", 1504, 896, "oak", 0],
    ["lab-mat", "rug-coir", 1376, 464, "oak", 0],
    ["gallery-runner", "rug-runner", 1184, 544, "white", 90],
    ["sound-rug", "rug-shag", 976, 336, "walnut", 0],
    ["craft-rug", "rug-quilt", 448, 848, "white", 0],
    ["animation-rug", "rug-medallion", 448, 352, "white", 0],
  ] as const) plan.object(id, asset, x, y, variant, rotation);
  for (const [asset, x, y] of [
    ["decor-camera", 192, 208], ["decor-origami", 464, 192], ["decor-desk-fan", 192, 384],
    ["decor-radio", 720, 224], ["decor-record-player", 992, 208], ["decor-headphones", 720, 368],
    ["decor-hourglass", 1344, 224], ["decor-pencil-cup", 1488, 224], ["decor-model-ship", 1232, 368],
    ["decor-succulents", 464, 736], ["decor-typewriter", 704, 880], ["decor-globe", 768, 752],
    ["decor-aquarium", 992, 368], ["decor-candles", 1232, 896], ["decor-tea-set", 1504, 896],
  ] as const) plan.object(asset, asset, x, y, "ivory");
}
