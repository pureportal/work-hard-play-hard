const { buildSurface } = require("./surfaces.cjs");
const { buildFlooring } = require("./flooring/index.cjs");
const { gameTablePalette } = require("./game-tables.cjs");
const { gongPalette } = require("./celebration-gong.cjs");
const { arcadePalette } = require("./arcade-cabinet.cjs");
const { expandedDesks, buildExpandedDesk } = require("./expansion/desks.cjs");
const { expandedSeating, buildExpandedSeating } = require("./expansion/seating.cjs");
const { expandedTables, buildExpandedTable } = require("./expansion/tables.cjs");
const { expandedDecor, buildExpandedDecor } = require("./expansion/decor.cjs");
const { expandedFixtures, buildExpandedFixture } = require("./expansion/fixtures.cjs");
const { expandedEquipment, buildExpandedEquipment } = require("./expansion/equipment.cjs");
const { expandedLandscape, buildExpandedLandscape } = require("./expansion/landscape.cjs");
const { expandedRugs, buildExpandedRug } = require("./expansion/rugs.cjs");

function getCatalogFootprint(asset, rasterSize) {
  const cells = asset.footprint.flatMap(region => region.cells ?? [{ x: region.range.x + region.range.width - 1, y: region.range.y + region.range.height - 1 }]);
  return { width: (Math.max(...cells.map(cell => cell.x)) + 1) * rasterSize, depth: (Math.max(...cells.map(cell => cell.y)) + 1) * rasterSize };
}

async function createCatalogModel(api, asset, variant, rasterSize) {
  if (models[asset.id]) {
    const model = await createLoungeModel(api, asset.id, variant.id);
    return { ...model, palette: palettes[variant.id] };
  }
  api.newProject(api.Formats.free);
  api.Project.name = `${asset.name} - ${variant.name}`;
  api.Project.texture_width = api.Project.texture_height = 16;
  const palette = {
    main: variant.color, light: variant.secondaryColor, shade: variant.accentColor,
    wood: "#967663", edge: "#514552", paper: "#fff4df", cream: "#eedfc8", gold: "#d4ac71",
    ink: "#343547", pink: "#e4a5b7", green: "#89a989", water: "#75c4d2", waterLight: "#c2edf0",
  };
  const blend = (first, second, amount) => "#" + [1, 3, 5].map(start => Math.round(parseInt(first.slice(start, start + 2), 16) * (1 - amount) + parseInt(second.slice(start, start + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
  Object.assign(palette, {
    grain: blend(palette.light, palette.main, 0.28),
    stitch: blend(palette.main, palette.edge, 0.4),
    highlight: blend(palette.light, "#fff4df", 0.32),
    soil: "#605044", leafDark: blend(palette.main, "#294b43", 0.36),
    straw: "#c9bc91", strawLight: "#ddd0a5", strawShade: "#b1a780",
  });
  if (asset.kind === "floor-tile") Object.assign(palette, {
    grain: blend(palette.main, palette.light, 0.35), highlight: blend(palette.main, palette.light, 0.8),
    stitch: blend(palette.main, palette.shade, 0.6), accent1: "#ba9d92", accent2: "#c5b582",
  });
  if (asset.id === "floor-resin") Object.assign(palette, {
    grain: blend(palette.main, palette.light, 0.1),
    light: blend(palette.main, palette.light, 0.18),
    highlight: blend(palette.main, palette.light, 0.27),
  });
  if (asset.id === "floor-earth" && variant.id === "crafted") palette.grain = blend(palette.main, palette.light, 0.12);
  if (asset.id === "plant-bamboo") Object.assign(palette, { leafLight: "#b7caa0", leafShade: "#527f67" });
  if (["equipment-chess", "equipment-falling-blocks"].includes(asset.id)) Object.assign(palette, gameTablePalette);
  if (asset.id === "equipment-gong") Object.assign(palette, gongPalette);
  if (asset.id === "equipment-arcade") Object.assign(palette, arcadePalette);
  if (asset.id === "light-stone-lantern") Object.assign(palette, { stone: "#aba5b2", stoneLight: "#d8d3db", stoneShade: "#777180" });
  const kit = createModelKit(api, palette);
  await Promise.all(Object.values(kit.textures).map(texture => texture.img.decode()));
  const { width, depth } = getCatalogFootprint(asset, rasterSize);
  let metadata;
  if (expandedDesks[asset.id]) metadata = buildExpandedDesk(kit, asset, width, depth);
  else if (expandedSeating[asset.id]) metadata = buildExpandedSeating(kit, asset, width, depth);
  else if (expandedTables[asset.id]) metadata = buildExpandedTable(kit, asset, width, depth);
  else if (expandedDecor.includes(asset.id)) buildExpandedDecor(kit, asset, width, depth);
  else if (expandedFixtures.includes(asset.id)) buildExpandedFixture(kit, asset, width, depth);
  else if (expandedEquipment.includes(asset.id)) buildExpandedEquipment(kit, asset, width, depth);
  else if (expandedLandscape.includes(asset.id)) buildExpandedLandscape(kit, asset, width, depth);
  else if (expandedRugs.includes(asset.id)) buildExpandedRug(kit, asset, width, depth);
  else if (courtyardModels.includes(asset.id)) metadata = buildCourtyard(api, kit, asset, width, depth);
  else if (asset.category === "architecture") buildArchitecture(kit, asset, width, depth);
  else if (asset.kind === "desk") metadata = buildDesk(kit, asset, width, depth);
  else if (asset.kind === "table") metadata = buildTable(kit, asset, width, depth);
  else if (asset.kind === "chair" || asset.kind === "sofa") metadata = buildSeating(kit, asset, width, depth);
  else if (asset.kind === "plant" || asset.kind === "garden") buildBotanical(kit, asset, width, depth);
  else if (asset.kind === "pool" || asset.kind === "fountain") buildWater(kit, asset, width, depth);
  else if (asset.kind === "storage" || asset.kind === "bookshelf") metadata = buildStorage(kit, asset, width, depth);
  else if (asset.kind === "lamp") buildLamp(kit, asset, width, depth);
  else if (asset.kind === "appliance") buildAppliance(kit, asset, width, depth);
  else if (asset.kind === "floor-tile") buildFlooring(kit, asset, width, depth, variant);
  else if (asset.placement.layer === "ground") buildSurface(kit, asset, width, depth, variant);
  else if (["whiteboard", "gong", "game", "arcade", "portal"].includes(asset.kind)) buildEquipment(kit, asset, width, depth);
  else if (asset.placement.layer === "surface") buildDecoration(kit, asset, width, depth);
  else throw new Error(`Missing Blockbench model builder: ${asset.id}`);
  api.Canvas.updateAll();
  return { width, depth, parts: kit.parts, palette, ...metadata };
}

module.exports = { createCatalogModel, getCatalogFootprint, buildSurface };
