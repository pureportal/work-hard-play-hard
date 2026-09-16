const { foodDish, foodTray, foodTube } = require("./serving.cjs");

const europeanDishes = ["food-currywurst", "food-spaetzle", "food-apple-strudel"];

function buildEuropeanDish(kit, asset, width, depth) {
  const { ellipsoid, cylinder, box, roundedBox } = kit;
  if (asset.id === "food-currywurst") {
    foodTray(kit, width, depth);
    for (let i = 0; i < 6; i++) {
      const x = -16 + i * 4.7;
      cylinder("Sliced currywurst", [x, 4.8, 4], 2.6, 3.6, "sausage", 2.6, [0, 0, 90]);
      cylinder("Sausage cut face", [x + 1.85, 4.8, 4], 2.2, 0.15, "salmon", 2.2, [0, 0, 90]);
      ellipsoid("Curry ketchup", [x, 7.1, 4], [2.2, 0.65, 2], "chili");
      ellipsoid("Curry powder", [x, 7.75, 4], [1.1, 0.12, 0.8], "crust");
    }
    foodTube(kit, "Curry sauce ribbon", [[-17, 7.3, 3.5], [-10, 7.5, 4.5], [-2, 7.4, 3.5], [8, 7.5, 4]], 0.9, "chili");
    for (let i = 0; i < 9; i++) box("Golden fries", [-13 + i % 5 * 4.5, 3.6 + Math.floor(i / 5) * 1.4, -6], [1.7, 1.4, 8], "yolk", [0, -18 + i * 5, 0]);
    box("Wooden currywurst fork", [15, 5, 6], [1, 0.5, 8], "wood", [0, -30, 0]);
  } else if (asset.id === "food-spaetzle") {
    foodDish(kit, false, 14);
    ellipsoid("Cheese spaetzle mound", [0, 3, 0], [10, 1.8, 10], "noodle");
    for (let i = 0; i < 23; i++) {
      const a = i * 2.4, r = 2 + i % 4 * 2;
      foodTube(kit, "Spaetzle noodle", [[Math.cos(a) * r - 1.5, 4.2 + i % 3 * 0.3, Math.sin(a) * r - 1], [Math.cos(a) * r, 4.6 + i % 3 * 0.3, Math.sin(a) * r], [Math.cos(a) * r + 1.8, 4.3 + i % 3 * 0.3, Math.sin(a) * r + 2]], 0.85, i % 3 ? "noodle" : "yolk");
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.cos(i * 2.4) * 5, z = Math.sin(i * 2.4) * 5;
      foodTube(kit, "Caramelized onion", [[x - 2, 6, z], [x, 6.5, z - 2], [x + 2, 6, z], [x, 6, z + 2]], 0.65, "sauce");
    }
    for (let i = 0; i < 5; i++) ellipsoid("Parsley leaf", [Math.cos(i * 2.4) * 7, 6, Math.sin(i * 2.4) * 7], [1.1, 0.35, 1.3], "herb");
  } else if (asset.id === "food-apple-strudel") {
    foodTray(kit, width, depth);
    for (const x of [-11, 1]) {
      roundedBox("Baked strudel slice", [x, 6, 0], [10, 7, 15], "crust");
      roundedBox("Strudel pastry layers", [x, 6, 7.7], [8.5, 5.5, 0.35], "noodle");
      roundedBox("Cinnamon apple filling", [x, 5.8, 8], [6.8, 3.4, 0.3], "sauce");
      for (let i = 0; i < 5; i++) ellipsoid("Baked apple piece", [x - 2.4 + i % 3 * 2.2, 5 + i % 2 * 1.5, 8.3], [1.1, 0.8, 0.3], "toast");
      for (let i = 0; i < 4; i++) box("Flaky pastry ridge", [x, 9.6, -5 + i * 3.4], [8.5, 0.5, 0.65], "toast", [0, -10, 0]);
      for (let i = 0; i < 23; i++) ellipsoid("Powdered sugar", [x + Math.cos(i * 2.4) * (1 + i % 3), 10, Math.sin(i * 2.4) * (2 + i % 4)], [0.4, 0.12, 0.45], "creamFood");
    }
    ellipsoid("Vanilla ice cream scoop", [15, 5.8, 1], [4.7, 4.5, 4.7], "creamFood");
    ellipsoid("Vanilla sauce", [15, 2.8, 1], [5.5, 0.3, 6], "noodle");
  }
}

module.exports = { europeanDishes, buildEuropeanDish };
