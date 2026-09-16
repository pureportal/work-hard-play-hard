const { gardenLeaf, gardenFlower } = require("./botanical-kit.cjs");
const { landscapePlants, buildLandscapePlant } = require("./landscape-plants.cjs");

const outdoorPlants = ["outdoor-maple", "outdoor-pine", "outdoor-birch", "outdoor-willow", "outdoor-apple", "outdoor-hydrangea", "outdoor-rose-hedge", "outdoor-lavender", "outdoor-agave", "outdoor-mushrooms", ...landscapePlants];

function buildOutdoorPlant(kit, asset, variant, width, depth) {
  if (landscapePlants.includes(asset.id)) return buildLandscapePlant(kit, asset, variant, width, depth);
  const { cylinder, ellipsoid, branch, shape, box, THREE } = kit;
  const id = asset.id, radius = Math.min(width, depth) / 2 - 3;
  if (["outdoor-maple", "outdoor-pine", "outdoor-birch", "outdoor-willow", "outdoor-apple"].includes(id)) {
    const top = id === "outdoor-pine" ? 94 : id === "outdoor-willow" ? 77 : id === "outdoor-birch" ? 94 : id === "outdoor-maple" ? 61 : 65;
    const birch = id === "outdoor-birch";
    branch("Tree trunk", [0, 0, 0], [-2, top - 15, 0], birch ? 2.8 : 4, birch ? "paper" : "bark");
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      branch("Exposed root", [0, 4, 0], [Math.cos(a) * 10, 0.8, Math.sin(a) * 10], 1.5, birch ? "paper" : "bark");
    }
    if (id === "outdoor-pine") {
      for (let tier = 0; tier < 5; tier++) {
        const r = radius * (0.72 - tier * 0.13), y = 27 + tier * 14;
        shape("Evergreen crown", new THREE.ConeGeometry(r, 25 - tier * 2, 10), [0, y + 6, 0], "leaf", [1, 1, 1], [0, tier * 23, 0]);
        for (let i = 0; i < 7; i++) {
          const a = i * Math.PI * 2 / 7 + tier * 0.5;
          const x = Math.cos(a) * r * 0.7, z = Math.sin(a) * r * 0.7;
          branch("Pine bough", [0, y, 0], [x, y - 2, z], 0.7, "bark");
          shape("Pointed pine spray", new THREE.ConeGeometry(r * 0.48, 18 - tier * 1.6, 7), [x, y + 2, z], i % 3 ? "leaf" : "leafLight", [1, 1, 1], [Math.sin(a) * 16, 0, -Math.cos(a) * 16]);
        }
      }
      for (let i = 0; i < 6; i++) ellipsoid("Pine cone", [Math.cos(i * 2.4) * 17, 24 + i % 2 * 16, Math.sin(i * 2.4) * 17], [1.5, 3, 1.5], "barkLight");
    } else {
      if (birch) for (const side of [-1, 1]) branch("Slender birch stem", [side * 3, 0, 0], [side * 8, top - 20, side * 4], 2.2, "paper");
      for (let i = 0; i < 9; i++) {
        const maple = id === "outdoor-maple";
        const a = i * 2.4, reach = birch ? 9 : radius * (i < 6 ? 0.62 : 0.26);
        const x = Math.cos(a) * reach, z = Math.sin(a) * reach, y = birch ? 48 + i * 5 : top - 18 + i % 3 * (maple ? 4 : 8);
        branch("Branching crown", [-1, 30 + i % 3 * 4, 0], [x, y, z], 1.6, birch ? "paper" : "bark");
        ellipsoid("Sculpted canopy", [x, y, z], birch ? [9, 12, 8] : [radius * 0.47, maple ? 5.5 : 11, radius * 0.43], i % 3 ? "leaf" : "leafLight");
        if (maple) for (let l = 0; l < 7; l++) {
          const outline = new THREE.Shape();
          for (let point = 0; point < 10; point++) {
            const turn = point * Math.PI / 5, r = point % 2 ? 2.3 : 6;
            if (point === 0) outline.moveTo(Math.cos(turn) * r, Math.sin(turn) * r);
            else outline.lineTo(Math.cos(turn) * r, Math.sin(turn) * r);
          }
          outline.closePath();
          shape("Lobed maple leaf cluster", new THREE.ExtrudeGeometry(outline, { depth: 0.7, bevelEnabled: false, steps: 1 }), [x + Math.cos(l * 2.4) * 9, y + 5 + l % 2, z + Math.sin(l * 2.4) * 8], l % 3 ? "leaf" : "leafLight", [1, 1, 1], [-75, 0, l * 37]);
        }
        else for (let l = 0; l < 4; l++) ellipsoid("Canopy leaf tuft", [x + Math.cos(l * 2.4) * (birch ? 4 : 8), y + 7, z + Math.sin(l * 2.4) * (birch ? 4 : 7)], birch ? [4, 5, 3] : [7, 4, 5], i % 2 ? "leafLight" : "leaf");
        if (id === "outdoor-apple") for (let n = 0; n < 4; n++) {
          const turn = n * Math.PI / 2;
          ellipsoid("Apple", [x + Math.cos(turn) * 11, y + (n % 2 ? 8 : 1), z + Math.sin(turn) * 11], [2.8, 3, 2.8], "berry");
        }
      }
      if (id === "outdoor-willow") for (let i = 0; i < 20; i++) {
        const a = i * Math.PI / 10, x = Math.cos(a) * radius * 0.86, z = Math.sin(a) * radius * 0.86;
        const y = 62 + i % 3 * 3;
        branch("Draping willow bough", [x * 0.7, y, z * 0.7], [x, 22 + i % 3 * 3, z], 0.65, "leafDeep");
        for (let k = 0; k < 9; k++) gardenLeaf(kit, "Cascading willow leaf", [x * (0.8 + k * 0.025), y - k * 4, z * (0.8 + k * 0.025)], [x + Math.cos(a + 1.57) * 3, y - k * 4 - 9, z + Math.sin(a + 1.57) * 3], 2.1, i % 2 ? "leafLight" : "leaf");
      }
      if (birch) for (let i = 0; i < 9; i++) box("Birch bark scar", [-i % 2, 6 + i * 5, 2.5], [3 + i % 2, 0.9, 0.5], "bark", [0, i * 31, 0]);
    }
  } else if (id === "outdoor-hydrangea" || id === "outdoor-rose-hedge") {
    const hedge = id === "outdoor-rose-hedge";
    for (let i = 0; i < (hedge ? 5 : 4); i++) {
      const x = hedge ? -width / 2 + 10 + i * (width - 20) / 4 : Math.cos(i * 1.57) * 9;
      const z = hedge ? 0 : Math.sin(i * 1.57) * 9;
      branch("Shrub stem", [x, 0, z], [x, 20, z], 1.2, "bark");
      ellipsoid("Rounded shrub foliage", [x, 13, z], [hedge ? 11 : 13, 12, 12], i % 2 ? "leaf" : "leafDeep");
      for (let n = 0; n < 4; n++) {
        const p = [x + Math.cos(n * 2.4) * 7, 23 + n % 2 * 2, z + Math.sin(n * 2.4) * 7];
        if (hedge) {
          gardenFlower(kit, p, 3.5);
          gardenFlower(kit, [p[0], p[1] + 0.8, p[2]], 2, "flowerLight");
        } else {
          ellipsoid("Hydrangea flower dome", p, [4.8, 3.4, 4.8], "flower");
          for (let k = 0; k < 5; k++) gardenFlower(kit, [p[0] + Math.cos(k * 2.4) * 2.8, p[1] + 2.7 + k % 2, p[2] + Math.sin(k * 2.4) * 2.8], 2.1, k % 2 ? "flower" : "flowerLight", 4);
        }
      }
    }
  } else if (id === "outdoor-lavender") {
    for (let i = 0; i < 6; i++) ellipsoid("Lavender silver foliage", [Math.cos(i * 2.4) * 7, 4, Math.sin(i * 2.4) * 7], [6, 4, 5], i % 2 ? "leaf" : "leafLight");
    for (let i = 0; i < 19; i++) {
      const a = i * 2.4, r = 3 + i % 5 * 3, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 14 + i % 4 * 3;
      branch("Lavender stem", [x * 0.6, 0, z * 0.6], [x, y, z], 0.45, "leaf");
      gardenLeaf(kit, "Silver lavender leaf", [x * 0.7, 3, z * 0.7], [x + 4, 9, z + 2], 1.3, "leafLight");
      for (let k = 0; k < 4; k++) ellipsoid("Lavender blossom whorl", [x, y + k * 2, z], [2 - k * 0.3, 1.5, 2 - k * 0.3], k % 2 ? "flower" : "flowerLight");
    }
  } else if (id === "outdoor-agave") {
    for (let i = 0; i < 15; i++) {
      const a = i * 2.4, reach = i < 9 ? radius : radius * 0.45;
      gardenLeaf(kit, "Agave blade", [0, 1, 0], [Math.cos(a) * reach, i < 9 ? 13 : 29, Math.sin(a) * reach], 3, i % 2 ? "leaf" : "leafLight", true);
    }
    for (let i = 0; i < 7; i++) ellipsoid("Desert pebble", [Math.cos(i * 2.4) * radius * 0.7, 0.7, Math.sin(i * 2.4) * radius * 0.7], [2, 1, 1.5], "stone");
  } else if (id === "outdoor-mushrooms") {
    ellipsoid("Moss cushion", [0, 1, 0], [radius, 2, radius], "leafDeep");
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, x = Math.cos(a) * 9, z = Math.sin(a) * 9, y = 8 + i % 3 * 4, r = 4 + i % 3;
      cylinder("Mushroom stem", [x, y / 2, z], 1.8, y, "paper", 1.3);
      ellipsoid("Mushroom gills", [x, y, z], [r, 0.7, r], "cream");
      shape("Domed mushroom cap", new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [x, y, z], "flower", [1, 0.7, 1]);
      for (let n = 0; n < 5; n++) ellipsoid("Cap freckle", [x + Math.cos(n * 2.4) * r * 0.5, y + r * 0.59, z + Math.sin(n * 2.4) * r * 0.5], [0.7, 0.3, 0.7], "paper");
    }
  }
}

module.exports = { outdoorPlants, buildOutdoorPlant };
