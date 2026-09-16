const { gardenLeaf, gardenFlower, gardenPot } = require("./botanical-kit.cjs");
const { houseplants, buildHouseplant } = require("./houseplants.cjs");

const indoorPlants = ["plant-snake", "plant-fern", "plant-rubber", "plant-calathea", "plant-orchid", "plant-peace-lily", "plant-string-pearls", "plant-jade", "plant-citrus", "plant-aloe", ...houseplants];

function buildIndoorPlant(kit, asset, variant, width, depth) {
  if (houseplants.includes(asset.id)) return buildHouseplant(kit, asset, variant, width, depth);
  const { cylinder, ellipsoid, branch, box } = kit;
  const id = asset.id;
  const small = asset.placement.layer === "surface";
  const radius = Math.min(width, depth) * (small ? 0.31 : 0.28), h = small ? 7 : 14;
  gardenPot(kit, radius, h, variant.id);
  const potParts = [...kit.parts];
  if (id === "plant-snake" || id === "plant-aloe") {
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4, tall = id === "plant-snake";
      const reach = tall ? 6 : 12, height = tall ? 22 + i % 4 * 7 : 6 + i % 3 * 4;
      gardenLeaf(kit, tall ? "Striped sword leaf" : "Aloe spear", [Math.cos(a) * 3, h, Math.sin(a) * 3], [Math.cos(a) * (tall ? 9 : reach), h + height, Math.sin(a) * (tall ? 9 : reach)], tall ? 3.1 : 2.7, i % 2 ? "leafDeep" : "leaf", true);
    }
  } else if (id === "plant-fern") {
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const tip = [Math.cos(a) * 22, h + 5, Math.sin(a) * 22];
      branch("Arching fern rib", [0, h, 0], [tip[0] * 0.45, h + 18, tip[2] * 0.45], 0.45, "leafDeep");
      branch("Fern tip", [tip[0] * 0.45, h + 18, tip[2] * 0.45], tip, 0.4, "leafDeep");
      for (let n = 1; n <= 6; n++) for (const side of [-1, 1]) {
        const t = n / 7, x = tip[0] * t, z = tip[2] * t, y = h + (t < 0.45 ? t / 0.45 * 18 : 18 - (t - 0.45) / 0.55 * 13);
        const span = (1 - t) * 11;
        gardenLeaf(kit, "Fern leaflet", [x, y, z], [x + Math.cos(a + side * 1.1) * span, y - 2, z + Math.sin(a + side * 1.1) * span], 1.9, n % 2 ? "leafLight" : "leaf");
      }
    }
  } else if (id === "plant-rubber" || id === "plant-jade" || id === "plant-citrus") {
    const top = small ? 23 : 62;
    branch("Plant trunk", [0, h, 0], [-2, top, 0], small ? 1 : 1.8, "bark");
    for (let i = 0; i < (id === "plant-rubber" ? 12 : 9); i++) {
      const a = i * 2.4, y = h + 7 + i * (top - h - 9) / (id === "plant-rubber" ? 12 : 9), reach = small ? 8 : id === "plant-rubber" ? 7 : 14;
      const p = [Math.cos(a) * reach, y, Math.sin(a) * reach];
      branch("Branch", [-1, y - 3, 0], p, small ? 0.5 : 0.7, "bark");
      if (id === "plant-rubber") gardenLeaf(kit, "Glossy rubber leaf", p, [p[0] * 2.5, y + 12, p[2] * 2.5], 7, i % 2 ? "leafDeep" : "leaf", true);
      else for (let j = 0; j < 4; j++) {
        const b = j * 1.57;
        ellipsoid("Waxy oval leaf", [p[0] + Math.cos(b) * 3, y + j % 2 * 3, p[2] + Math.sin(b) * 3], small ? [3, 1.1, 2] : [5, 2, 3], j % 2 ? "leaf" : "leafLight", [0, j * 40 + i * 30, 0]);
      }
      if (id === "plant-citrus" && i % 2 === 0) ellipsoid("Ripe orange", [p[0], y - 2.5, p[2] + 2], [3, 3, 3], "fruit");
    }
  } else if (id === "plant-calathea" || id === "plant-peace-lily" || id === "plant-orchid") {
    const orchid = id === "plant-orchid";
    for (let i = 0; i < (orchid ? 5 : 10); i++) {
      const a = i * 2.4, reach = orchid ? 10 : 17, y = h + (orchid ? 7 : 15 + i % 3 * 5);
      const p = [Math.cos(a) * reach * 0.4, y - 6, Math.sin(a) * reach * 0.4];
      branch("Leaf stem", [0, h, 0], p, 0.6, "leafDeep");
      const tip = [Math.cos(a) * reach, y + 4, Math.sin(a) * reach];
      gardenLeaf(kit, "Broad pointed leaf", p, tip, orchid ? 3.8 : 6.2, i % 2 ? "leaf" : "leafDeep", id === "plant-calathea" ? "feathered" : true);
    }
    if (id !== "plant-calathea") for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 6, y = h + (orchid ? 25 : 31) + i % 2 * 5;
      branch("Flower stalk", [0, h, 0], [x, y, -3], 0.55, "leafDeep");
      if (orchid) {
        for (let n = 0; n < 3; n++) gardenFlower(kit, [x + n * 2, y - n * 5, -3 + n * 2], 3.3, "flower");
      } else {
        gardenLeaf(kit, "White spathe", [x, y - 5, -3], [x + 3, y + 4, -3], 3.5, "paper");
        cylinder("Golden spadix", [x + 0.8, y, -1.5], 0.65, 5, "pollen");
      }
    }
  } else if (id === "plant-string-pearls") {
    for (const x of [-7, 7]) for (const z of [-7, 7]) box("Plant stand leg", [x, 17, z], [1.3, 34, 1.3], "wood");
    for (const part of potParts) {
      if (part.element.type === "mesh") for (const vertex of Object.values(part.element.vertices)) vertex[1] += 26;
    }
    box("Stand shelf", [0, 27, 0], [20, 2, 20], "wood");
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      for (let n = 0; n < 10 + i % 3; n++) {
        const r = radius + 1 + Math.sin(n * 0.4) * 2;
        ellipsoid("Trailing pearl leaf", [Math.cos(a) * r, h + 26 - n * 2.5, Math.sin(a) * r], [1.35, 1.5, 1.35], n % 3 ? "leaf" : "leafLight");
      }
    }
    ellipsoid("Pearl crown", [0, h + 26, 0], [radius - 1, 2.5, radius - 1], "leafDeep");
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = 1 + i % 5 * 1.4;
      ellipsoid("Pearl crown leaves", [Math.cos(a) * r, h + 28 + i % 2, Math.sin(a) * r], [1.5, 1.6, 1.5], i % 3 ? "leaf" : "leafLight");
    }
  }
}

module.exports = { indoorPlants, buildIndoorPlant };
