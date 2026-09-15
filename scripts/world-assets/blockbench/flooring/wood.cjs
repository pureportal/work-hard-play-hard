function floorBoards(g, options = {}) {
  const { boardWidth = 16, boardLength = 64, gap = 0.55, grain = true, knots = true, bamboo = false, grooves = false } = options;
  g.tiles(boardLength, boardWidth, gap, (x, z, w, d, column, row) => {
    const tone = ((column * 3 + row) % 4 + 4) % 4;
    g.rectangle("Board", x, z, w, d, bamboo ? tone % 3 ? "main" : "grain" : ["main", "grain", "main", "light"][tone]);
    g.line("Beveled edge", [[x, z + 0.45], [x + w, z + 0.45]], 0.35, "highlight");
    if (grain) for (let strand = 0; strand < 3; strand++) {
      const start = x + w * (0.06 + strand * 0.06);
      const end = x + w * (0.74 + strand * 0.06);
      const level = z + d * (strand + 1) / 4;
      g.line("Flowing wood grain", [[start, level], [start + (end - start) * 0.3, level - 0.5], [(start + end) / 2, level + (strand % 2 ? 0.7 : -0.9)], [end, level + 0.15]], bamboo ? 0.3 : 0.55, strand === 1 ? "stitch" : "highlight");
    }
    if (knots && tone === 1) {
      g.ellipse("Oak knot", x + w * 0.67, z + d * 0.57, Math.min(w * 0.07, 2.5), 0.8, "shade", 0.06);
      g.ellipse("Knot heart", x + w * 0.67, z + d * 0.57, Math.min(w * 0.045, 1.7), 0.4, "grain", 0.07);
    }
    if (bamboo) for (let node = 12; node < w; node += 22) {
      g.line("Bamboo node", [[x + node, z + 0.5], [x + node - 0.6, z + d / 2], [x + node, z + d - 0.5]], 0.55, "stitch", 0.07);
      g.line("Node light", [[x + node + 0.7, z + 0.5], [x + node + 0.7, z + d - 0.5]], 0.32, "highlight", 0.08);
    }
    if (grooves) {
      for (const side of [0.24, 0.42, 0.6, 0.78]) g.line("Deck groove", [[x, z + d * side], [x + w, z + d * side]], 0.4, "stitch", 0.08);
      for (const end of [x + 1.6, x + w - 1.6]) for (const side of [0.18, 0.82]) g.ellipse("Recessed deck screw", end, z + d * side, 0.5, 0.5, "shade", 0.1, 8);
    }
  }, boardLength / 2);
}

function floorBasket(g, { divisions = 4, bamboo = false, deck = false } = {}) {
  for (let row = -1; row < 3; row++) for (let column = -1; column < 3; column++) {
    const sideways = (row + column) % 2 !== 0;
    const cell = 32 / divisions;
    for (let plank = 0; plank < divisions; plank++) {
      const x = column * 32 + (sideways ? 0 : plank * cell);
      const z = row * 32 + (sideways ? plank * cell : 0);
      const w = sideways ? 32 : cell;
      const d = sideways ? cell : 32;
      g.rectangle("Basket joint", x, z, w, d, "shade", 0.01);
      const inset = deck ? 0.55 : 0.25;
      g.rectangle("Basket slat", x + inset, z + inset, w - inset * 2, d - inset * 2, plank % 3 === 1 ? "grain" : "main", 0.03);
      for (const strand of [0.28, 0.65]) g.line("Long slat grain", sideways ? [[x + 2, z + d * strand], [x + w - 2, z + d * strand]] : [[x + w * strand, z + 2], [x + w * strand, z + d - 2]], 0.32, "grain", 0.05);
      if (bamboo) g.line("Bamboo cross node", sideways ? [[x + 12, z + 1], [x + 12, z + d - 1]] : [[x + 1, z + 12], [x + w - 1, z + 12]], 0.5, "stitch", 0.06);
      if (deck) for (const strand of [0.4, 0.6]) g.line("Deck tile groove", sideways ? [[x + 1, z + d * strand], [x + w - 1, z + d * strand]] : [[x + w * strand, z + 1], [x + w * strand, z + d - 1]], 0.45, "stitch", 0.07);
    }
  }
}

function floorHerringbone(g, diagonal = true, grain = true, unit = 8) {
  const pitch = diagonal ? unit / Math.SQRT2 : unit;
  const transform = ([x, z]) => diagonal ? [(x - z) * Math.SQRT1_2 + 32, (x + z) * Math.SQRT1_2 + 32] : [x + 32, z + 32];
  g.rectangle("Parquet joints", -4, -4, 72, 72, "shade", 0);
  for (let axis = -18; axis <= 18; axis++) for (let band = -6; band <= 6; band++) {
    for (const vertical of [false, true]) {
      const x = (vertical ? axis : band * 8 - axis) * pitch;
      const z = (vertical ? band * 8 + 4 - axis : axis) * pitch;
      const w = (vertical ? 1 : 4) * pitch;
      const d = (vertical ? 4 : 1) * pitch;
      const points = [[x + 0.25, z + 0.25], [x + w - 0.25, z + 0.25], [x + w - 0.25, z + d - 0.25], [x + 0.25, z + d - 0.25]].map(transform);
      if (points.every(([px]) => px < -3) || points.every(([px]) => px > 67) || points.every(([, pz]) => pz < -3) || points.every(([, pz]) => pz > 67)) continue;
      g.polygon("Herringbone board", points, vertical ? "grain" : "main", 0.02);
      if (grain) for (const strand of [0.33, 0.68]) g.line("Parquet grain", (vertical ? [[x + w * strand, z + 1.5], [x + w * strand + 0.25, z + d - 1.5]] : [[x + 1.5, z + d * strand], [x + w - 1.5, z + d * strand + 0.25]]).map(transform), 0.28, vertical ? "highlight" : "light", 0.05);
    }
  }
}

function floorChevron(g) {
  g.rectangle("Chevron joints", -4, -4, 72, 72, "shade", 0);
  for (let row = -4; row <= 8; row++) for (let column = -1; column < 2; column++) {
    const x = column * 64;
    const z = row * 8;
    g.polygon("Left chevron", [[x + 0.3, z + 0.3], [x + 31.7, z + 16], [x + 31.7, z + 23.4], [x + 0.3, z + 7.7]], row % 3 === 0 ? "light" : "main");
    g.polygon("Right chevron", [[x + 32.3, z + 16], [x + 63.7, z + 0.3], [x + 63.7, z + 7.7], [x + 32.3, z + 23.4]], row % 3 === 0 ? "main" : "grain");
    for (const offset of [2.5, 5.2]) {
      g.line("Chevron grain", [[x + 3, z + offset + 1.5], [x + 28, z + offset + 14]], 0.28, "highlight");
      g.line("Chevron grain", [[x + 35, z + offset + 14.5], [x + 61, z + offset + 1.5]], 0.28, "light");
    }
  }
}

function buildWoodFloor(g, asset, variant) {
  if (asset.id === "floor-parquet") {
    if (variant.id === "herringbone") floorHerringbone(g);
    else if (variant.id === "chevron") floorChevron(g);
    else floorBasket(g);
  } else if (asset.id === "floor-bamboo") {
    if (variant.id === "woven") floorBasket(g, { bamboo: true });
    else floorBoards(g, { boardWidth: variant.id === "natural" ? 8 : 4, bamboo: true, knots: false });
  } else if (asset.id === "floor-decking") {
    if (variant.id === "squares") floorBasket(g, { deck: true });
    else floorBoards(g, { boardWidth: variant.id === "cedar" ? 16 : 8, boardLength: 64, knots: false, grain: false, grooves: true, gap: 1 });
  } else if (asset.id === "floor-laminate") {
    if (variant.id === "diagonal") floorHerringbone(g, true, false, 16);
    else if (variant.id === "slate") {
      g.tiles(32, 32, 0.4, (x, z, w, d, c, r) => g.rectangle("Stone effect laminate", x, z, w, d, (c + r) % 2 ? "grain" : "main"));
      g.chips(85, 0.4, ["grain", "highlight"]);
    } else floorBoards(g, { boardWidth: 8, boardLength: 32, knots: false, gap: 0.35 });
  } else floorBoards(g, { boardWidth: variant.id === "oak" ? 16 : variant.id === "walnut" ? 8 : 32, boardLength: variant.id === "walnut" ? 32 : 64 });
}

module.exports = { buildWoodFloor, floorBoards, floorBasket, floorHerringbone, floorChevron };
