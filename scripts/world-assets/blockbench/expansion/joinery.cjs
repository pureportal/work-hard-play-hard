function expansionLegs(kit, width, depth, height, style = "tapered") {
  const { box, cylinder, branch } = kit;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 5);
    if (style === "panel") box("Solid end panel", [x, height / 2, 0], [5, height, depth - 3], "main");
    else if (style === "trestle") {
      for (const z of [-1, 1]) branch("Splayed trestle", [x, 1, z * (depth / 2 - 3)], [x, height, z * 3], 2.3, "wood");
      box("Trestle stretcher", [x, 9, 0], [4, 3, depth - 7], "shade");
    } else if (style === "sled") {
      box("Sled runner", [x, 1.5, 0], [3, 3, depth - 2], "shade");
      for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Sled upright", [x, height / 2, z], [3, height, 3], "shade");
    } else for (const z of [-depth / 2 + 4, depth / 2 - 4]) {
      if (style === "hairpin") {
        branch("Hairpin outside", [x, 1, z], [x - side * 4, height, z - Math.sign(z) * 3], 0.9, "shade");
        branch("Hairpin inside", [x, 1, z], [x + side * 2, height, z + Math.sign(z)], 0.9, "shade");
      } else {
        cylinder("Tapered hardwood leg", [x, height / 2, z], 1.6, height, "wood", 2.5);
        cylinder("Metal foot cap", [x, 1.2, z], 1.9, 2.4, "gold");
      }
    }
  }
  if (style === "trestle") box("Trestle crossbar", [0, 10, 0], [width - 9, 3, 3], "wood");
}

function expansionTop(kit, width, depth, height, shape = "rectangle", material = "light") {
  const { roundedBox, shape: mesh, surfaceGrain, THREE } = kit;
  if (shape === "oval" || shape === "round") {
    mesh("Rounded tabletop rim", new THREE.CylinderGeometry(1, 1, 3, 48), [0, height - 1, 0], "main", [width / 2 - 0.5, 1, depth / 2 - 0.5]);
    mesh("Rounded tabletop face", new THREE.CylinderGeometry(1, 1, 0.5, 48), [0, height + 0.75, 0], material, [width / 2 - 1.5, 1, depth / 2 - 1.5]);
    surfaceGrain([0, height + 1.03, 0], width * 0.62, depth * 0.57);
  } else {
    roundedBox("Solid tabletop edge", [0, height - 1, 0], [width - 0.5, 3, depth - 0.5], "main");
    roundedBox("Tabletop face", [0, height + 0.65, 0], [width - 3, 0.4, depth - 3], material);
    if (material === "waterLight") {
      for (const offset of [-7, 5]) kit.branch("Polished glass glint", [-width * 0.23, height + 0.96, -depth * 0.2 + offset], [width * 0.2, height + 0.96, depth * 0.2 + offset], 0.45, "paper");
    } else surfaceGrain([0, height + 0.88, 0], width - 9, depth - 9);
  }
}

function expansionDrawers(kit, x, z, width, depth, height, rows = 3) {
  const { box, roundedBox } = kit;
  roundedBox("Drawer carcass", [x, height / 2, z], [width, height, depth], "shade");
  for (let row = 0; row < rows; row++) {
    const y = 3 + (row + 0.5) * (height - 6) / rows;
    box("Inset drawer front", [x, y, z + depth / 2 + 0.2], [width - 2, (height - 6) / rows - 1, 1], "main");
    box("Brass drawer pull", [x, y, z + depth / 2 + 0.9], [Math.min(9, width / 2), 1.1, 1.2], "gold");
  }
}

function expansionRing(kit, name, position, radius, thickness, material, rotation = [90, 0, 0]) {
  return kit.shape(name, new kit.THREE.TorusGeometry(radius, thickness, 6, 40), position, material, [1, 1, 1], rotation);
}

module.exports = { expansionLegs, expansionTop, expansionDrawers, expansionRing };
