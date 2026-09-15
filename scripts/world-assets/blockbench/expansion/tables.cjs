const { expansionLegs, expansionTop, expansionDrawers, expansionRing } = require("./joinery.cjs");

const expandedTables = {
  "table-kotatsu": "kotatsu", "table-nesting": "nesting", "table-trunk": "trunk", "table-drum": "drum",
  "table-hairpin": "hairpin", "table-glass": "glass", "table-oval": "oval", "table-crossbase": "crossbase",
  "table-bistro": "bistro", "table-tile": "tile", "table-bar": "bar", "table-console": "console",
  "table-cantilever": "cantilever", "table-lift": "lift", "table-drafting": "drafting", "table-folding": "folding",
  "table-slab": "slab", "table-cable-spool": "spool", "table-pedestal-square": "pedestal", "table-tea-tray": "tray", "table-display": "display",
};

function buildExpandedTable(kit, asset, width, depth) {
  const style = expandedTables[asset.id];
  const { box, roundedBox, cylinder, branch, shape, surfaceGrain, THREE } = kit;
  const low = ["kotatsu", "nesting", "trunk", "drum", "glass", "cantilever", "lift", "tray", "display"].includes(style);
  const height = style === "bar" ? 45 : low ? 20 : 33;
  const round = ["drum", "bistro", "crossbase", "spool"].includes(style);
  if (style === "nesting") {
    for (const [x, w, d, h] of [[-16, 48, depth, 23], [24, 32, depth - 8, 15]]) {
      roundedBox("Nesting table top", [x, h, 0], [w - 1, 3, d - 1], "light");
      for (const side of [-1, 1]) for (const z of [-d / 2 + 3, d / 2 - 3]) cylinder("Nesting table leg", [x + side * (w / 2 - 3), h / 2, z], 1.3, h - 1, "gold");
      surfaceGrain([x, h + 1.55, 0], w - 8, d - 8);
    }
    return { surfaceHeight: 24.5 };
  }
  if (style === "kotatsu") {
    const quiltHeight = (x, z) => 3 + 14 * Math.min(1, (width / 2 - Math.abs(x)) / 9, (depth / 2 - Math.abs(z)) / 9);
    const positions = [];
    for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      const points = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]].map(([x, z]) => {
        const px = (x / 16 - 0.5) * (width - 1), pz = (z / 16 - 0.5) * (depth - 1);
        return [px, quiltHeight(px, pz) + Math.cos(px * 0.4) * Math.cos(pz * 0.4) * 0.35, pz];
      });
      positions.push(...[0, 2, 1, 0, 3, 2].flatMap(index => points[index]));
    }
    const quilt = new THREE.BufferGeometry();
    quilt.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    quilt.computeVertexNormals();
    shape("Soft draped kotatsu quilt", quilt, [0, 0, 0], "light");
    for (let stripe = -24; stripe <= 24; stripe += 12) for (let step = -30; step < 30; step += 3) {
      branch("Quilt woven stripe", [stripe, quiltHeight(stripe, step) + 0.45, step], [stripe, quiltHeight(stripe, step + 3) + 0.45, step + 3], 0.5, "main");
      branch("Quilt cross stripe", [step, quiltHeight(step, stripe) + 0.45, stripe], [step + 3, quiltHeight(step + 3, stripe) + 0.45, stripe], 0.5, "main");
    }
    expansionTop(kit, width - 16, depth - 16, height, "rectangle", "wood");
  } else if (style === "lift") {
    roundedBox("Raised tabletop edge", [0, height + 8, -8], [width - 0.5, 3, depth - 16], "main");
    roundedBox("Raised tabletop face", [0, height + 9.65, -8], [width - 3, 0.4, depth - 18], "light");
    surfaceGrain([0, height + 9.9, -8], width - 9, depth - 24);
  } else expansionTop(kit, width, depth, height, round ? "round" : style === "oval" ? "oval" : "rectangle", ["glass", "display"].includes(style) ? "waterLight" : "light");
  if (style === "trunk") {
    roundedBox("Travel trunk", [0, 9, 0], [width - 2, 18, depth - 2], "main");
    for (const x of [-width / 3, width / 3]) {
      box("Leather strap", [x, height + 1.1, 0], [4, 0.3, depth - 2], "shade");
      box("Strap down front", [x, 10, depth / 2 - 0.7], [4, 18, 0.5], "shade");
      box("Trunk clasp", [x, 13, depth / 2 - 0.2], [5.5, 5, 0.9], "gold");
    }
  } else if (style === "drum") {
    cylinder("Fluted drum core", [0, 9, 0], width / 2 - 3, 18, "main");
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI / 14;
      cylinder("Timber flute", [Math.cos(angle) * (width / 2 - 3), 10, Math.sin(angle) * (depth / 2 - 3)], 1, 17, "wood");
    }
  } else if (["oval", "bistro", "pedestal", "spool"].includes(style)) {
    const locations = style === "oval" ? [-width / 4, width / 4] : [0];
    for (const x of locations) {
      cylinder("Pedestal foot", [x, 1.5, 0], Math.min(width / locations.length, depth) * 0.34, 3, "shade");
      cylinder("Table pedestal", [x, height / 2, 0], style === "spool" ? width / 4 : 4, height - 3, style === "spool" ? "wood" : "gold", style === "bistro" ? 3 : style === "spool" ? width / 4 : 4);
    }
    if (style === "spool") {
      cylinder("Spool bottom flange", [0, 2, 0], width / 2 - 1, 4, "main");
      for (const x of [-width / 4, width / 4]) for (const z of [-depth / 4, depth / 4]) cylinder("Recessed spool bolt", [x, height + 1.1, z], 1.6, 0.2, "shade");
      cylinder("Cable eye", [0, height + 1.1, 0], 3, 0.3, "shade");
    }
  } else if (style === "crossbase" || style === "folding") {
    for (const z of [-depth / 3, depth / 3]) for (const side of [-1, 1]) branch("Crossed table brace", [side * width * 0.35, 2, z], [-side * width * 0.3, height - 3, z], 2, style === "folding" ? "shade" : "wood");
    box("Cross-frame stretcher", [0, height / 2, 0], [3, 3, depth * 0.72], "gold");
  } else if (style === "cantilever") {
    roundedBox("C-table foot", [0, 1.5, 0], [width - 1, 3, depth - 1], "main");
    box("Cantilever spine", [0, height / 2, -depth / 2 + 2], [width - 2, height, 3], "shade");
  } else if (style === "display") {
    roundedBox("Display box", [0, height - 6, 0], [width - 2, 9, depth - 2], "main");
    roundedBox("Glazed display inset", [0, height + 1.1, 0], [width - 9, 0.2, depth - 9], "ink");
    for (const x of [-width / 4, 0, width / 4]) {
      cylinder("Display coin", [x, height + 1.35, 0], 4, 0.15, "gold");
      expansionRing(kit, "Coin engraving", [x, height + 1.5, 0], 2.5, 0.2, "cream");
    }
    branch("Glass reflection", [-width / 3, height + 1.7, -depth / 3], [width / 4, height + 1.7, depth / 3], 0.6, "waterLight");
    expansionLegs(kit, width - 3, depth - 3, 13, "hairpin");
  } else if (style === "lift") {
    roundedBox("Lift table storage well", [0, 13, 0], [width - 2, 11, depth - 2], "main");
    box("Open storage compartment", [0, 18.6, 0], [width - 9, 0.2, depth - 9], "shade");
    for (const x of [-width / 2 + 7, width / 2 - 7]) for (const z of [-depth / 4, depth / 4]) branch("Lift hinge", [x, 16, z - 6], [x, height + 7, z + 6], 1, "gold");
    expansionLegs(kit, width, depth, 8);
  } else if (style !== "kotatsu") expansionLegs(kit, width, depth, height - 3, style === "hairpin" ? "hairpin" : ["glass", "slab", "tile"].includes(style) ? "sled" : style === "drafting" ? "trestle" : "tapered");
  if (style === "tile") {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) box("Glazed tabletop tile", [((col + 0.5) / 4 - 0.5) * (width - 6), height + 1.1, ((row + 0.5) / 4 - 0.5) * (depth - 6)], [(width - 6) / 4 - 0.8, 0.3, (depth - 6) / 4 - 0.8], (row + col) % 2 ? "main" : "cream");
  } else if (style === "bistro") {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      kit.ellipsoid("Bistro floral inlay", [Math.cos(angle) * 7, height + 1.15, Math.sin(angle) * 7], [2, 0.1, 5], i % 2 ? "main" : "cream", [0, 90 - i * 45, 0]);
    }
    cylinder("Floral center", [0, height + 1.3, 0], 3, 0.1, "gold");
  } else if (style === "console") {
    box("Console lower shelf", [0, 9, 0], [width - 8, 2, depth - 6], "wood");
    expansionDrawers(kit, 0, 0, width - 10, depth - 6, 9, 1);
    box("Console apron", [0, height - 5, 0], [width - 5, 6, depth - 5], "main");
    for (const x of [-width / 4, width / 4]) box("Console drawer grip", [x, height - 5, depth / 2 - 2], [8, 1.3, 1], "gold");
  } else if (style === "bar") {
    for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Bar foot rail", [0, 13, z], [width - 9, 2, 2], "gold");
  } else if (style === "drafting") {
    for (const x of [-width / 2 + 5, width / 2 - 5]) {
      cylinder("Angle adjustment wheel", [x, height - 6, 0], 4, 1.5, "gold", 4, [0, 0, 90]);
      box("Adjustable support mast", [x, height - 10, 0], [4, 24, 4], "wood");
    }
    box("Parallel rule", [0, height + 1.8, -depth / 2 + 9], [width - 8, 1, 3], "paper");
    for (let x = -width / 2 + 8; x < width / 2; x += 6) box("Rule marking", [x, height + 2.4, -depth / 2 + 9], [0.5, 0.1, 2], "shade");
  } else if (style === "slab") {
    for (const side of [-1, 1]) for (let x = -width / 2 + 4; x < width / 2; x += 7) roundedBox("Natural bark edge", [x, height - 0.6, side * (depth / 2 - 1.5)], [8, 3.8, 2.2 + Math.sin(x) * 0.8], "wood");
    for (const x of [-width / 4, width / 5]) expansionRing(kit, "Wood knot", [x, height + 1.1, 0], 2.6, 0.3, "shade");
  } else if (style === "tray") {
    for (const x of [-width / 2 + 2, width / 2 - 2]) box("Tray handle end", [x, height + 3, 0], [2, 5, depth - 2], "main");
    for (const z of [-depth / 2 + 2, depth / 2 - 2]) box("Tray rim", [0, height + 2, z], [width - 2, 3, 2], "wood");
  } else if (style === "glass") {
    box("Glass lower shelf", [0, 7, 0], [width - 7, 1, depth - 7], "water");
  }
  return { surfaceHeight: height + (style === "lift" ? 10 : style === "display" ? 1.7 : style === "tile" ? 1.3 : 1.1) };
}

module.exports = { expandedTables, buildExpandedTable };
