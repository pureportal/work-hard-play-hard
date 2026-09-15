const { expansionRing } = require("./joinery.cjs");

const expandedLandscape = ["plant-olive", "plant-bird-paradise", "outdoor-pergola", "outdoor-birdbath", "outdoor-wheelbarrow"];

function buildExpandedLandscape(kit, asset, width, depth) {
  const { box, cylinder, branch, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  if (id === "plant-olive" || id === "plant-bird-paradise") {
    cylinder("Terracotta planter", [0, 9, 0], 11, 18, "main", 15);
    expansionRing(kit, "Planter lip", [0, 18, 0], 14.3, 1.2, "light");
    cylinder("Dark potting soil", [0, 18, 0], 13.3, 0.8, "soil");
    if (id === "plant-olive") {
      branch("Olive trunk", [0, 17, 0], [-3, 45, 1], 2.2, "wood");
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, x = Math.cos(a) * (12 + i % 3 * 4), z = Math.sin(a) * (12 + i % 3 * 4), y = 47 + i % 4 * 6;
        branch("Olive branch", [-2, 34, 0], [x, y, z], 0.7, "wood");
        for (let leaf = 0; leaf < 7; leaf++) {
          const turn = leaf * 2.4;
          ellipsoid("Silver olive leaf", [x + Math.cos(turn) * 6, y + Math.sin(leaf) * 4, z + Math.sin(turn) * 5], [4.5, 1.2, 2.3], leaf % 3 ? "green" : "light", [0, leaf * 31, leaf % 2 ? 15 : -15]);
        }
        ellipsoid("Olive fruit", [x + 3, y - 2, z + 4], [1.1, 1.5, 1.1], "leafDark");
      }
    } else {
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, x = Math.cos(a) * 13, z = Math.sin(a) * 13, y = 30 + i % 3 * 11;
        branch("Bird-of-paradise stem", [0, 17, 0], [x, y, z], 0.8, "leafDark");
        ellipsoid("Broad banana leaf", [x, y + 7, z], [7, 15, 2], i % 2 ? "green" : "main", [i % 2 ? 30 : -30, a * 180 / Math.PI, i % 2 ? 30 : -30]);
      }
      for (const x of [-6, 7]) {
        branch("Flower stalk", [0, 18, 0], [x, 49, 5], 0.6, "green");
        ellipsoid("Flower boat", [x, 49, 5], [7, 1.6, 2], "pink", [0, 0, -12]);
        for (let i = 0; i < 3; i++) ellipsoid("Orange flower petal", [x - 3 + i * 3, 54 + i, 5], [1, 6, 0.9], "gold", [0, 0, -i * 13]);
      }
    }
  } else if (id === "outdoor-pergola") {
    for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 6, depth / 2 - 6]) {
      box("Pergola post", [x, 36, z], [7, 72, 7], "main");
      box("Post shoe", [x, 3, z], [9, 6, 9], "shade");
      branch("Pergola knee brace", [x, 52, z], [x - Math.sign(x) * 16, 70, z], 2, "wood");
    }
    for (const z of [-depth / 2 + 6, depth / 2 - 6]) box("Pergola crossbeam", [0, 72, z], [width - 1, 7, 7], "wood");
    for (let x = -width / 2 + 4; x < width / 2; x += 12) box("Open roof rafter", [x, 78, 0], [4, 5, depth - 1], "main");
    for (let i = 0; i < 16; i++) {
      const x = -width / 2 + 5 + i * 5;
      ellipsoid("Pergola climbing leaf", [x, 80 + Math.sin(i) * 2, -depth / 2 + 7 + Math.sin(i * 1.7) * 4], [4, 1.5, 2.8], i % 2 ? "green" : "leafDark", [0, i * 31, 0]);
    }
  } else if (id === "outdoor-birdbath") {
    cylinder("Birdbath base", [0, 2, 0], 15, 4, "main", 13);
    cylinder("Stone pedestal", [0, 18, 0], 5, 30, "main", 7);
    cylinder("Birdbath bowl", [0, 34, 0], 17, 6, "main", width / 2 - 1);
    cylinder("Birdbath water", [0, 37.1, 0], width / 2 - 3, 0.2, "water");
    expansionRing(kit, "Bowl rim", [0, 37.5, 0], width / 2 - 2, 1, "light");
    ellipsoid("Perched bird", [13, 41, 8], [3, 2.3, 2], "cream");
    ellipsoid("Bird head", [16, 43, 8], [1.7, 1.7, 1.7], "main");
    shape("Bird beak", new THREE.ConeGeometry(0.8, 2, 4), [18, 43, 8], "gold", [1, 1, 1], [0, 0, -90]);
  } else if (id === "outdoor-wheelbarrow") {
    const trayDepth = depth - 25;
    box("Wheelbarrow tray bottom", [0, 19, -6], [width - 15, 2, trayDepth - 10], "shade");
    for (const x of [-1, 1]) box("Sloping tray side", [x * (width / 2 - 6), 25, -6], [2, 15, trayDepth], "main", [0, 0, -x * 20]);
    for (const z of [-1, 1]) box("Tray end", [0, 25, -6 + z * (trayDepth / 2 - 3)], [width - 11, 15, 2], "main", [z * 17, 0, 0]);
    for (const x of [-width / 2 + 10, width / 2 - 10]) {
      branch("Wheelbarrow frame", [x, 12, -depth / 2 + 10], [x, 24, depth / 2 - 2], 1.5, "wood");
      branch("Wheelbarrow prop", [x, 2, 7], [x, 18, -2], 1.5, "shade");
      cylinder("Handle grip", [x, 24, depth / 2 - 6], 2, 10, "shade", 2, [90, 0, 0]);
    }
    cylinder("Wheelbarrow wheel", [0, 9, -depth / 2 + 10], 9, 6, "shade", 9, [0, 0, 90]);
    cylinder("Wheel hub", [0, 9, -depth / 2 + 10], 3, 6.5, "gold", 3, [0, 0, 90]);
    ellipsoid("Potting soil load", [0, 24, -6], [width / 2 - 9, 4, trayDepth / 2 - 4], "soil");
    for (const x of [-8, 6]) ellipsoid("Soil clod", [x, 28, -9 + x], [3, 1.5, 2], "wood");
    branch("Trowel handle", [-7, 24, -6], [5, 37, 3], 1.1, "wood");
    shape("Garden trowel blade", new THREE.ConeGeometry(3, 7, 4), [-8, 23, -7], "light", [1, 1, 0.3], [0, 0, -30]);
  }
}

module.exports = { expandedLandscape, buildExpandedLandscape };
