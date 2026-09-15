function buildSurface(kit, asset, width, depth) {
  const { box, cylinder, shape, surfaceGrain, THREE } = kit;
  if (asset.id === "rug-round") {
    cylinder("Bound rug", [0, -0.05, 0], width / 2, 0.1, "shade");
    cylinder("Woven field", [0, 0.01, 0], width / 2 - 1.5, 0.01, "main");
    for (let radius = 4; radius < width / 2 - 2; radius += 3.2) shape("Braided ring", new THREE.TorusGeometry(radius, 0.38, 4, 96), [0, 0.04, 0], Math.round(radius) % 2 ? "grain" : "light", [1, 1, 1], [90, 0, 0]);
    for (let index = 0; index < 24; index++) {
      const angle = index * Math.PI / 12;
      box("Border stitch", [Math.cos(angle) * (width / 2 - 3.5), 0.07, Math.sin(angle) * (depth / 2 - 3.5)], [0.5, 0.01, 2.5], "highlight", [0, -index * 15, 0]);
    }
  } else if (asset.id === "rug-tatami") {
    box("Tatami backing", [0, -0.05, 0], [width + 2, 0.1, depth + 2], "straw");
    for (let z = -depth / 2; z < depth / 2; z += 1.6) box("Woven rush", [0, 0.01, z + 0.8], [width + 2, 0.01, 0.5], "strawLight");
    for (let x = -width / 2 + 8; x < width / 2 - 4; x += 8) for (let z = -depth / 2 + 2; z < depth / 2; z += 8) box("Rush binding", [x, 0.025, z], [0.45, 0.01, 2], "strawShade");
    for (const x of [-width / 2 + 2, width / 2 - 2]) {
      box("Cloth edging", [x, 0.04, 0], [4, 0.01, depth + 2], "shade");
      box("Woven edge stripe", [x, 0.05, 0], [1.4, 0.01, depth + 2], "main");
      for (let z = -depth / 2 + 4; z < depth / 2; z += 8) box("Edge embroidery", [x, 0.06, z], [1.2, 0.01, 1.2], "light", [0, 45, 0]);
    }
  } else {
    box("Woven backing", [0, -0.05, 0], [width + 2, 0.1, depth + 2], "main");
    for (let z = -depth / 2; z < depth / 2; z += 2) box("Weft", [0, 0.01, z], [width + 2, 0.01, 0.35], "grain");
    for (const x of [-width / 2 + 3, width / 2 - 3]) box("Bound end", [x, 0.02, 0], [2, 0.01, depth], "shade");
    for (const z of [-depth / 2 + 5, depth / 2 - 5]) {
      box("Woven border", [0, 0.03, z], [width - 8, 0.01, 3], "light");
      box("Border thread", [0, 0.04, z], [width - 8, 0.01, 0.6], "grain");
    }
    for (let x = -width / 2 + 16; x < width / 2 - 8; x += 24) {
      box("Woven diamond", [x, 0.04, 0], [9, 0.01, 9], "light", [0, 45, 0]);
      box("Diamond center", [x, 0.05, 0], [4.5, 0.01, 4.5], "main", [0, 45, 0]);
    }
    surfaceGrain([0, 0.06, 0], width - 12, depth - 18, "grain");
  }
  for (const part of kit.parts) part.outline = false;
}

module.exports = { buildSurface };
