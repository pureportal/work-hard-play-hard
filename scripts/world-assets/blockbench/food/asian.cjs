const { foodDish, foodTray, foodRice, foodTube } = require("./serving.cjs");

const asianDishes = ["food-bibimbap", "food-onigiri", "food-tempura", "food-gyoza"];

function buildAsianDish(kit, asset, width, depth) {
  const { cylinder, ellipsoid, roundedBox, box, shape, THREE } = kit;
  if (asset.id === "food-bibimbap") {
    foodDish(kit, true, 14);
    foodRice(kit, [0, 7.4, 0], [11.5, 1.2, 11.5]);
    for (let i = 0; i < 5; i++) {
      box("Julienned carrot", [-8 + i * 1.3, 9 + i % 2 * 0.2, -4], [0.8, 0.9, 5.3], "vegetable", [0, -25, 0]);
      ellipsoid("Seasoned spinach", [2.5 + i % 3 * 2.2, 8.8, -7.4 + Math.floor(i / 3) * 2.5], [1.8, 1, 2.3], i % 2 ? "herb" : "lettuce", [0, i * 25, 0]);
      foodTube(kit, "Bean sprout", [[-3 + i * 1.3, 9, 5], [-2.5 + i * 1.3, 9.3, 7], [-2 + i * 1.3, 9, 9]], 0.4, "noodle");
    }
    for (let i = 0; i < 3; i++) {
      ellipsoid("Bibimbap beef", [-8 + i * 0.9, 9, 2 + i * 2.1], [2, 0.9, 1.6], "meat");
      ellipsoid("Shiitake slice", [7.5, 9, -1 + i * 2.6], [2.7, 0.6, 1], "sauce", [0, -15, 0]);
      ellipsoid("Shiitake flesh", [7.5, 9.55, -1 + i * 2.6], [1.8, 0.15, 0.5], "toast");
    }
    ellipsoid("Fried egg white", [0, 10, 0], [5.4, 0.7, 5], "creamFood");
    ellipsoid("Sunny egg yolk", [0.4, 11, 0], [2.8, 1, 2.8], "yolk");
    ellipsoid("Gochujang", [7, 9.5, 6], [2.1, 0.8, 2], "chili");
    for (let i = 0; i < 7; i++) ellipsoid("Sesame garnish", [Math.cos(i * 2.4) * 8, 10.1, Math.sin(i * 2.4) * 8], [0.5, 0.2, 0.3], "rice");
  } else if (asset.id === "food-onigiri") {
    foodTray(kit, width, depth);
    for (const x of [-10, 7]) {
      const riceShape = new THREE.Shape();
      riceShape.moveTo(-6, 0); riceShape.quadraticCurveTo(-8, 1, -6, 4); riceShape.lineTo(-1.5, 12); riceShape.quadraticCurveTo(0, 14, 1.5, 12); riceShape.lineTo(6, 4); riceShape.quadraticCurveTo(8, 1, 6, 0); riceShape.closePath();
      shape("Triangular rice ball", new THREE.ExtrudeGeometry(riceShape, { depth: 7, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.5, bevelSegments: 2, steps: 1, curveSegments: 6 }), [x, 3, -4], "rice");
      roundedBox("Onigiri nori wrapper", [x, 5.7, 3.7], [6, 5.6, 0.8], "nori");
      box("Nori wrapper base", [x, 3.1, 0], [6, 0.6, 8], "nori");
      roundedBox("Nori wrapper back", [x, 5.7, -4.7], [6, 5.6, 0.8], "nori");
      for (let i = 0; i < 6; i++) ellipsoid("Onigiri rice grain", [x - 3 + i % 3 * 3, 7 + Math.floor(i / 3) * 3, 3.7], [0.6, 0.45, 0.2], "creamFood");
    }
    for (let i = 0; i < 3; i++) ellipsoid("Pickled radish", [16, 3.4 + i * 0.5, -6 + i * 3], [2.5, 0.6, 2], "yolk");
  } else if (asset.id === "food-tempura") {
    foodTray(kit, width, depth);
    for (let i = 0; i < 3; i++) {
      const x = -13 + i * 7;
      foodTube(kit, "Crisp tempura shrimp", [[x, 4, 7], [x - 2, 5, 2], [x - 1, 5, -4], [x + 1, 5, -7]], 2.2, "toast");
      for (let k = 0; k < 8; k++) ellipsoid("Tempura crumb", [x + Math.sin(k * 2.4) * 1.8, 6 + k % 2 * 0.5, -5 + k * 1.5], [0.9, 0.65, 0.9], k % 2 ? "noodle" : "crust");
      for (const side of [-1, 1]) ellipsoid("Red shrimp tail", [x + side * 1.3, 5, 9], [1.3, 0.7, 3.3], "salmon", [0, side * 25, 0]);
    }
    cylinder("Dipping cup", [15, 4, -5], 4.6, 3, "light");
    cylinder("Tempura dipping sauce", [15, 5.6, -5], 3.6, 0.2, "sauce");
    for (let i = 0; i < 3; i++) ellipsoid("Tempura squash", [10 + i * 2, 3.5 + i * 0.6, 6], [3, 0.7, 4], "yolk", [0, i * 20, 0]);
  } else if (asset.id === "food-gyoza") {
    foodTray(kit, width, depth);
    for (let i = 0; i < 5; i++) {
      const x = -16 + i * 6.8, z = Math.sin(i * 0.8) * 3;
      ellipsoid("Seared dumpling base", [x, 3.2, z], [2.8, 0.7, 5.5], "crust");
      ellipsoid("Gyoza crescent", [x, 5, z], [2.7, 2.5, 5.3], "rice");
      for (let k = 0; k < 5; k++) {
        const dz = -3.4 + k * 1.7;
        const points = [-1.8, 0, 1.8].map(dx => [x + dx, 5.25 + 2.5 * Math.sqrt(Math.max(0.05, 1 - (dx / 2.7) ** 2 - (dz / 5.3) ** 2)), z + dz + (dx === 0 ? 0.35 : 0)]);
        foodTube(kit, "Gyoza pinched pleat", points, 0.32, "toast");
      }
      foodTube(kit, "Gyoza folded seam", [-4.5, -2, 0, 2, 4.5].map(dz => [x, 5.4 + 2.5 * Math.sqrt(1 - (dz / 5.3) ** 2), z + dz]), 0.3, "rice");
    }
    cylinder("Soy dipping cup", [14, 3.7, -9], 3.5, 2.5, "light");
    cylinder("Soy sauce", [14, 5, -9], 2.7, 0.15, "sauce");
    ellipsoid("Chili oil", [14.5, 5.2, -9], [1.1, 0.15, 1.1], "chili");
  }
}

module.exports = { asianDishes, buildAsianDish };
