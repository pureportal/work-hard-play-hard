function buildDesk(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, surfaceGrain } = kit;
  const id = asset.id;
  const height = id === "desk-standing" ? 46 : 34;
  const corner = id === "desk-corner";
  const surfaces = corner ? [[0, -depth / 2 + 16, width, 32], [-width / 2 + 16, 16, 32, depth - 32]] : [[0, 0, width, depth]];
  for (const [x, z, w, d] of surfaces) {
    roundedBox("Rounded edge apron", [x, height - 3, z], [w - 1, 5, d - 1], "shade");
    roundedBox("Desktop", [x, height, z], [w - 0.6, 2.4, d - 0.6], "main");
    roundedBox("Desktop inlay", [x, height + 1.25, z], [w - 5, 0.25, d - 5], "light");
    surfaceGrain([x, height + 1.41, z], w - 8, d - 8);
    if (w >= 48) for (const side of [-1, 1]) {
      cylinder("Cable grommet", [x + side * (w / 2 - 10), height + 1.44, z - d / 2 + 8], 2, 0.2, "shade");
      box("Grommet slot", [x + side * (w / 2 - 10), height + 1.56, z - d / 2 + 8], [2.6, 0.1, 0.65], "gold");
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cylinder("Tapered leg", [x + sx * (w / 2 - 3), height / 2 - 1, z + sz * (d / 2 - 3)], 1.8, height - 3, id === "desk-standing" || id === "desk-gaming" ? "shade" : "wood", 2.5);
      cylinder("Brass foot", [x + sx * (w / 2 - 3), 1.2, z + sz * (d / 2 - 3)], 2.1, 2.4, "gold");
    }
  }
  if (["desk-executive", "desk-reception"].includes(id)) {
    box("Front panel", [0, height / 2, -depth / 2 + 3], [width - 8, height - 7, 3], "main");
    for (let x = -width / 2 + 10; x < width / 2 - 6; x += 8) box("Fluted panel", [x, height / 2, -depth / 2 + 1.3], [1.5, height - 10, 0.5], "light");
  }
  if (id === "desk-reception") box("Reception ledge", [0, height + 12, -depth / 2 + 8], [width, 3, 16], "wood");
  if (id === "desk-compact") {
    roundedBox("Writing desk drawer", [0, height - 5, 0], [width - 8, 6, depth - 4], "wood");
    box("Writing drawer front", [0, height - 5, depth / 2 - 1], [width - 9, 5, 1], "main");
    box("Writing drawer pull", [0, height - 4.5, depth / 2 - 0.2], [12, 1, 1], "gold");
    box("Writing blotter", [-3, height + 1.6, 1], [width - 19, 0.2, depth - 11], "shade");
    for (const x of [-width / 2 + 7, width / 2 - 7]) box("Writing desk side stretcher", [x, 9, 0], [2, 2, depth - 5], "wood");
  }
  if (["desk-straight", "desk-executive", "desk-atelier"].includes(id)) {
    box("Drawer", [width / 2 - 17, height - 8, 0], [25, 8, depth - 7], "main");
    box("Drawer pull", [width / 2 - 17, height - 8, depth / 2 - 2.8], [9, 1.3, 1], "gold");
  }
  if (id === "desk-gaming") {
    box("Desk mat", [0, height + 1.6, 2], [width - 15, 0.3, depth - 13], "ink");
    box("Luminous trim", [0, height - 0.6, depth / 2], [width - 5, 1.1, 0.3], "pink");
    for (const x of [-width / 2 + 6, width / 2 - 6]) box("Mat light edge", [x, height + 1.79, 2], [1, 0.1, depth - 15], "water");
    for (const x of [-width / 2 + 4, width / 2 - 4]) box("Steel foot", [x, 2, 0], [6, 4, depth - 4], "shade");
  }
  if (id === "desk-standing") {
    for (const x of [-width / 2 + 4, width / 2 - 4]) {
      box("Lift column", [x, 20, 0], [5, 37, 6], "shade");
      box("Lift sleeve", [x, 32, 0], [3.6, 22, 4.5], "main");
      roundedBox("Standing desk foot", [x, 2, 0], [7, 4, depth - 2], "shade");
    }
    box("Height control", [width / 2 - 14, height - 2, depth / 2], [10, 3, 1.5], "ink");
    box("Control display", [width / 2 - 15, height - 1.8, depth / 2 + 0.8], [4, 1, 0.15], "water");
  }
  if (id === "desk-atelier") {
    for (let x = -width / 2 + 10; x < 8; x += 12) {
      box("Supply cubby", [x, height + 5, -depth / 2 + 6], [10, 8, 9], "wood");
      box("Cubby opening", [x, height + 5, -depth / 2 + 10.6], [7, 5, 0.2], "soil");
      box("Paper roll", [x, height + 5, -depth / 2 + 10.8], [3, 4, 0.2], "paper");
    }
  }
  if (id === "desk-drafting") {
    box("Drafting paper", [2, height + 1.5, 0], [width - 22, 0.25, depth - 14], "paper");
    for (const z of [-7, 7]) box("Plan outline", [3, height + 1.7, z], [width - 43, 0.1, 0.8], "water");
    for (const x of [-15, 18]) box("Plan outline", [x, height + 1.7, 0], [0.8, 0.1, 14], "water");
    box("Drafting ruler", [-width / 2 + 8, height + 1.5, 0], [3, 0.5, depth - 7], "wood");
    for (let z = -depth / 2 + 8; z < depth / 2 - 5; z += 4) box("Ruler tick", [-width / 2 + 8.5, height + 1.8, z], [1.6, 0.1, 0.6], "cream");
  }
  return { surfaceHeight: height + (["desk-gaming", "desk-drafting"].includes(id) ? 1.75 : 1.375) };
}

function buildTable(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, shape, surfaceGrain, THREE } = kit;
  const id = asset.id;
  const height = ["table-coffee", "table-side"].includes(id) ? 20 : 32;
  if (["table-round", "table-marble", "table-cafe"].includes(id)) {
    cylinder("Pedestal foot", [0, 1.5, 0], Math.min(width, depth) * 0.3, 3, "wood");
    cylinder("Pedestal", [0, height / 2, 0], 5, height - 3, "gold", 3.5);
    cylinder("Table edge", [0, height - 1, 0], width / 2 - 0.3, 3, "shade");
    cylinder("Tabletop", [0, height + 0.6, 0], width / 2 - 1, 0.6, id === "table-marble" ? "paper" : "light");
    shape("Inset rim", new THREE.TorusGeometry(width / 2 - 3.2, 0.32, 6, 64), [0, height + 0.92, 0], id === "table-marble" ? "gold" : "grain", [1, 1, 1], [90, 0, 0]);
    if (id !== "table-marble") surfaceGrain([0, height + 0.94, 0], width * 0.64, depth * 0.55);
    if (id === "table-round") {
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        kit.branch("Radial tabletop joint", [Math.cos(a) * width * 0.22, height + 1, Math.sin(a) * depth * 0.22], [Math.cos(a) * (width / 2 - 2), height + 1, Math.sin(a) * (depth / 2 - 2)], 0.25, "shade");
      }
      cylinder("Lazy Susan", [0, height + 1, 0], width * 0.22, 0.15, "main");
      cylinder("Lazy Susan face", [0, height + 1.1, 0], width * 0.2, 0.1, "light");
      surfaceGrain([0, height + 1.2, 0], width * 0.27, depth * 0.27);
    }
    if (id === "table-marble") {
      const veins = [
        [[-0.82, -0.2], [-0.57, -0.13], [-0.4, 0.08], [-0.08, 0.13], [0.1, 0.36], [0.42, 0.46], [0.58, 0.66]],
        [[-0.4, 0.08], [-0.24, -0.12], [-0.28, -0.35], [-0.1, -0.58], [-0.12, -0.9]],
        [[0.1, 0.36], [0.29, 0.2], [0.5, 0.21], [0.76, 0.02]],
        [[0.2, -0.82], [0.36, -0.6], [0.32, -0.42], [0.53, -0.25], [0.88, -0.27]],
      ];
      for (const [index, points] of veins.entries()) {
        const positions = points.flatMap(([x, z], point) => {
          const spread = point === 0 || point === points.length - 1 ? 0.1 : index === 0 ? 0.5 : 0.3;
          return [x * width / 2 - spread, 0, z * depth / 2, x * width / 2 + spread, 0, z * depth / 2];
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(points.slice(1).flatMap((_, point) => [point * 2, point * 2 + 1, point * 2 + 2, point * 2 + 1, point * 2 + 3, point * 2 + 2]));
        geometry.computeVertexNormals();
        shape("Branching marble vein", geometry, [0, height + 0.93, 0], index === 0 ? "main" : "light");
      }
    }
  } else {
    roundedBox("Tabletop edge", [0, height, 0], [width - 0.5, 3, depth - 0.5], "main");
    roundedBox("Inlaid top", [0, height + 1.6, 0], [width - 5, 0.3, depth - 5], "light");
    surfaceGrain([0, height + 1.8, 0], width - 10, depth - 10);
    for (const x of [-width / 2 + 4, width / 2 - 4]) {
      if (id === "table-picnic" || id === "table-workbench") {
        box("Trestle", [x, height / 2, 0], [4, height - 2, depth - 4], "wood");
        box("Trestle foot", [x, 1.5, 0], [7, 3, depth - 0.6], "shade");
      } else for (const z of [-depth / 2 + 3, depth / 2 - 3]) cylinder("Table leg", [x, height / 2, z], 2.6, height - 2, "wood", 1.8);
    }
    if (id === "table-workbench") box("Lower shelf", [0, 9, 0], [width - 9, 2, depth - 7], "wood");
    if (id === "table-coffee") {
      box("Coffee table lower shelf", [0, 7, 0], [width - 6, 2, depth - 5], "wood");
      for (let x = -width / 2 + 5; x < width / 2 - 2; x += 5) box("Cane tabletop weave", [x, height + 1.9, 0], [1, 0.1, depth - 9], "grain");
      for (let z = -depth / 2 + 5; z < depth / 2 - 2; z += 5) box("Cane cross weave", [0, height + 2, z], [width - 9, 0.1, 0.55], "shade");
    }
    if (id === "table-side") {
      for (const x of [-width / 2 + 2, width / 2 - 2]) box("Side table cubby cheek", [x, 10, 0], [3, 17, depth - 2], "main");
      box("Cubby lower shelf", [0, 3, 0], [width - 1, 2, depth - 1], "light");
      box("Cubby back", [0, 10, -depth / 2 + 1], [width - 2, 17, 2], "wood");
    }
    for (let x = -width / 2 + 24; x < width / 2 - 10; x += 32) box("Wood joint", [x, height + 1.8, 0], [0.5, 0.1, depth - 7], "grain");
  }
  return { surfaceHeight: height + (id === "table-round" ? 1.2 : id === "table-coffee" ? 2.1 : ["table-marble", "table-cafe"].includes(id) ? 0.9 : 1.75) };
}

function buildSeating(kit, asset, width, depth) {
  const { box, roundedBox, ellipsoid, cylinder, branch, shape, THREE } = kit;
  const id = asset.id;
  const cushion = id === "chair-beanbag" ? 9 : id === "chair-stool" ? 24 : 17;
  if (id === "chair-beanbag" || id === "chair-ottoman") {
    ellipsoid("Upholstered base", [0, cushion * 0.65, 0], [width / 2 - 0.4, cushion * 0.65, depth / 2 - 0.4], "main");
    if (id === "chair-beanbag") ellipsoid("Slouching back", [0, 17, -depth * 0.14], [width * 0.4, 16, depth * 0.3], "main", [-12, 0, 0]);
    ellipsoid("Soft seat well", [0, cushion, depth * 0.1], [width * 0.37, 2.5, depth * 0.31], "light");
    shape("Cushion welt", new THREE.TorusGeometry(1, 0.025, 6, 64), [0, cushion + 0.5, depth * 0.1], "stitch", [width * 0.365, depth * 0.3, 8], [90, 0, 0]);
    if (id === "chair-ottoman") {
      for (const turn of [0, 90]) box("Quilt seam", [0, cushion + 2.35, depth * 0.1], [width * 0.53, 0.1, 0.45], "grain", [0, turn, 0]);
      ellipsoid("Upholstery button", [0, cushion + 2.55, depth * 0.1], [1.1, 0.3, 1.1], "stitch");
    }
    return { seatHeight: cushion, seatHasBack: id === "chair-beanbag" };
  }
  const corner = id === "sofa-corner";
  const segments = corner ? [[-16, -32, 64, 32], [32, 0, 32, 96]] : [[0, 0, width, depth]];
  for (const [cx, cz, w, d] of segments) {
    roundedBox("Seat frame", [cx, cushion - 5, cz], [w - 1, 5, d - 1], id === "outdoor-bench" ? "wood" : "shade");
    if (id !== "chair-office") for (const x of [-w / 2 + 3, w / 2 - 3]) for (const z of [-d / 2 + 3, d / 2 - 3]) cylinder("Foot", [cx + x, (cushion - 8) / 2, cz + z], 1.8, cushion - 8, "wood", 2.3);
    if (id === "outdoor-bench") {
      for (let z = -d / 2 + 3; z < d / 2; z += 6) {
        box("Seat slat", [cx, cushion - 1, cz + z], [w - 2, 2, 4.6], "main");
        box("Slat edge", [cx, cushion + 0.05, cz + z + 1.8], [w - 3, 0.1, 0.6], "shade");
      }
      for (const y of [cushion + 7, cushion + 14, cushion + 21]) {
        box("Back slat", [cx, y, cz - d / 2 + 2], [w, 4.8, 2], "main");
        box("Back slat edge", [cx, y + 2.45, cz - d / 2 + 2], [w - 1, 0.1, 1.5], "shade");
      }
    } else {
      const longwise = corner && d > w;
      const count = asset.kind === "chair" ? 1 : Math.max(1, Math.round((longwise ? d : w) / 32));
      for (let i = 0; i < count; i++) {
        const offset = ((i + 0.5) / count - 0.5) * (longwise ? d : w);
        const x = cx + (longwise ? 0 : offset), z = cz + (longwise ? offset : 1);
        const halfWidth = (longwise ? w - 4 : w / count - 1.5) / 2, halfDepth = (longwise ? d / count - 1.5 : d - 5) / 2;
        roundedBox("Soft seat cushion", [x, cushion - 1, z], [halfWidth * 2, 5, halfDepth * 2], "light");
        const corners = [[x - halfWidth + 1, cushion + 1.55, z - halfDepth + 1], [x + halfWidth - 1, cushion + 1.55, z - halfDepth + 1], [x + halfWidth - 1, cushion + 1.55, z + halfDepth - 1], [x - halfWidth + 1, cushion + 1.55, z + halfDepth - 1]];
        corners.forEach((corner, index) => branch("Cushion piping", corner, corners[(index + 1) % corners.length], 0.3, "grain"));
      }
      if (id !== "chair-stool") {
        roundedBox("Padded back", [cx + (longwise ? w / 2 - 3 : 0), cushion + 10, cz + (longwise ? 0 : -d / 2 + 3)], [longwise ? 5 : w - 1, 20, longwise ? d - 1 : 5], "main");
        for (let index = 0; index < count; index++) {
          const offset = ((index + 0.5) / count - 0.5) * (longwise ? d : w);
          roundedBox("Plush back pad", [cx + (longwise ? w / 2 - 5.3 : offset), cushion + 9.5, cz + (longwise ? offset : -d / 2 + 5.3)], [longwise ? 5 : w / count - 3, 15, longwise ? d / count - 3 : 5], "light");
          if (id === "sofa-velvet") ellipsoid("Tufted center", [cx + offset, cushion + 10, cz - d / 2 + 8], [1.4, 1.4, 0.3], "stitch");
        }
        for (const side of [-1, 1]) {
          const edge = longwise ? d / 2 - 2 : w / 2 - 2;
          const point = (offset, y) => longwise ? [cx + w / 2 - 3 + side * 2.35, y, cz + offset] : [cx + offset, y, cz - d / 2 + 3 + side * 2.35];
          branch("Back top piping", point(-edge, cushion + 19), point(edge, cushion + 19), 0.42, "stitch");
          for (const offset of [-edge, edge]) branch("Back side piping", point(offset, cushion + 2), point(offset, cushion + 19), 0.35, "stitch");
        }
        if (id === "sofa-velvet") for (let x = -w / 2 + 10; x < w / 2; x += 13) for (const y of [cushion + 6, cushion + 17]) ellipsoid("Tuft button", [cx + x, y, cz - d / 2 + 5.9], [0.9, 0.9, 0.4], "gold");
      }
    }
  }
  if (["chair-lounge", "sofa-straight", "sofa-loveseat", "sofa-velvet", "chair-office"].includes(id)) for (const x of [-width / 2 + 2, width / 2 - 2]) {
    roundedBox("Armrest", [x, cushion + 5, 0], [4, 10, depth - 1], "main");
    branch("Armrest piping", [x, cushion + 9.8, -depth / 2 + 2], [x, cushion + 9.8, depth / 2 - 2], 0.35, "stitch");
  }
  if (id === "chair-office") {
    cylinder("Gas lift", [0, 7, 0], 2.2, 9, "shade");
    for (let index = 0; index < 5; index++) {
      const turn = index * Math.PI * 2 / 5;
      const x = Math.cos(turn) * (width / 2 - 3), z = Math.sin(turn) * (depth / 2 - 3);
      branch("Caster spoke", [0, 4, 0], [x, 2.2, z], 1.2, "shade");
      cylinder("Caster", [x, 1.7, z], 1.7, 2.5, "ink", 1.7, [90, 0, 0]);
    }
  }
  return { seatHeight: cushion, seatHasBack: id !== "chair-stool" };
}

module.exports = { buildDesk, buildTable, buildSeating };
