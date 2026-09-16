const foodPalette = {
  rice: "#fff0d4", noodle: "#e8c989", broth: "#ae793e", meat: "#a55c46", crust: "#c99246",
  toast: "#e7b969", salmon: "#ed977f", nori: "#35554c", lettuce: "#90b56f", vegetable: "#cf6351",
  yolk: "#f0bf56", sauce: "#774b39", cucumber: "#bfd58e", onion: "#ceafd3", berry: "#63778c",
  chili: "#b84739", creamFood: "#fff4e4", chocolate: "#61463d", sausage: "#bb784a", herb: "#477b4a",
};

function foodDish(kit, bowl, radius = 13) {
  const { cylinder, shape, THREE } = kit;
  cylinder("Ceramic foot", [0, 0.6, 0], radius * 0.5, 1.2, "shade");
  const profile = (bowl ? [[0, 1], [6, 1], [8, 2], [12.5, 7], [13, 9], [12, 9.2], [11.5, 7.7], [7, 3], [0, 3]] : [[0, 1], [9, 1], [13, 2], [13.4, 2.7], [12.4, 3], [9, 1.7], [0, 1.7]]).map(([r, y]) => new THREE.Vector2(r * radius / 13, y));
  shape(bowl ? "Glazed serving bowl" : "Rimmed dinner plate", new THREE.LatheGeometry(profile, 32), [0, 0, 0], "main");
  shape("Ceramic rim", new THREE.TorusGeometry((bowl ? 12.5 : 12.8) * radius / 13, 0.4, 6, 32), [0, bowl ? 9 : 2.7, 0], "light", [1, 1, 1], [90, 0, 0]);
}

function foodChopsticks(kit, y) {
  for (const z of [-2, 1]) kit.branch("Bamboo chopstick", [-14, y, z - 8], [14, y + 1, z + 3], 0.45, "wood");
}

function foodRice(kit, position, size) {
  kit.ellipsoid("Rice mound", position, size, "rice");
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4, r = 0.2 + i % 3 * 0.21;
    kit.ellipsoid("Rice grains", [position[0] + Math.cos(a) * size[0] * r, position[1] + size[1] * 0.9, position[2] + Math.sin(a) * size[2] * r], [0.7, 0.35, 0.35], "paper", [0, i * 47, 0]);
  }
}

function foodTray(kit, width, depth) {
  kit.roundedBox("Serving platter", [0, 1, 0], [width - 2, 2, depth - 2], "shade");
  kit.roundedBox("Glazed platter center", [0, 2, 0], [width - 5, 1, depth - 5], "main");
  for (const z of [-depth / 2 + 2, depth / 2 - 2]) kit.roundedBox("Platter rim", [0, 2.4, z], [width - 4, 1.2, 1.3], "light");
}

function foodTube(kit, name, points, radius, material) {
  const { shape, THREE } = kit;
  shape(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), Math.max(16, points.length * 4), radius, 7, false), [0, 0, 0], material);
}

module.exports = { foodPalette, foodDish, foodChopsticks, foodRice, foodTray, foodTube };
