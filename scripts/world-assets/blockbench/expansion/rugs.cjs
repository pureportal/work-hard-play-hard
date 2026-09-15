const expandedRugs = ["rug-kilim", "rug-runner", "rug-coir", "rug-shag", "rug-medallion", "rug-cloud", "rug-quilt"];

function buildExpandedRug(kit, asset, width, depth) {
  const { box, roundedBox, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  const rectangle = (name, x, z, w, d, color, y = 0.3) => box(name, [x, y, z], [w, 0.1, d], color);
  const diamond = (name, x, z, w, d, color, y = 0.5) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -d / 2, w / 2, 0, 0, 0, 0, d / 2, 0, 0, -d / 2, 0, 0, d / 2, -w / 2, 0, 0], 3));
    geometry.computeVertexNormals();
    shape(name, geometry, [x, y, z], color);
  };
  if (id === "rug-cloud") {
    ellipsoid("Cloud rug center", [0, 0.3, 0], [width / 2 - 6, 0.5, depth / 2 - 9], "light");
    for (const x of [-width / 2 + 15, -8, 12, width / 2 - 15]) ellipsoid("Scalloped wool lobe", [x, 0.3, Math.sin(x) * 3], [14, 0.5, depth / 2 - 3], "light");
    for (const x of [-12, 11]) rectangle("Cloud embroidered eyelid", x, 1, 5, 0.7, "stitch", 0.85);
  } else {
    roundedBox("Bound rug backing", [0, 0, 0], [width - 0.4, 0.5, depth - 0.4], "shade");
    rectangle("Rug field", 0, 0, width - 5, depth - 5, "main");
    if (id === "rug-coir") {
      rectangle("Coir field", 0, 0, width - 5, depth - 5, "straw", 0.35);
      for (let z = -depth / 2 + 4; z < depth / 2 - 2; z += 1.8) rectangle("Coir fibre row", 0, z, width - 7, 0.45, "strawShade", 0.46);
      for (const side of [-1, 1]) rectangle("Doormat stripe", side * (width / 2 - 8), 0, 2.2, depth - 6, "main", 0.55);
    } else if (id === "rug-shag") {
      for (let z = -depth / 2 + 3; z < depth / 2 - 2; z += 2.5) for (let x = -width / 2 + 3; x < width / 2 - 2; x += 3) {
        const variation = Math.sin(x * 12.9898 + z * 78.233);
        ellipsoid("Soft shag tuft", [x + Math.sin(z * 3 + x) * 0.8, 0.7 + variation * 0.3, z + Math.cos(x * 2 + z) * 0.6], [1.5, 1.1, 1.4], variation > 0.7 ? "main" : "light");
      }
    } else if (id === "rug-medallion") {
      for (const [w, d, color] of [[width - 9, depth - 9, "light"], [width - 15, depth - 15, "main"], [width - 20, depth - 20, "shade"]]) rectangle("Medallion border", 0, 0, w, d, color, 0.4 + (width - w) * 0.005);
      diamond("Central medallion", 0, 0, width * 0.55, depth * 0.7, "light", 0.65);
      diamond("Medallion inset", 0, 0, width * 0.34, depth * 0.44, "main", 0.7);
      diamond("Medallion flower", 0, 0, 12, 18, "gold", 0.75);
      for (const x of [-1, 1]) for (const z of [-1, 1]) diamond("Corner flower", x * width * 0.3, z * depth * 0.3, 8, 12, "gold", 0.7);
    } else if (id === "rug-quilt") {
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
        const x = (col - 2) * (width - 6) / 5, z = (row - 2) * (depth - 6) / 5, w = (width - 6) / 5 - 0.8, d = (depth - 6) / 5 - 0.8;
        rectangle("Patchwork square", x, z, w, d, ["main", "light", "shade", "cream"][(col + row * 2) % 4], 0.45);
        if ((row + col) % 2) diamond("Quilt patch motif", x, z, w * 0.65, d * 0.65, "gold", 0.5);
      }
    } else if (id === "rug-kilim") {
      for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
        const x = ((col + 0.5) / 4 - 0.5) * (width - 10), z = (row - 1) * (depth - 8) / 3;
        diamond("Woven kilim diamond", x, z, (width - 12) / 4, (depth - 9) / 3, (row + col) % 2 ? "light" : "shade");
        diamond("Kilim center", x, z, 5, 7, "gold", 0.55);
      }
    } else {
      for (const side of [-1, 1]) rectangle("Runner border", side * (width / 2 - 7), 0, 2.5, depth - 8, "light", 0.45);
      for (let z = -depth / 2 + 18; z < depth / 2; z += 24) { diamond("Runner lozenge", 0, z, width - 20, 22, "light"); diamond("Runner inset", 0, z, width - 30, 12, "shade", 0.55); }
    }
    if (!["rug-coir", "rug-shag"].includes(id)) for (const side of [-1, 1]) for (let x = -width / 2 + 4; x < width / 2 - 2; x += 3) rectangle("Woven fringe", x, side * (depth / 2 - 1.4), 1, 2.5, "cream", 0.35);
  }
  for (const part of kit.parts) part.outline = false;
}

module.exports = { expandedRugs, buildExpandedRug };
