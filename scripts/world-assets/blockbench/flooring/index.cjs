const { createFloorGeometry } = require("./geometry.cjs");
const { buildWoodFloor } = require("./wood.cjs");
const { buildMineralFloor } = require("./mineral.cjs");
const { buildTextileFloor } = require("./textile.cjs");
const { buildResilientFloor } = require("./resilient.cjs");
const { buildLandscapeFloor } = require("./landscape.cjs");
const { buildCollectionFloor } = require("./collection.cjs");

function buildFlooring(kit, asset, width, depth, variant) {
  const geometry = createFloorGeometry(kit, width, depth);
  const family = {
    "floor-wood": buildWoodFloor, "floor-parquet": buildWoodFloor, "floor-laminate": buildWoodFloor,
    "floor-bamboo": buildWoodFloor, "floor-decking": buildWoodFloor,
    "floor-ceramic": buildMineralFloor, "floor-stone-tiles": buildMineralFloor, "floor-stone": buildMineralFloor,
    "floor-concrete": buildMineralFloor, "floor-terrazzo": buildMineralFloor, "floor-brick": buildMineralFloor, "floor-pavers": buildMineralFloor,
    "floor-carpet": buildTextileFloor, "floor-cork": buildTextileFloor, "floor-sisal": buildTextileFloor, "floor-jute": buildTextileFloor,
    "floor-vinyl": buildResilientFloor, "floor-pvc": buildResilientFloor, "floor-linoleum": buildResilientFloor,
    "floor-resin": buildResilientFloor, "floor-rubber": buildResilientFloor,
    "floor-grass": buildLandscapeFloor, "floor-artificial-grass": buildLandscapeFloor, "floor-gravel": buildLandscapeFloor,
    "floor-glass": buildCollectionFloor, "floor-grating": buildCollectionFloor, "floor-leather": buildCollectionFloor,
    "floor-earth": buildCollectionFloor, "floor-felt": buildCollectionFloor, "floor-seagrass": buildCollectionFloor,
  }[asset.id];
  if (!family) throw new Error(`Missing flooring model: ${asset.id}`);
  family(geometry, asset, variant);
  for (const part of kit.parts) part.outline = false;
}

module.exports = { buildFlooring };
