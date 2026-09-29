const cuteDesigns = {
  desks: ["cute-bunny-desk", "cute-cloud-desk"],
  seating: ["cute-bear-pouf", "cute-kitten-loveseat"],
  tables: ["cute-daisy-table", "cute-rainbow-table"],
  plants: ["cute-heart-topiary", "cute-smiley-succulent"],
  outdoor: ["cute-mushroom-cottage", "cute-duck-pond"],
  decor: ["cute-teddy-figurine", "cute-star-mobile", "cute-gift-stack"],
  equipment: ["cute-claw-machine", "cute-drawing-easel"],
  "floor-types": ["cute-confetti-floor", "cute-candy-checker-floor"],
  "floor-decorations": ["cute-cloud-rug", "cute-flower-rug"],
  storage: ["cute-toy-chest", "cute-bunny-bookshelf"],
  lighting: ["cute-moon-nightlight", "cute-strawberry-lamp"],
  breakroom: ["cute-cupcake-kiosk", "cute-milkshake-machine"],
  food: ["cute-frosted-cupcake", "cute-fruit-parfait", "cute-bear-cookies"],
  infrastructure: ["cute-picket-fence", "cute-rainbow-arch"],
};

function face(kit, x, y, z, scale = 1) {
  const { ellipsoid } = kit;
  for (const offset of [-3, 3]) ellipsoid("Eye", [x + offset * scale, y, z], [0.9, 1.2, 0.4].map(value => value * scale), "ink");
  ellipsoid("Nose", [x, y - 2.2 * scale, z + 0.2], [1.1, 0.7, 0.4].map(value => value * scale), "pink");
  for (const offset of [-6, 6]) ellipsoid("Cheek", [x + offset * scale, y - 2 * scale, z], [2, 0.9, 0.3].map(value => value * scale), "rose");
}

function ears(kit, y, z, width, height = 10) {
  for (const x of [-width / 2 + 7, width / 2 - 7]) {
    kit.ellipsoid("Ear", [x, y, z], [3.5, height, 2], "main");
    kit.ellipsoid("Inner ear", [x, y + 1, z + 1.7], [1.7, height - 3, 0.5], "pink");
  }
}

function flower(kit, x, y, z, radius = 5) {
  for (let petal = 0; petal < 6; petal++) {
    const angle = petal * Math.PI / 3;
    kit.ellipsoid("Petal", [x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius], [radius * 0.6, 0.8, radius * 0.6], "light");
  }
  kit.cylinder("Flower center", [x, y + 0.8, z], radius * 0.55, 1.5, "gold");
}

function heart(kit, x, y, z, scale = 1) {
  for (const offset of [-3, 3]) kit.ellipsoid("Heart lobe", [x + offset * scale, y + 2 * scale, z], [4, 4, 2].map(value => value * scale), "pink");
  kit.box("Heart point", [x, y - 1 * scale, z], [8, 8, 2].map(value => value * scale), "pink", [0, 0, 45]);
}

function desk(kit, style, width, depth) {
  const height = 31;
  kit.roundedBox("Desktop", [0, height, 0], [width - 2, 4, depth - 2], "main");
  kit.roundedBox("Writing inset", [0, height + 2.1, 0], [width - 12, 0.6, depth - 10], "light");
  for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) kit.cylinder("Rounded leg", [x, 15, z], 2.7, 29, "shade");
  if (style === 0) {
    kit.roundedBox("Bunny drawer", [0, 24, depth / 2 - 2], [width - 17, 8, 3], "light");
    face(kit, 0, 25, depth / 2 - 0.3);
    ears(kit, 38, -depth / 2 + 4, 20, 8);
    kit.ellipsoid("Cotton tail", [width / 2 - 8, 27, -depth / 2 + 2], [4, 4, 4], "paper");
  } else {
    for (const x of [-width / 3, 0, width / 3]) kit.ellipsoid("Cloud shelf", [x, 42, -depth / 2 + 6], [11, 4, 5], "paper");
    kit.box("Shelf support", [0, 37, -depth / 2 + 6], [width - 14, 8, 3], "light");
    for (const x of [-width / 2 + 10, width / 2 - 10]) heart(kit, x, 27, depth / 2 - 1, 0.45);
  }
  return { surfaceHeight: height + 2.3 };
}

function seating(kit, style, width, depth) {
  if (style === 0) {
    kit.roundedBox("Pouf", [0, 12, 0], [width - 2, 23, depth - 2], "main");
    kit.ellipsoid("Padded seat", [0, 23, 0], [width / 2 - 2, 3, depth / 2 - 2], "light");
    for (const x of [-width / 2 + 5, width / 2 - 5]) kit.ellipsoid("Bear ear", [x, 22, -depth / 2 + 4], [4, 5, 3], "shade");
    face(kit, 0, 13, depth / 2 - 0.5);
    return { seatHeight: 23, seatHasBack: false };
  }
  for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) kit.box("Sofa foot", [x, 5, z], [5, 10, 5], "shade");
  kit.roundedBox("Sofa base", [0, 16, 0], [width - 2, 14, depth - 2], "main");
  kit.roundedBox("Seat cushions", [0, 24, 3], [width - 9, 4, depth - 10], "light");
  kit.roundedBox("Sofa back", [0, 33, -depth / 2 + 4], [width - 2, 28, 7], "main");
  ears(kit, 49, -depth / 2 + 4, width - 8, 7);
  face(kit, 0, 35, -depth / 2 + 8);
  return { seatHeight: 26, seatHasBack: true };
}

function table(kit, style, width, depth) {
  const height = style === 0 ? 30 : 25;
  kit.cylinder("Pedestal", [0, height / 2, 0], 5, height - 3, "shade");
  kit.cylinder("Table foot", [0, 2, 0], 13, 4, "shade");
  if (style === 0) {
    kit.cylinder("Flower table top", [0, height, 0], Math.min(width, depth) / 2 - 3, 3, "main");
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      kit.ellipsoid("Daisy edge", [Math.cos(angle) * (width / 2 - 11), height + 1, Math.sin(angle) * (depth / 2 - 11)], [9, 1.5, 7], "light");
    }
    kit.cylinder("Daisy center", [0, height + 2, 0], 11, 1, "gold");
  } else {
    kit.roundedBox("Picnic top", [0, height, 0], [width - 3, 3, depth - 3], "light");
    for (let stripe = 0; stripe < 5; stripe++) kit.box("Rainbow stripe", [0, height + 1.7, -depth / 2 + 9 + stripe * 10], [width - 10, 0.3, 6], ["pink", "gold", "mint", "water", "lavender"][stripe]);
    for (const x of [-width / 2 + 8, width / 2 - 8]) kit.ellipsoid("Cloud corner", [x, height + 2, -depth / 2 + 7], [7, 2, 5], "paper");
  }
  return { surfaceHeight: height + 2 };
}

function plant(kit, style, width, depth) {
  const radius = Math.min(width, depth) / 2 - 3;
  kit.cylinder("Planter", [0, 7, 0], radius, 14, "main", radius + 2);
  kit.cylinder("Soil", [0, 14, 0], radius - 2, 1, "soil");
  face(kit, 0, 7, radius + 1);
  if (style === 0) {
    kit.branch("Topiary stem", [0, 14, 0], [0, 47, 0], 2.5, "green");
    for (const x of [-10, 10]) kit.ellipsoid("Heart foliage", [x, 49, 0], [13, 13, 8], "green");
    kit.box("Heart foliage tip", [0, 41, 0], [20, 20, 11], "green", [0, 0, 45]);
    for (const x of [-12, 8]) flower(kit, x, 57, 4, 3);
  } else {
    for (let index = 0; index < 7; index++) {
      const angle = index * Math.PI * 2 / 7;
      kit.ellipsoid("Succulent leaf", [Math.cos(angle) * 7, 20, Math.sin(angle) * 7], [5, 11, 5], "green", [0, 0, index * 12]);
    }
    kit.ellipsoid("Succulent center", [0, 26, 0], [7, 6, 7], "mint");
  }
}

function outdoor(kit, style, width, depth) {
  if (style === 0) {
    kit.cylinder("Cottage wall", [0, 17, 0], Math.min(width, depth) / 2 - 5, 34, "cream");
    kit.cylinder("Mushroom roof", [0, 38, 0], Math.min(width, depth) / 2 - 1, 12, "main", 6);
    kit.roundedBox("Door", [0, 12, depth / 2 - 7], [14, 24, 2], "shade");
    kit.ellipsoid("Door knob", [4, 13, depth / 2 - 5], [1, 1, 1], "gold");
    for (const x of [-13, 13]) kit.ellipsoid("Roof spot", [x, 44, 2], [5, 1, 4], "paper");
    kit.cylinder("Chimney", [12, 48, -6], 3, 13, "cream");
  } else {
    kit.ellipsoid("Pond rim", [0, 3, 0], [width / 2 - 2, 4, depth / 2 - 2], "main");
    kit.ellipsoid("Pond water", [0, 7.2, 0], [width / 2 - 8, 1, depth / 2 - 8], "water");
    for (const [x, z] of [[-18, 0], [14, -11], [13, 13]]) {
      kit.ellipsoid("Duck body", [x, 9, z], [8, 5, 6], "gold");
      kit.ellipsoid("Duck head", [x + 4, 14, z], [4, 4, 4], "gold");
      kit.box("Duck bill", [x + 8, 13, z], [4, 1, 3], "pink");
      kit.ellipsoid("Duck eye", [x + 7, 16, z + 2], [0.7, 0.7, 0.5], "ink");
    }
  }
}

function decor(kit, style, width) {
  if (style === 0) {
    kit.ellipsoid("Bear body", [0, 7, 0], [8, 8, 6], "main");
    kit.ellipsoid("Bear head", [0, 18, 0], [9, 8, 7], "main");
    for (const x of [-7, 7]) kit.ellipsoid("Bear ear", [x, 24, 0], [3, 4, 3], "shade");
    face(kit, 0, 19, 6);
    heart(kit, 0, 7, 6, 0.45);
  } else if (style === 1) {
    kit.cylinder("Mobile base", [0, 1, 0], 10, 2, "shade");
    kit.branch("Mobile stem", [0, 2, 0], [0, 36, 0], 1.2, "shade");
    kit.box("Mobile bar", [0, 35, 0], [width - 5, 2, 2], "main");
    for (const x of [-width / 2 + 6, 0, width / 2 - 6]) {
      kit.branch("Mobile thread", [x, 34, 0], [x, x === 0 ? 21 : 16, 0], 0.3, "shade");
      kit.ellipsoid("Hanging star", [x, x === 0 ? 19 : 14, 0], [4, 4, 2], x === 0 ? "gold" : "pink");
    }
  } else {
    for (const [x, y, size, color] of [[-7, 5, 12, "main"], [7, 5, 12, "mint"], [0, 17, 12, "pink"]]) {
      kit.box("Gift box", [x, y, 0], [size, size, size], color);
      kit.box("Ribbon", [x, y + 0.2, size / 2 + 0.3], [2, size, 0.6], "gold");
      kit.box("Lid", [x, y + size / 2, 0], [size + 1, 2, size + 1], "light");
    }
  }
}

function equipment(kit, style, width, depth) {
  if (style === 0) {
    kit.roundedBox("Claw cabinet", [0, 33, 0], [width - 4, 65, depth - 4], "main");
    kit.box("Display window", [0, 45, depth / 2 - 1], [width - 14, 28, 1], "waterLight");
    kit.box("Display recess", [0, 46, depth / 2 - 0.4], [width - 20, 20, 0.5], "lavender");
    for (const x of [-10, 9]) {
      kit.ellipsoid("Plush prize", [x, 42, depth / 2], [6, 7, 2], x < 0 ? "pink" : "gold");
      kit.ellipsoid("Prize ear", [x - 3, 49, depth / 2], [2, 3, 2], "paper");
    }
    kit.box("Prize hatch", [0, 14, depth / 2 - 0.2], [22, 16, 1], "shade");
    kit.cylinder("Joystick", [width / 3, 30, depth / 2 - 1], 2, 4, "gold");
    kit.ellipsoid("Joystick grip", [width / 3, 33, depth / 2 - 1], [3, 3, 3], "pink");
  } else {
    for (const x of [-width / 2 + 7, width / 2 - 7]) kit.branch("Easel leg", [x, 0, 0], [0, 60, -4], 2, "shade");
    kit.branch("Rear easel leg", [0, 54, -3], [0, 0, -depth / 2 + 2], 2, "shade");
    kit.box("Drawing board", [0, 39, 3], [width - 12, 37, 3], "paper");
    kit.box("Board tray", [0, 18, 7], [width - 8, 3, 7], "main");
    flower(kit, 0, 40, 6, 8);
  }
}

function floor(kit, style, width, depth) {
  kit.box("Continuous tile backing", [0, -0.12, 0], [width + 8, 0.2, depth + 8], "main");
  kit.box("Floor tile", [0, 0.4, 0], [width, 0.8, depth], style === 0 ? "light" : "main");
  const cell = 16;
  for (let x = -width / 2 + cell / 2; x < width / 2; x += cell) for (let z = -depth / 2 + cell / 2; z < depth / 2; z += cell) {
    const column = Math.floor((x + width / 2) / cell);
    const row = Math.floor((z + depth / 2) / cell);
    if (style === 0) {
      if ((column + row) % 3 === 0) kit.ellipsoid("Confetti dot", [x, 0.9, z], [2, 0.2, 2], "pink");
      else if ((column + row) % 3 === 1) kit.box("Confetti star", [x, 0.9, z], [5, 0.2, 2], "gold", [0, 45, 0]);
      else kit.ellipsoid("Confetti dot", [x, 0.9, z], [1.5, 0.2, 1.5], "mint");
    } else kit.box("Candy square", [x, 0.9, z], [cell - 1, 0.2, cell - 1], (column + row) % 2 ? "light" : "pink");
  }
  for (const part of kit.parts) part.outline = false;
}

function rug(kit, style, width, depth) {
  kit.roundedBox("Rug backing", [0, 0.5, 0], [width - 2, 1, depth - 2], "shade");
  if (style === 0) {
    for (const [x, z, sx, sz] of [[0, 0, 21, 16], [-20, 4, 14, 13], [20, 3, 14, 13], [-7, -14, 18, 12], [9, -14, 18, 12]]) kit.ellipsoid("Cloud pile", [x, 1, z], [sx, 0.9, sz], "paper");
    face(kit, 0, 1.3, depth / 4, 0.6);
  } else {
    for (let petal = 0; petal < 8; petal++) {
      const angle = petal * Math.PI / 4;
      kit.ellipsoid("Flower petal", [Math.cos(angle) * width * 0.27, 1.2, Math.sin(angle) * depth * 0.27], [width * 0.21, 0.9, depth * 0.16], "light", [0, -petal * 45, 0]);
    }
    kit.ellipsoid("Flower heart", [0, 1.5, 0], [width * 0.2, 0.8, depth * 0.2], "gold");
  }
}

function storage(kit, style, width, depth) {
  if (style === 0) {
    kit.roundedBox("Toy chest", [0, 19, 0], [width - 3, 35, depth - 3], "main");
    kit.roundedBox("Chest lid", [0, 38, 0], [width - 2, 6, depth - 2], "light");
    kit.box("Chest clasp", [0, 24, depth / 2 - 1], [8, 8, 1], "gold");
    for (const x of [-width / 3, width / 3]) heart(kit, x, 21, depth / 2 - 0.2, 0.55);
  } else {
    for (const x of [-width / 2 + 4, width / 2 - 4]) kit.box("Bookcase side", [x, 33, 0], [5, 65, depth - 2], "main");
    for (const y of [5, 26, 48, 65]) kit.box("Bookcase shelf", [0, y, 0], [width - 3, 4, depth - 2], "light");
    ears(kit, 75, 0, width - 6, 8);
    for (const [x, y, color] of [[-17, 16, "pink"], [2, 16, "mint"], [18, 37, "gold"], [-8, 58, "lavender"]]) kit.box("Storybook", [x, y, 0], [12, 15, 8], color);
  }
}

function lighting(kit, style) {
  kit.cylinder("Lamp foot", [0, 2, 0], 12, 4, "shade");
  kit.cylinder("Lamp stem", [0, 16, 0], 2, 29, "gold");
  if (style === 0) {
    kit.ellipsoid("Moon glow", [0, 42, 0], [13, 15, 6], "light");
    kit.ellipsoid("Moon cutout", [7, 47, 1], [12, 13, 6], "shade");
    for (const [x, y] of [[-15, 57], [17, 53]]) kit.ellipsoid("Star", [x, y, 0], [3, 3, 2], "gold");
  } else {
    kit.ellipsoid("Strawberry shade", [0, 42, 0], [13, 15, 12], "pink");
    for (const x of [-8, 0, 8]) kit.ellipsoid("Leaf cap", [x, 56, 0], [6, 2, 5], "green");
    for (const [x, y] of [[-5, 42], [5, 44], [-1, 35]]) kit.ellipsoid("Seed", [x, y, 11], [1, 2, 0.4], "gold");
  }
}

function breakroom(kit, style, width, depth) {
  kit.roundedBox("Counter", [0, 18, 0], [width - 3, 35, depth - 3], "main");
  kit.roundedBox("Counter top", [0, 37, 0], [width - 2, 4, depth - 2], "light");
  if (style === 0) {
    kit.box("Cupcake display", [0, 54, -depth / 2 + 6], [width - 12, 26, 12], "paper");
    kit.box("Display ledge", [0, 44, 1], [width - 10, 2, depth - 9], "gold");
    for (const x of [-width / 3, 0, width / 3]) {
      kit.cylinder("Cupcake wrapper", [x, 47, 2], 5, 7, "pink", 6);
      kit.ellipsoid("Cupcake frosting", [x, 53, 2], [6, 5, 6], "cream");
      kit.ellipsoid("Cherry", [x, 58, 2], [2, 2, 2], "rose");
    }
    kit.box("Striped awning", [0, 72, 0], [width - 1, 5, depth - 1], "pink");
  } else {
    kit.roundedBox("Mixer housing", [0, 57, -depth / 2 + 8], [width - 15, 35, 13], "light");
    for (const x of [-width / 4, width / 4]) {
      kit.cylinder("Shake cup", [x, 45, 5], 5, 13, "paper", 6);
      kit.ellipsoid("Whipped cream", [x, 53, 5], [6, 4, 6], x < 0 ? "pink" : "mint");
      kit.branch("Straw", [x + 3, 53, 5], [x + 6, 64, 5], 0.8, "rose");
    }
    kit.box("Mixer buttons", [0, 27, depth / 2 - 1], [23, 10, 1], "shade");
    for (const x of [-7, 0, 7]) kit.ellipsoid("Button", [x, 27, depth / 2], [2, 2, 0.5], "gold");
  }
}

function food(kit, style) {
  kit.cylinder("Plate", [0, 1, 0], 14, 2, "light");
  kit.cylinder("Plate rim", [0, 2.2, 0], 13, 0.5, "gold");
  if (style === 0) {
    kit.cylinder("Cupcake wrapper", [0, 6, 0], 7, 8, "main", 8);
    kit.ellipsoid("Frosting", [0, 12, 0], [9, 7, 9], "cream");
    kit.ellipsoid("Cherry", [0, 19, 0], [2.5, 2.5, 2.5], "rose");
    for (const x of [-5, 5]) kit.ellipsoid("Sprinkle", [x, 15, 6], [1, 0.5, 0.5], "gold");
  } else if (style === 1) {
    kit.cylinder("Parfait glass", [0, 9, 0], 8, 14, "waterLight", 6);
    kit.cylinder("Cream layer", [0, 10, 0], 7, 3, "cream");
    kit.ellipsoid("Fruit scoop", [0, 17, 0], [8, 6, 8], "pink");
    for (const x of [-5, 3, 6]) kit.ellipsoid("Fruit slice", [x, 20, 2], [2, 3, 2], "gold");
  } else for (const [x, z] of [[-7, -4], [7, -4], [0, 7]]) {
    kit.ellipsoid("Bear cookie", [x, 4, z], [5, 2, 4], "gold");
    for (const side of [-3, 3]) kit.ellipsoid("Cookie ear", [x + side, 5, z - 3], [2, 1, 2], "gold");
    kit.ellipsoid("Cookie nose", [x, 6, z + 2], [0.8, 0.3, 0.5], "ink");
  }
}

function infrastructure(kit, style, width, depth) {
  if (style === 0) {
    for (let x = -width / 2 + 5; x < width / 2; x += 12) {
      kit.box("Fence picket", [x, 25, 0], [8, 50, depth - 2], Math.round((x + width / 2) / 12) % 2 ? "main" : "light");
      kit.box("Picket tip", [x, 52, 0], [7, 7, depth - 2], "paper", [0, 0, 45]);
    }
    for (const y of [13, 37]) kit.box("Fence rail", [0, y, -depth / 2 + 2], [width - 2, 4, 3], "shade");
  } else {
    for (const x of [-width / 2 + 5, width / 2 - 5]) kit.roundedBox("Arch post", [x, 27, 0], [10, 54, depth - 2], "main");
    for (let band = 0; band < 5; band++) kit.box("Rainbow arch band", [0, 58 + band * 5, 0], [width - 9 - band * 3, 5, depth - 2], ["pink", "gold", "mint", "water", "lavender"][band]);
    for (const x of [-width / 2 + 7, width / 2 - 7]) kit.ellipsoid("Cloud finial", [x, 57, depth / 2], [8, 6, 4], "paper");
  }
}

function buildCuteSuite(kit, asset, width, depth) {
  const style = cuteDesigns[asset.category]?.indexOf(asset.id) ?? -1;
  if (style < 0) throw new Error(`Missing cute model: ${asset.id}`);
  switch (asset.category) {
    case "desks": return desk(kit, style, width, depth);
    case "seating": return seating(kit, style, width, depth);
    case "tables": return table(kit, style, width, depth);
    case "plants": return plant(kit, style, width, depth);
    case "outdoor": return outdoor(kit, style, width, depth);
    case "decor": return decor(kit, style, width);
    case "equipment": return equipment(kit, style, width, depth);
    case "floor-types": return floor(kit, style, width, depth);
    case "floor-decorations": return rug(kit, style, width, depth);
    case "storage": return storage(kit, style, width, depth);
    case "lighting": return lighting(kit, style);
    case "breakroom": return breakroom(kit, style, width, depth);
    case "food": return food(kit, style);
    case "infrastructure": return infrastructure(kit, style, width, depth);
  }
}

module.exports = { buildCuteSuite };
