const { foodDish, foodTray, foodTube } = require("./serving.cjs");

const cafeDishes = ["food-pizza", "food-tacos", "food-hotdog", "food-waffles", "food-strawberry-cake"];

function buildCafeDish(kit, asset, width, depth) {
  const { cylinder, ellipsoid, roundedBox, box, shape, THREE } = kit;
  if (asset.id === "food-tacos") foodTray(kit, width, depth);
  else foodDish(kit, false, 14);
  if (asset.id === "food-pizza") {
    cylinder("Pizza crust", [0, 3.4, 0], 11.5, 2, "crust");
    cylinder("Tomato pizza sauce", [0, 4.45, 0], 10.2, 0.25, "chili");
    cylinder("Melted mozzarella", [0, 4.65, 0], 9.5, 0.3, "noodle");
    shape("Raised pizza crust", new THREE.TorusGeometry(10.7, 0.95, 8, 32), [0, 4.5, 0], "toast", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + 0.35;
      cylinder("Pepperoni slice", [Math.cos(a) * 6, 4.95, Math.sin(a) * 6], 2.1, 0.35, "chili");
      ellipsoid("Basil leaf", [Math.cos(a + 0.5) * 7.7, 5.2, Math.sin(a + 0.5) * 7.7], [1, 0.25, 1.7], "herb", [0, i * 45, 0]);
    }
    for (let i = 0; i < 3; i++) box("Pizza slice cut", [0, 5.3, 0], [20, 0.2, 0.35], "crust", [0, i * 60, 0]);
  } else if (asset.id === "food-tacos") {
    for (const x of [-12, 1, 14]) {
      const shell = new THREE.CylinderGeometry(5.2, 5.2, 15, 16, 1, true, 0, Math.PI);
      shape("Curved taco shell", shell, [x, 5, 0], "toast", [1, 1, 1], [90, 0, 0]);
      for (const side of [-1, 1]) ellipsoid("Taco shell side", [x + side * 3.6, 6.5, 0], [0.65, 4.3, 7.2], "yolk");
      for (let i = 0; i < 6; i++) {
        ellipsoid("Seasoned taco filling", [x, 7.5, -5 + i * 2], [2.5, 1.6, 1.7], "meat");
        ellipsoid("Shredded taco lettuce", [x + (i % 2 ? 1 : -1), 9.1, -5 + i * 2], [1.8, 0.65, 1.5], "lettuce");
        roundedBox("Diced taco tomato", [x + (i % 2 ? -1 : 1), 9.7, -4.5 + i * 2], [1.4, 1.1, 1.4], "chili");
      }
      foodTube(kit, "Sour cream drizzle", [[x, 10.4, -5], [x - 0.8, 10.6, -2], [x + 0.8, 10.4, 1], [x, 10.4, 5]], 0.4, "creamFood");
    }
  } else if (asset.id === "food-hotdog") {
    for (const x of [-3.8, 3.8]) ellipsoid("Split hotdog bun", [x, 4.6, 0], [3.8, 2.8, 10.7], "toast");
    ellipsoid("Grilled hotdog", [0, 6, 0], [2.5, 2.3, 11.2], "sausage");
    foodTube(kit, "Mustard zigzag", Array.from({ length: 10 }, (_, i) => [i % 2 ? 1.5 : -1.5, 8.3, -8.5 + i * 1.9]), 0.5, "yolk");
    for (let i = 0; i < 5; i++) roundedBox("Relish", [i % 2 ? 2.5 : -2.5, 7, -6 + i * 3], [1.2, 0.8, 1.5], "herb");
    for (let i = 0; i < 3; i++) ellipsoid("Pickle slice", [9, 3 + i * 0.4, -4 + i * 3], [2, 0.6, 2.6], "cucumber");
  } else if (asset.id === "food-waffles") {
    roundedBox("Belgian waffle", [0, 3.5, 0], [18, 3, 18], "toast");
    for (let x = -6; x <= 6; x += 4) for (let z = -6; z <= 6; z += 4) roundedBox("Toasted waffle pocket", [x, 5.05, z], [2.8, 0.18, 2.8], "crust");
    roundedBox("Butter pat", [0, 6, 0], [4, 1.5, 4], "yolk");
    foodTube(kit, "Maple syrup ribbon", [[-7, 5.4, -5], [-3, 5.5, -3], [3, 5.5, -4], [7, 5.4, -1], [2, 5.4, 2], [-6, 5.4, 4]], 0.5, "sauce");
    for (const x of [-7, 7]) {
      ellipsoid("Strawberry", [x, 6.8, 7], [2.2, 2.5, 2.2], "chili");
      for (let i = 0; i < 3; i++) ellipsoid("Strawberry leaf", [x + Math.cos(i * 2.1), 9, 7 + Math.sin(i * 2.1)], [1.3, 0.35, 0.8], "herb");
    }
  } else if (asset.id === "food-strawberry-cake") {
    const wedge = new THREE.Shape();
    wedge.moveTo(-8, -7); wedge.lineTo(8, -7); wedge.lineTo(0, 10); wedge.closePath();
    for (let layer = 0; layer < 6; layer++) {
      const material = layer % 2 ? "creamFood" : "toast";
      shape("Shortcake layer", new THREE.ExtrudeGeometry(wedge, { depth: layer % 2 ? 1.4 : 2.3, bevelEnabled: false, steps: 1 }), [0, 3 + layer * 1.9, 0], material, [1, 1, 1], [-90, 0, 0]);
    }
    for (let i = 0; i < 3; i++) {
      ellipsoid("Whipped cream rosette", [-4 + i * 4, 15, 3], [2.3, 2, 2.3], "creamFood");
      ellipsoid("Cake strawberry", [-4 + i * 4, 17, 3], [1.8, 2.3, 1.8], "chili");
    }
    for (const x of [-4, 4]) for (const y of [6, 10]) ellipsoid("Strawberry in cream", [x, y, 7.1], [1.3, 1, 0.3], "salmon");
  }
}

module.exports = { cafeDishes, buildCafeDish };
