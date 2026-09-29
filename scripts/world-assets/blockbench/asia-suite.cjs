const asiaDesigns = {
  desks: ["asia-scholar-desk", "asia-bamboo-workstation", "asia-lacquer-console", "asia-carved-drafting-desk"],
  seating: ["asia-zaisu-chair", "asia-woven-stool", "asia-palace-bench", "asia-silk-daybed"],
  tables: ["asia-chabudai", "asia-dim-sum-table", "asia-go-table", "asia-banquet-table"],
  plants: ["asia-bamboo-cluster", "asia-bonsai", "asia-lotus-planter", "asia-orchid"],
  outdoor: ["asia-stone-pagoda", "asia-moon-gate", "asia-koi-pond", "asia-torii-gate"],
  decor: ["asia-folding-fan", "asia-celadon-vase", "asia-origami-cranes", "asia-ink-scroll"],
  equipment: ["asia-go-stand", "asia-mahjong-cabinet", "asia-calligraphy-easel", "asia-astrolabe"],
  "floor-types": ["asia-bamboo-floor", "asia-star-tile", "asia-jade-mosaic", "asia-clay-brick"],
  "floor-decorations": ["asia-prayer-rug", "asia-silk-runner", "asia-mandala-rug", "asia-indigo-rug"],
  storage: ["asia-tansu-chest", "asia-bamboo-shelves", "asia-lacquer-trunk", "asia-jar-stand"],
  lighting: ["asia-standing-lantern", "asia-lotus-lamp", "asia-star-lantern", "asia-pagoda-lantern"],
  breakroom: ["asia-tea-station", "asia-rice-cooker", "asia-spice-counter", "asia-water-urn"],
  food: ["asia-mooncakes", "asia-dumplings", "asia-mango-rice", "asia-curry-bowl"],
  infrastructure: ["asia-shoji-divider", "asia-bamboo-screen", "asia-carved-gate", "asia-wayfinding-pillar"],
};

function buildAsiaDesk(kit, style, width, depth) {
  const { box, cylinder, roundedBox, branch } = kit;
  const height = style === 1 ? 42 : style === 3 ? 37 : 31;
  roundedBox("Writing surface", [0, height, 0], [width - 2, 3, depth - 2], style === 2 ? "shade" : "main");
  box("Inset writing field", [0, height + 1.55, 0], [width - 10, 0.2, depth - 9], "light");
  for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) {
    if (style === 1) cylinder("Bamboo support", [x, height / 2, z], 2, height - 3, "wood");
    else box("Desk leg", [x, height / 2, z], [3, height - 3, 3], style === 2 ? "shade" : "wood");
  }
  if (style === 0) {
    box("Scholar drawer", [0, height - 5, depth / 2 - 3], [width - 14, 6, 5], "wood");
    box("Drawer pull", [0, height - 5, depth / 2 - 0.2], [9, 1, 1], "gold");
    box("Inkstone", [-width / 2 + 10, height + 1.8, -depth / 2 + 8], [8, 1, 6], "ink");
    branch("Brush", [width / 2 - 18, height + 2, 0], [width / 2 - 2, height + 2, 8], 0.5, "wood");
  } else if (style === 1) {
    for (const x of [-width / 2 + 7, width / 2 - 7]) {
      box("Bamboo rail", [x, 13, 0], [2, 2, depth - 7], "wood");
      cylinder("Desk joint", [x, 22, 0], 2.8, 2, "gold");
    }
    box("Raised monitor shelf", [0, height + 7, -depth / 2 + 7], [width - 10, 2, 10], "wood");
    for (const x of [-width / 2 + 9, width / 2 - 9]) box("Shelf block", [x, height + 4, -depth / 2 + 7], [3, 6, 8], "shade");
  } else if (style === 2) {
    box("Lacquer front", [0, height / 2, -depth / 2 + 2], [width - 10, height - 8, 3], "main");
    for (let x = -width / 2 + 13; x < width / 2 - 8; x += 16) box("Gold fretwork", [x, height / 2, -depth / 2 + 0.3], [1, height - 13, 0.5], "gold");
    box("Desk rail", [0, 7, depth / 2 - 4], [width - 12, 2, 2], "gold");
  } else {
    box("Drafting board", [0, height + 3, -5], [width - 16, 1, depth - 17], "paper", [-14, 0, 0]);
    for (let x = -width / 2 + 11; x < width / 2 - 7; x += 12) box("Carved apron panel", [x, height - 5, depth / 2 - 2], [7, 4, 1], "gold");
    box("Architect ruler", [0, height + 2, depth / 2 - 6], [width - 20, 0.4, 2], "wood");
  }
  return { surfaceHeight: height + 1.7 };
}

function buildAsiaSeating(kit, style, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid } = kit;
  const height = style === 0 ? 8 : style === 1 ? 23 : 18;
  if (style === 1) {
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) cylinder("Stool leg", [x, height / 2, z], 1.5, height, "wood");
    roundedBox("Woven stool seat", [0, height, 0], [width - 2, 3, depth - 2], "straw");
    for (let x = -width / 2 + 3; x < width / 2 - 2; x += 4) box("Cane weave", [x, height + 1.6, 0], [0.7, 0.2, depth - 5], "main");
  } else {
    roundedBox("Seat frame", [0, height - 3, 0], [width - 1, 5, depth - 1], "wood");
    roundedBox("Seat cushion", [0, height, 1], [width - 4, 3, depth - 6], style === 3 ? "pink" : "main");
    if (style === 0) {
      box("Zaisu back", [0, height + 13, -depth / 2 + 3], [width - 4, 25, 4], "main", [-9, 0, 0]);
      box("Back piping", [0, height + 22, -depth / 2 + 5], [width - 8, 1, 1], "gold");
    } else {
      for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) box("Seat foot", [x, 6, z], [4, 12, 4], "wood");
      box("Carved back rail", [0, height + 16, -depth / 2 + 3], [width - 3, 5, 4], "wood");
      for (let x = -width / 2 + 8; x < width / 2 - 4; x += 11) box("Back spindle", [x, height + 10, -depth / 2 + 3], [2, 15, 2], style === 3 ? "gold" : "main");
      if (style === 3) for (let x = -width / 2 + 18; x < width / 2; x += 30) ellipsoid("Silk bolster", [x, height + 5, 1], [8, 4, 9], "light");
    }
  }
  return { seatHeight: height + 1.5, seatHasBack: style !== 1 };
}

function buildAsiaTable(kit, style, width, depth) {
  const { box, cylinder, roundedBox, shape, THREE } = kit;
  const height = style === 0 || style === 2 ? 18 : 30;
  if (style === 1) {
    cylinder("Round table foot", [0, 2, 0], 13, 4, "wood");
    cylinder("Table pedestal", [0, height / 2, 0], 5, height - 3, "wood");
    cylinder("Circular top", [0, height, 0], Math.min(width, depth) / 2 - 2, 3, "main");
    cylinder("Lazy Susan", [0, height + 2, 0], Math.min(width, depth) / 3, 1, "light");
    shape("Table rim", new THREE.TorusGeometry(Math.min(width, depth) / 2 - 5, 0.6, 6, 40), [0, height + 2, 0], "gold", [1, 1, 1], [90, 0, 0]);
  } else {
    roundedBox("Tabletop", [0, height, 0], [width - 2, 3, depth - 2], style === 3 ? "shade" : "wood");
    box("Inlaid panel", [0, height + 1.6, 0], [width - 10, 0.2, depth - 10], style === 2 ? "light" : "main");
    for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 6, depth / 2 - 6]) box("Table leg", [x, height / 2, z], [4, height - 2, 4], "wood");
    if (style === 0) for (const z of [-depth / 2 + 6, depth / 2 - 6]) box("Low crossbar", [0, 7, z], [width - 13, 2, 2], "shade");
    if (style === 2) {
      for (let x = -width / 2 + 8; x < width / 2 - 3; x += 5) box("Go grid vertical", [x, height + 1.8, 0], [0.3, 0.1, depth - 12], "ink");
      for (let z = -depth / 2 + 8; z < depth / 2 - 3; z += 5) box("Go grid horizontal", [0, height + 1.8, z], [width - 12, 0.1, 0.3], "ink");
      for (const [x, z] of [[-11, -8], [8, 2], [2, 11]]) cylinder("Go stone", [x, height + 2, z], 2, 0.6, x < 0 ? "ink" : "paper");
    }
    if (style === 3) for (let x = -width / 2 + 11; x < width / 2 - 5; x += 15) box("Banquet motif", [x, height + 1.8, 0], [6, 0.2, 6], "gold", [0, 45, 0]);
  }
  return { surfaceHeight: height + (style === 1 ? 2.5 : 1.7) };
}

function buildAsiaPlant(kit, style, width, depth) {
  const { box, cylinder, ellipsoid, branch } = kit;
  const radius = Math.min(width, depth) * 0.25;
  cylinder("Glazed planter", [0, 6, 0], radius, 12, style === 0 ? "wood" : "main", radius * 1.12);
  cylinder("Soil", [0, 12.2, 0], radius * 0.86, 0.5, style === 2 ? "water" : "soil");
  if (style === 0) {
    for (const x of [-10, 0, 10]) {
      branch("Bamboo culm", [x, 12, 0], [x + 2, 61, 0], 1.4, "green");
      for (const y of [30, 44, 58]) {
        box("Bamboo node", [x + y / 32, y, 0], [4, 1, 4], "gold");
        ellipsoid("Bamboo leaf", [x + 8, y + 3, 2], [11, 2, 3], "leafDark", [0, 0, -18]);
      }
    }
  } else if (style === 1) {
    branch("Bonsai trunk", [0, 12, 0], [2, 28, 0], 2.5, "wood");
    for (const [x, y, z] of [[-10, 31, 0], [7, 36, -3], [2, 43, 2]]) {
      branch("Bonsai bough", [2, 28, 0], [x, y, z], 1.3, "wood");
      ellipsoid("Bonsai canopy", [x, y + 2, z], [10, 4, 7], "green");
    }
  } else if (style === 2) {
    cylinder("Lotus pool", [0, 13, 0], radius * 0.8, 1, "water");
    for (const [x, z] of [[-9, -5], [7, 3], [0, 9]]) {
      ellipsoid("Floating lotus leaf", [x, 14, z], [7, 0.7, 6], "green");
      ellipsoid("Lotus bloom", [x, 18, z], [4, 4, 4], "pink");
      ellipsoid("Lotus center", [x, 21, z], [1.5, 1, 1.5], "gold");
    }
  } else {
    for (const x of [-7, 0, 7]) {
      branch("Orchid stem", [x, 12, 0], [x + 3, 43 + x / 3, 0], 0.8, "green");
      for (const y of [30, 41]) {
        ellipsoid("Orchid petal", [x + 3, y, 0], [4, 3, 2], "pink");
        ellipsoid("Orchid heart", [x + 3, y, 2], [1, 1, 1], "gold");
      }
    }
  }
}

function buildAsiaOutdoor(kit, style, width, depth) {
  const { box, cylinder, ellipsoid, shape, THREE } = kit;
  if (style === 0) {
    for (let level = 0; level < 3; level++) {
      const y = 6 + level * 16;
      box("Pagoda tier", [0, y, 0], [width - level * 10 - 5, 4, depth - level * 10 - 5], "stone");
      box("Pagoda chamber", [0, y + 7, 0], [width - level * 12 - 15, 10, depth - level * 12 - 15], "stoneLight");
      box("Upturned roof", [0, y + 13, 0], [width - level * 9, 3, depth - level * 9], "shade");
    }
    cylinder("Pagoda finial", [0, 56, 0], 3, 8, "gold", 1);
  } else if (style === 1) {
    for (const x of [-width / 2 + 5, width / 2 - 5]) box("Moon gate pier", [x, 32, 0], [10, 64, depth - 4], "stone");
    shape("Moon gate arch", new THREE.TorusGeometry(width * 0.31, 4, 8, 40), [0, 34, depth / 2 - 4], "stoneLight");
    box("Moon gate lintel", [0, 70, 0], [width - 4, 5, 8], "shade");
    for (const x of [-width / 2 + 8, width / 2 - 8]) box("Carved inset", [x, 36, depth / 2], [3, 38, 1], "gold");
  } else if (style === 2) {
    box("Stone pond rim", [0, 3, 0], [width - 3, 6, depth - 3], "main");
    box("Pond water", [0, 6.2, 0], [width - 14, 0.3, depth - 14], "water");
    for (const [x, z, color] of [[-22, -10, "pink"], [15, 7, "gold"], [25, -12, "paper"]]) {
      ellipsoid("Koi body", [x, 7, z], [9, 1.5, 4], color);
      box("Koi tail", [x - 10, 7, z], [5, 0.4, 6], color, [0, 45, 0]);
    }
    for (const x of [-width / 2 + 5, width / 2 - 5]) box("Pond edge", [x, 6.5, 0], [7, 2, depth - 2], "light");
  } else {
    for (const x of [-width / 2 + 9, width / 2 - 9]) {
      cylinder("Torii pillar", [x, 37, 0], 3.8, 74, "main");
      cylinder("Stone shoe", [x, 3, 0], 6, 6, "stone");
    }
    box("Torii upper beam", [0, 76, 0], [width - 2, 8, 10], "shade");
    box("Torii lower beam", [0, 63, 0], [width - 15, 4, 6], "main");
    box("Torii plaque", [0, 69, depth / 2 + 0.5], [13, 12, 1], "gold");
  }
}

function buildAsiaDecor(kit, style, width, depth) {
  const { box, cylinder, ellipsoid, branch } = kit;
  if (style === 0) {
    for (let index = 0; index < 9; index++) {
      const angle = -75 + index * 19;
      const x = Math.sin(angle * Math.PI / 180) * 15;
      const y = Math.cos(angle * Math.PI / 180) * 14;
      branch("Fan rib", [0, 2, 0], [x, 4 + y, 0], 0.5, "wood");
      ellipsoid("Fan leaf", [x * 0.78, 4 + y * 0.78, 0], [3, 4, 0.6], index % 2 ? "light" : "main");
    }
    cylinder("Fan pivot", [0, 2, 0], 2, 2, "gold");
  } else if (style === 1) {
    cylinder("Vase foot", [0, 2, 0], 7, 4, "shade");
    cylinder("Celadon body", [0, 13, 0], 9, 20, "main", 5);
    cylinder("Vase lip", [0, 25, 0], 6, 3, "gold");
    for (const y of [8, 15, 21]) shapeRing(kit, 8.5 - y / 10, y, "light");
  } else if (style === 2) {
    for (const [x, y, z] of [[-8, 9, -3], [6, 13, 3], [0, 6, 7]]) {
      ellipsoid("Paper crane body", [x, y, z], [4, 3, 3], "paper");
      box("Folded wing", [x - 4, y + 3, z], [8, 0.4, 6], "main", [0, 0, 28]);
      box("Folded wing", [x + 4, y + 3, z], [8, 0.4, 6], "light", [0, 0, -28]);
      branch("Crane neck", [x, y, z], [x + 2, y + 8, z], 0.5, "paper");
    }
  } else {
    cylinder("Scroll roller", [0, 3, -depth / 2 + 3], 2, width - 3, "wood", 2, [0, 0, 90]);
    box("Silk scroll backing", [0, 2, 0], [width - 7, 0.5, depth - 4], "main");
    box("Unfurled paper", [0, 2.3, 0], [width - 13, 0.2, depth - 7], "paper");
    for (const [x, z] of [[-14, -3], [-2, 2], [11, -1]]) branch("Ink brush mark", [x - 3, 2.5, z - 2], [x + 4, 2.5, z + 3], 0.8, "ink");
    cylinder("Scroll roller", [0, 3, depth / 2 - 3], 2, width - 3, "wood", 2, [0, 0, 90]);
  }
}

function shapeRing(kit, radius, height, material) {
  kit.shape("Vessel band", new kit.THREE.TorusGeometry(radius, 0.35, 5, 24), [0, height, 0], material, [1, 1, 1], [90, 0, 0]);
}

function buildAsiaEquipment(kit, style, width, depth) {
  const { box, cylinder, branch, shape, THREE } = kit;
  if (style === 0) {
    box("Go table legs", [-width / 3, 12, 0], [4, 24, depth - 10], "wood");
    box("Go table legs", [width / 3, 12, 0], [4, 24, depth - 10], "wood");
    box("Go board", [0, 25, 0], [width - 4, 4, depth - 4], "main");
    for (let x = -width / 2 + 10; x < width / 2 - 3; x += 7) box("Go line", [x, 27.2, 0], [0.4, 0.1, depth - 12], "ink");
    for (let z = -depth / 2 + 10; z < depth / 2 - 3; z += 7) box("Go line", [0, 27.2, z], [width - 12, 0.1, 0.4], "ink");
    for (const [x, z] of [[-9, -8], [10, 5], [0, 12]]) cylinder("Go stone", [x, 28, z], 2.5, 1, x < 0 ? "ink" : "paper");
  } else if (style === 1) {
    box("Mahjong case", [0, 18, 0], [width - 3, 36, depth - 3], "shade");
    box("Game shelf", [0, 24, depth / 2], [width - 8, 3, 4], "wood");
    for (let x = -width / 2 + 8; x < width / 2 - 4; x += 10) {
      box("Mahjong tile", [x, 32, depth / 2 + 1], [8, 11, 2], "paper");
      box("Tile emblem", [x, 33, depth / 2 + 2.2], [3, 4, 0.4], x % 2 ? "main" : "ink");
    }
    box("Case drawer", [0, 9, depth / 2], [width - 11, 10, 2], "main");
  } else if (style === 2) {
    for (const x of [-width / 2 + 6, width / 2 - 6]) branch("Easel leg", [x, 1, depth / 2 - 3], [0, 57, -depth / 2 + 3], 2.5, "wood");
    box("Calligraphy frame", [0, 33, -1], [width - 10, 50, 2], "main", [-12, 0, 0]);
    box("Calligraphy sheet", [0, 33, 0], [width - 17, 43, 2], "paper", [-12, 0, 0]);
    for (const [x, y] of [[-12, 39], [0, 29], [10, 42]]) box("Ink stroke", [x, y, depth / 2], [3, 11, 0.5], "ink", [0, 0, 18]);
    box("Brush shelf", [0, 11, depth / 2 - 1], [width - 9, 3, 8], "wood");
  } else {
    cylinder("Astrolabe pedestal", [0, 17, 0], 5, 34, "wood");
    cylinder("Astrolabe foot", [0, 2, 0], 12, 4, "shade");
    for (const rotation of [[0, 0, 0], [0, 45, 0], [0, 90, 0]]) shape("Astrolabe ring", new THREE.TorusGeometry(17, 1.3, 7, 32), [0, 43, 0], "gold", [1, 1, 1], rotation);
    cylinder("Astrolabe pointer", [0, 43, 0], 2, 25, "ink", 2, [0, 0, 45]);
  }
}

function buildAsiaFloor(kit, style, width, depth) {
  const { box } = kit;
  box("Continuous tile backing", [0, -0.12, 0], [width + 8, 0.2, depth + 8], "main");
  if (style === 0) {
    for (let x = -width / 2 - 3; x < width / 2 + 3; x += 8) {
      box("Bamboo strip", [x, 0.02, 0], [7.2, 0.1, depth + 8], "light");
      for (let z = -depth / 2 - 3; z < depth / 2 + 3; z += 16) box("Bamboo node", [x, 0.09, z], [7.2, 0.1, 0.6], "shade");
    }
  } else if (style === 1) {
    for (let x = -width / 2 - 8; x < width / 2 + 8; x += 16) for (let z = -depth / 2 - 8; z < depth / 2 + 8; z += 16) {
      box("Star tile", [x, 0.02, z], [14.8, 0.1, 14.8], "light");
      box("Star diamond", [x, 0.09, z], [8, 0.1, 8], "main", [0, 45, 0]);
      box("Star center", [x, 0.15, z], [3, 0.1, 3], "gold", [0, 45, 0]);
    }
  } else if (style === 2) {
    for (let x = -width / 2 - 4; x < width / 2 + 4; x += 8) for (let z = -depth / 2 - 4; z < depth / 2 + 4; z += 8) box("Mosaic tessera", [x, 0.03, z], [7.2, 0.1, 7.2], (Math.round(x / 8 + z / 8) % 3) ? "light" : "shade");
  } else {
    for (let z = -depth / 2 - 6, row = 0; z < depth / 2 + 6; z += 10, row++) for (let x = -width / 2 - 12 + (row % 2) * 12; x < width / 2 + 12; x += 24) box("Clay brick", [x, 0.02, z], [22.8, 0.1, 8.8], row % 3 ? "main" : "light");
  }
  for (const part of kit.parts) part.outline = false;
}

function buildAsiaRug(kit, style, width, depth) {
  const { box, cylinder, shape, THREE } = kit;
  if (style === 2) {
    cylinder("Round rug field", [0, 0, 0], width / 2 - 2, 0.2, "main");
    for (let radius = 8; radius < width / 2 - 3; radius += 8) shape("Mandala ring", new THREE.TorusGeometry(radius, 1.2, 4, 48), [0, 0.12, 0], radius % 16 ? "gold" : "light", [1, 1, 1], [90, 0, 0]);
    for (let index = 0; index < 12; index++) {
      const angle = index * Math.PI / 6;
      box("Mandala ray", [Math.cos(angle) * 26, 0.15, Math.sin(angle) * 26], [12, 0.1, 4], "light", [0, -index * 30, 0]);
    }
  } else {
    box("Woven rug field", [0, 0, 0], [width - 2, 0.2, depth - 2], "main");
    for (const x of [-width / 2 + 4, width / 2 - 4]) box("Rug binding", [x, 0.12, 0], [3, 0.1, depth - 3], "gold");
    if (style === 0) for (let z = -depth / 2 + 12; z < depth / 2 - 5; z += 19) {
      box("Prayer rug arch", [0, 0.14, z], [width - 17, 0.1, 13], "light");
      box("Inner arch", [0, 0.2, z], [width - 25, 0.1, 7], "shade");
    }
    if (style === 1) for (let z = -depth / 2 + 13; z < depth / 2 - 7; z += 24) box("Silk medallion", [0, 0.15, z], [width - 15, 0.1, 12], "light", [0, 45, 0]);
    if (style === 3) for (let x = -width / 2 + 14; x < width / 2 - 5; x += 20) for (let z = -depth / 2 + 14; z < depth / 2 - 6; z += 20) box("Indigo knot", [x, 0.15, z], [9, 0.1, 9], "light", [0, 45, 0]);
  }
  for (const part of kit.parts) part.outline = false;
}

function buildAsiaStorage(kit, style, width, depth) {
  const { box, cylinder, roundedBox } = kit;
  if (style === 0) {
    box("Tansu body", [0, 21, 0], [width - 3, 42, depth - 3], "main");
    for (const [y, drawerWidth] of [[9, width - 12], [21, width - 12], [33, width - 12]]) {
      box("Tansu drawer", [0, y, depth / 2 - 1], [drawerWidth, 10, 1], "light");
      cylinder("Ring pull", [0, y, depth / 2 + 0.5], 2, 1, "gold", 2, [90, 0, 0]);
    }
    for (const x of [-width / 2 + 3, width / 2 - 3]) box("Corner fitting", [x, 37, depth / 2], [3, 8, 1], "gold");
  } else if (style === 1) {
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 3, depth / 2 - 3]) cylinder("Bamboo shelf post", [x, 25, z], 2, 50, "wood");
    for (const y of [8, 25, 42]) {
      box("Bamboo shelf", [0, y, 0], [width - 3, 2, depth - 3], "main");
      for (let x = -width / 2 + 7; x < width / 2 - 3; x += 11) cylinder("Basket", [x, y + 5, 0], 4, 8, "straw", 5);
    }
  } else if (style === 2) {
    roundedBox("Lacquer trunk", [0, 13, 0], [width - 3, 26, depth - 3], "shade");
    roundedBox("Trunk lid", [0, 27, 0], [width - 1, 4, depth - 1], "main");
    for (const x of [-width / 3, width / 3]) {
      box("Trunk strap", [x, 14, depth / 2], [4, 23, 1], "gold");
      box("Lid band", [x, 29, 0], [4, 0.5, depth - 1], "gold");
    }
  } else {
    box("Jar rack", [0, 17, 0], [width - 2, 3, depth - 2], "wood");
    for (const x of [-width / 2 + 5, width / 2 - 5]) box("Rack leg", [x, 10, 0], [4, 20, depth - 4], "wood");
    for (const x of [-width / 3, 0, width / 3]) {
      cylinder("Storage jar", [x, 28, 0], 7, 19, "main", 5);
      cylinder("Jar lid", [x, 39, 0], 6, 3, "gold");
    }
  }
}

function buildAsiaLighting(kit, style) {
  const { box, cylinder, ellipsoid, shape, THREE } = kit;
  cylinder("Lamp foot", [0, 2, 0], 10, 4, "shade");
  const height = style === 0 ? 48 : style === 3 ? 37 : 29;
  cylinder("Lamp stem", [0, height / 2, 0], 2, height - 2, "wood");
  if (style === 0) {
    box("Lantern glow", [0, height + 6, 0], [20, 18, 18], "paper");
    for (const x of [-11, 11]) box("Lantern frame", [x, height + 6, 0], [2, 21, 20], "wood");
    box("Lantern cap", [0, height + 17, 0], [25, 3, 23], "main");
  } else if (style === 1) {
    ellipsoid("Lotus core", [0, height + 6, 0], [10, 7, 10], "paper");
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      ellipsoid("Lotus shade petal", [Math.cos(angle) * 11, height + 4, Math.sin(angle) * 11], [6, 5, 4], "pink", [0, -index * 45, 0]);
    }
  } else if (style === 2) {
    shape("Star shade", new THREE.OctahedronGeometry(13), [0, height + 9, 0], "gold");
    ellipsoid("Star lamp light", [0, height + 9, 0], [7, 7, 7], "paper");
    for (const y of [height + 1, height + 16]) shapeRing(kit, 7, y, "main");
  } else {
    for (let tier = 0; tier < 2; tier++) {
      const y = height + tier * 12;
      box("Pagoda lantern glow", [0, y + 4, 0], [16 - tier * 3, 8, 16 - tier * 3], "paper");
      box("Pagoda lamp roof", [0, y + 10, 0], [24 - tier * 3, 3, 24 - tier * 3], "main");
    }
    cylinder("Lantern finial", [0, height + 26, 0], 3, 7, "gold", 1);
  }
}

function buildAsiaBreakroom(kit, style, width, depth) {
  const { box, cylinder, roundedBox, ellipsoid } = kit;
  if (style === 0 || style === 2) {
    box("Service cabinet", [0, 16, 0], [width - 3, 32, depth - 3], "wood");
    box("Countertop", [0, 33, 0], [width - 2, 3, depth - 2], "main");
    for (const x of [-width / 4, width / 4]) box("Cabinet door", [x, 16, depth / 2 - 1], [width / 2 - 6, 25, 1], "light");
    if (style === 0) {
      cylinder("Tea kettle", [-width / 4, 39, 0], 10, 10, "shade", 7);
      cylinder("Kettle lid", [-width / 4, 45, 0], 5, 2, "gold");
      for (const x of [0, 13, 25]) cylinder("Teacup", [x, 37, 3], 3, 5, "paper", 4);
      box("Tea shelf", [0, 59, -depth / 2 + 3], [width - 15, 3, 8], "wood");
    } else {
      for (const x of [-width / 3, 0, width / 3]) {
        cylinder("Spice jar", [x, 41, 0], 6, 13, "paper", 5);
        cylinder("Jar cap", [x, 49, 0], 6.5, 2, "gold");
      }
      box("Spice rail", [0, 55, -depth / 2 + 2], [width - 10, 2, 4], "shade");
    }
  } else if (style === 1) {
    roundedBox("Rice cooker housing", [0, 16, 0], [width - 4, 32, depth - 4], "main");
    roundedBox("Cooker lid", [0, 32, 0], [width - 6, 6, depth - 6], "shade");
    box("Control panel", [0, 14, depth / 2 - 1], [23, 9, 1], "ink");
    box("Display", [0, 17, depth / 2 - 0.3], [12, 3, 0.3], "water");
    ellipsoid("Lid handle", [0, 37, 0], [8, 2, 4], "gold");
  } else {
    cylinder("Water urn plinth", [0, 3, 0], 15, 6, "wood");
    cylinder("Water urn", [0, 25, 0], 14, 40, "main", 11);
    cylinder("Urn collar", [0, 46, 0], 11, 3, "gold");
    box("Brass tap", [0, 13, depth / 2 - 2], [5, 5, 11], "gold");
    cylinder("Tap cup", [0, 4, depth / 2 + 4], 5, 6, "paper", 6);
  }
}

function buildAsiaFood(kit, style) {
  const { box, cylinder, ellipsoid } = kit;
  cylinder("Serving plate", [0, 1, 0], 13, 2, "paper");
  cylinder("Plate rim", [0, 2.1, 0], 12, 0.5, "main");
  if (style === 0) for (const [x, z] of [[-6, -4], [6, -4], [0, 6]]) {
    cylinder("Mooncake", [x, 5, z], 4.5, 5, "gold");
    box("Mooncake stamp", [x, 7.6, z], [5, 0.2, 5], "main", [0, 45, 0]);
  }
  if (style === 1) for (const [x, z] of [[-7, -3], [0, 3], [7, -3]]) {
    ellipsoid("Dumpling", [x, 5, z], [5, 3, 3], "cream");
    for (const offset of [-2, 0, 2]) box("Dumpling fold", [x + offset, 7.5, z], [0.5, 1, 3], "gold");
  }
  if (style === 2) {
    ellipsoid("Sticky rice", [-3, 5, 0], [8, 3, 7], "paper");
    for (const x of [3, 7, 10]) ellipsoid("Mango slice", [x, 5, 0], [2.5, 1, 7], "gold");
    cylinder("Coconut drizzle", [-3, 7, 0], 3, 0.5, "cream");
  }
  if (style === 3) {
    cylinder("Curry bowl", [0, 5, 0], 10, 8, "main", 12);
    cylinder("Curry", [0, 9.5, 0], 8.5, 0.5, "gold");
    for (const [x, z] of [[-4, -3], [3, 2], [0, 6]]) ellipsoid("Curry garnish", [x, 10, z], [2, 1, 2], "green");
  }
}

function buildAsiaInfrastructure(kit, style, width, depth) {
  const { box, cylinder } = kit;
  if (style === 3) {
    box("Wayfinding pillar", [0, 32, 0], [width - 9, 64, depth - 9], "wood");
    box("Inset sign", [0, 42, depth / 2 - 3], [width - 16, 20, 1], "paper");
    for (const y of [38, 43, 48]) box("Sign mark", [0, y, depth / 2 - 2], [10, 2, 0.4], "ink");
    box("Pillar cap", [0, 65, 0], [width - 5, 4, depth - 5], "main");
    return;
  }
  const height = style === 2 ? 72 : 55;
  for (const x of [-width / 2 + 4, width / 2 - 4]) box("Partition post", [x, height / 2, 0], [5, height, depth - 1], "wood");
  box("Partition top rail", [0, height - 3, 0], [width - 4, 5, depth - 1], "main");
  if (style === 0) {
    box("Translucent screen", [0, height / 2, 0], [width - 15, height - 12, 1], "paper");
    for (let x = -width / 2 + 16; x < width / 2 - 8; x += 13) box("Shoji mullion", [x, height / 2, depth / 2], [2, height - 12, 1], "wood");
    for (const y of [16, 31, 46]) box("Shoji crossbar", [0, y, depth / 2], [width - 14, 2, 1], "wood");
  } else if (style === 1) {
    for (let x = -width / 2 + 10; x < width / 2 - 4; x += 6) cylinder("Bamboo screening", [x, height / 2, 0], 2, height - 7, x % 2 ? "green" : "wood");
    for (const y of [12, 41]) box("Screen binding", [0, y, depth / 2], [width - 10, 2, 1], "gold");
  } else {
    for (const x of [-width / 2 + 11, width / 2 - 11]) box("Carved gate leaf", [x, 29, 0], [13, 52, 2], "shade");
    box("Gate lintel", [0, 67, 0], [width - 9, 8, depth - 1], "main");
    for (let x = -width / 2 + 12; x < width / 2 - 5; x += 9) box("Carved frieze", [x, 68, depth / 2], [4, 4, 1], "gold", [0, 0, 45]);
  }
}

function buildAsiaSuite(kit, asset, width, depth) {
  const designs = asiaDesigns[asset.category];
  const style = designs?.indexOf(asset.id) ?? -1;
  if (style < 0) throw new Error(`Missing Asia model: ${asset.id}`);
  switch (asset.category) {
    case "desks": return buildAsiaDesk(kit, style, width, depth);
    case "seating": return buildAsiaSeating(kit, style, width, depth);
    case "tables": return buildAsiaTable(kit, style, width, depth);
    case "plants": return buildAsiaPlant(kit, style, width, depth);
    case "outdoor": return buildAsiaOutdoor(kit, style, width, depth);
    case "decor": return buildAsiaDecor(kit, style, width, depth);
    case "equipment": return buildAsiaEquipment(kit, style, width, depth);
    case "floor-types": return buildAsiaFloor(kit, style, width, depth);
    case "floor-decorations": return buildAsiaRug(kit, style, width, depth);
    case "storage": return buildAsiaStorage(kit, style, width, depth);
    case "lighting": return buildAsiaLighting(kit, style);
    case "breakroom": return buildAsiaBreakroom(kit, style, width, depth);
    case "food": return buildAsiaFood(kit, style, width, depth);
    case "infrastructure": return buildAsiaInfrastructure(kit, style, width, depth);
  }
}

module.exports = { buildAsiaSuite };
