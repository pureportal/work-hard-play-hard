const { gardenLeaf, gardenPot } = require("./botanical-kit.cjs");

const houseplants = ["plant-pilea", "plant-spider", "plant-anthurium", "plant-zz", "plant-echeveria", "plant-croton"];

function buildHouseplant(kit, asset, variant, width, depth) {
  const { ellipsoid, branch, cylinder, shape, THREE } = kit;
  const small = asset.placement.layer === "surface", h = small ? 8 : 14;
  gardenPot(kit, Math.min(width, depth) * (small ? 0.31 : 0.27), h, variant.id);
  if (asset.id === "plant-pilea") {
    branch("Central pilea stem", [0, h, 0], [0, 28, 0], 0.8, "leafDeep");
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = i < 6 ? 9 : 5, y = h + 6 + i * 1.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      branch("Pilea petiole", [0, y - 4, 0], [x, y, z], 0.45, "leafDeep");
      ellipsoid("Round coin leaf", [x, y, z], [4.6, 0.65, 4.6], i % 3 ? "leaf" : "leafLight", [Math.cos(a) * 18, 0, Math.sin(a) * 18]);
      ellipsoid("Pilea leaf center", [x, y + 0.65, z], [0.75, 0.3, 0.75], "vein");
    }
  } else if (asset.id === "plant-spider") {
    for (let i = 0; i < 17; i++) {
      const a = i * 2.4, reach = i < 10 ? 20 : 12;
      const mid = [Math.cos(a) * reach * 0.4, h + 17 + i % 3 * 2, Math.sin(a) * reach * 0.4];
      gardenLeaf(kit, "Striped upright ribbon", [0, h, 0], mid, 1.5, "leaf", true);
      gardenLeaf(kit, "Arching spider ribbon", mid, [Math.cos(a) * reach, h + 3 + i % 3 * 2, Math.sin(a) * reach], 1.8, i % 3 ? "leafLight" : "leaf", true);
    }
    for (const a of [0.5, 3.4]) {
      const end = [Math.cos(a) * 19, 4, Math.sin(a) * 19];
      branch("Trailing plantlet stem", [0, h + 5, 0], end, 0.5, "leafDeep");
      for (let i = 0; i < 5; i++) gardenLeaf(kit, "Spider plantlet", end, [end[0] + Math.cos(i * 1.26) * 4, 9, end[2] + Math.sin(i * 1.26) * 4], 0.9, "leafLight");
    }
  } else if (asset.id === "plant-anthurium") {
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, p = [Math.cos(a) * 4, h + 5, Math.sin(a) * 4];
      branch("Anthurium leaf stalk", [0, h, 0], p, 0.5, "leafDeep");
      gardenLeaf(kit, "Glossy anthurium leaf", p, [Math.cos(a) * 13, h + 14 + i % 2 * 5, Math.sin(a) * 13], 4.6, "leafDeep", true);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.4, x = Math.cos(a) * 7, z = Math.sin(a) * 7, y = 33 + i * 3;
      branch("Anthurium flower stalk", [0, h, 0], [x, y, z], 0.55, "leaf");
      const heart = new THREE.Shape();
      heart.moveTo(0, 0); heart.bezierCurveTo(-9, 5, -7, 12, 0, 8); heart.bezierCurveTo(7, 12, 9, 5, 0, 0);
      shape("Heart-shaped coral spathe", new THREE.ExtrudeGeometry(heart, { depth: 0.6, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.3, bevelSegments: 1, steps: 1, curveSegments: 8 }), [x, y - 3, z], "berry", [0.75, 0.75, 1], [-30, i * 120, 0]);
      branch("Cream spadix", [x, y, z + 0.8], [x, y + 5, z + 2], 0.65, "paper");
    }
  } else if (asset.id === "plant-zz") {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, height = 24 + i % 3 * 8, reach = 9 + i % 2 * 3;
      const tip = [Math.cos(a) * reach, h + height, Math.sin(a) * reach];
      branch("ZZ succulent stem", [0, h, 0], tip, 1, "leaf");
      for (let n = 1; n <= 4; n++) for (const side of [-1, 1]) {
        const t = n / 5, p = [tip[0] * t, h + height * t, tip[2] * t];
        gardenLeaf(kit, "Paired glossy ZZ leaf", p, [p[0] + Math.cos(a + side * 1.25) * 8, p[1] + 5, p[2] + Math.sin(a + side * 1.25) * 8], 2.9, n % 2 ? "leafDeep" : "leaf");
      }
      gardenLeaf(kit, "ZZ terminal leaf", tip, [tip[0] * 1.15, tip[1] + 6, tip[2] * 1.15], 2.3, "leafLight");
    }
  } else if (asset.id === "plant-echeveria") {
    for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 8 - ring; i++) {
      const a = i * Math.PI * 2 / (8 - ring) + ring * 0.5, reach = 13 - ring * 3;
      const p = [0, h + ring * 2, 0], tip = [Math.cos(a) * reach, h + 3 + ring * 4, Math.sin(a) * reach];
      gardenLeaf(kit, "Fleshy rosette leaf", p, tip, 3.6 - ring * 0.55, ring % 2 ? "leafLight" : "leaf");
      ellipsoid("Rosette rose tip", [tip[0] * 0.89, tip[1] - 0.4, tip[2] * 0.89], [0.8, 0.5, 0.8], "flower");
    }
    cylinder("Rosette heart", [0, h + 10, 0], 1.5, 3, "leafLight", 0.5);
  } else if (asset.id === "plant-croton") {
    for (let trunk = 0; trunk < 3; trunk++) {
      const a = trunk * 2.1, x = Math.cos(a) * 4, z = Math.sin(a) * 4;
      branch("Woody croton stem", [x, h, z], [x * 1.5, 49 - trunk * 4, z * 1.5], 0.9, "bark");
      for (let i = 0; i < 5; i++) {
        const turn = i * 2.4 + a, y = h + 9 + i * 6, p = [x, y, z];
        gardenLeaf(kit, "Croton painted leaf", p, [x + Math.cos(turn) * 13, y + 9, z + Math.sin(turn) * 13], 3.9, ["leafDeep", "fruit", "berry", "leaf", "pollen"][i], true);
      }
    }
  }
}

module.exports = { houseplants, buildHouseplant };
