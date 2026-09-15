const { floorHerringbone } = require("./wood.cjs");

function stoneCells(g, columns, rows, rounded = false) {
  const seeds = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const phase = column * 71 + row * 43;
    seeds.push({ x: (column + 0.5 + Math.sin(phase + 2) * 0.3) * 64 / columns, z: (row + 0.5 + Math.cos(phase) * 0.3) * 64 / rows, tone: (column + row * 3) % 4 });
  }
  const neighbors = seeds.flatMap(seed => [-64, 0, 64].flatMap(dx => [-64, 0, 64].map(dz => ({ ...seed, x: seed.x + dx, z: seed.z + dz }))));
  g.rectangle("Stone joints", -4, -4, 72, 72, "shade", 0);
  for (const seed of seeds) {
    let points = [[-80, -80], [144, -80], [144, 144], [-80, 144]];
    for (const neighbor of neighbors) {
      const dx = neighbor.x - seed.x, dz = neighbor.z - seed.z;
      if (!dx && !dz) continue;
      const limit = (neighbor.x ** 2 + neighbor.z ** 2 - seed.x ** 2 - seed.z ** 2) / 2;
      const next = [];
      for (let edge = 0; edge < points.length; edge++) {
        const a = points[edge], b = points[(edge + 1) % points.length];
        const da = a[0] * dx + a[1] * dz - limit;
        const db = b[0] * dx + b[1] * dz - limit;
        if (da <= 0) next.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      points = next;
    }
    const inset = points.map(([x, z]) => {
      const scale = 1 - (rounded ? 1.1 : 0.45) / Math.hypot(x - seed.x, z - seed.z);
      return [seed.x + (x - seed.x) * scale, seed.z + (z - seed.z) * scale];
    });
    const face = rounded ? inset.flatMap((point, index) => {
      const previous = inset[(index + inset.length - 1) % inset.length];
      const next = inset[(index + 1) % inset.length];
      return [[point[0] * 0.8 + previous[0] * 0.2, point[1] * 0.8 + previous[1] * 0.2], [point[0] * 0.8 + next[0] * 0.2, point[1] * 0.8 + next[1] * 0.2]];
    }) : inset;
    g.repeat((dx, dz) => {
      g.polygon(rounded ? "Rounded river stone" : "Split stone", face.map(([x, z]) => [x + dx, z + dz]), ["main", "grain", "light", "main"][seed.tone]);
      const a = face[0], b = face[1];
      g.line("Honed stone edge", [[a[0] + dx, a[1] + dz + 0.5], [b[0] + dx, b[1] + dz + 0.5]], 0.45, "highlight");
    });
  }
}

function marbleVeins(g, material = "grain", thickness = 0.55) {
  for (const [level, phase] of [[18, 0], [49, 21]]) {
    const height = x => level + 6 * Math.sin((x + phase) * Math.PI / 32) + 2.6 * Math.sin((x + phase * 2) * Math.PI / 16);
    g.repeat((dx, dz) => {
      g.line("Flowing mineral vein", Array.from({ length: 17 }, (_, index) => [dx + index * 4, dz + height(index * 4)]), thickness, material, 0.08);
      for (const origin of [12, 39]) g.line("Branching mineral vein", [[dx + origin, dz + height(origin)], [dx + origin + 3, dz + height(origin) - 5], [dx + origin + 9, dz + height(origin) - 7], [dx + origin + 12, dz + height(origin) - 11]], thickness * 0.65, material, 0.08);
    });
  }
}

function masonryBasket(g) {
  g.rectangle("Mortar bed", -4, -4, 72, 72, "shade", 0);
  for (let row = -1; row < 3; row++) for (let column = -1; column < 3; column++) for (let brick = 0; brick < 2; brick++) {
    const sideways = (column + row) % 2 !== 0;
    const x = column * 32 + (sideways ? 0 : brick * 16) + 0.5;
    const z = row * 32 + (sideways ? brick * 16 : 0) + 0.5;
    const w = sideways ? 31 : 15, d = sideways ? 15 : 31;
    const tone = ["main", "grain", "light", "main"][((column + row * 3 + brick) % 4 + 4) % 4];
    g.rectangle("Basket paving block", x, z, w, d, tone);
    g.line("Tumbled edge", [[x + 0.4, z + 1], [x + w - 0.4, z + 1]], 0.65, "highlight");
    g.line("Small mineral fracture", [[x + 3, z + d * 0.6], [x + 5, z + d * 0.55], [x + 7, z + d * 0.62]], 0.3, "shade");
  }
}

function ceramicFloor(g, variant) {
  if (variant.id === "octagon") {
    g.rectangle("Ivory diamond field", -4, -4, 72, 72, "light", 0);
    for (let row = -1; row < 5; row++) for (let column = -1; column < 5; column++) {
      const x = column * 16, z = row * 16;
      const points = [[3.8, 0.4], [12.2, 0.4], [15.6, 3.8], [15.6, 12.2], [12.2, 15.6], [3.8, 15.6], [0.4, 12.2], [0.4, 3.8]];
      g.polygon("Octagonal glaze", points.map(([px, pz]) => [x + px, z + pz]), "main");
      g.line("Glaze glint", [[x + 4, z + 1.3], [x + 12, z + 1.3]], 0.6, "highlight");
      g.polygon("Diamond inset", [[x - 1.5, z], [x, z - 1.5], [x + 1.5, z], [x, z + 1.5]], "shade", 0.04);
    }
  } else {
    const checker = variant.id === "checker";
    g.tiles(checker ? 16 : 32, checker ? 16 : 32, 0.65, (x, z, w, d, c, r) => {
      g.rectangle("Ceramic glaze", x, z, w, d, checker && (c + r) % 2 ? "light" : "main");
      g.line("Glazed edge", [[x + 1, z + 1], [x + w - 1, z + 1]], 0.55, "highlight");
      if (!checker) g.line("Soft glaze reflection", [[x + w * 0.62, z + 4], [x + w * 0.85, z + 4]], 1.1, "light");
    });
  }
}

function terrazzoFloor(g, variant) {
  const fine = variant.id === "fine";
  g.chips(fine ? 210 : 84, fine ? 0.72 : 1.7, ["light", "grain", "accent1", "accent2", "shade"]);
  g.chips(80, 0.3, ["light", "highlight"], 0.06);
  if (variant.id === "brass") {
    for (const x of [0, 64]) g.rectangle("Brass divider", x - 0.3, -4, 0.6, 72, "accent2", 0.08);
    for (const z of [0, 64]) g.rectangle("Brass divider", -4, z - 0.3, 72, 0.6, "accent2", 0.08);
  }
}

function buildMineralFloor(g, asset, variant) {
  if (asset.id === "floor-ceramic") ceramicFloor(g, variant);
  else if (asset.id === "floor-stone-tiles") {
    const limestone = variant.id === "limestone";
    g.tiles(32, limestone ? 16 : 32, 0.8, (x, z, w, d, c, r) => {
      g.rectangle("Cut stone tile", x, z, w, d, (c + r) % 2 ? "main" : "grain");
      g.line("Cut edge light", [[x + 0.4, z + 0.7], [x + w - 0.4, z + 0.7]], 0.45, "highlight");
      if (variant.id === "slate") for (let seam = 0; seam < 3; seam++) g.line("Slate cleavage", [[x + 3, z + 5 + seam * 7], [x + 10, z + 4 + seam * 7], [x + w - 4, z + 6 + seam * 7]], 0.45, "light");
    }, limestone ? 16 : 0);
    if (variant.id === "marble") marbleVeins(g, "shade", 0.4);
    else if (limestone) g.chips(95, 0.38, ["light", "highlight"]);
  } else if (asset.id === "floor-stone") {
    stoneCells(g, variant.id === "river" ? 6 : 3, variant.id === "slate" ? 5 : variant.id === "river" ? 6 : 3, variant.id === "river");
    g.chips(35, 0.42, ["highlight", "grain"], 0.06);
  } else if (asset.id === "floor-terrazzo") terrazzoFloor(g, variant);
  else if (asset.id === "floor-concrete") {
    if (variant.id === "slabs") g.tiles(32, 32, 0.8, (x, z, w, d, c, r) => {
      g.rectangle("Concrete slab", x, z, w, d, (c + r) % 2 ? "main" : "grain");
      g.ellipse("Troweled slab", x + 12, z + 9, 8, 2.3, "grain", 0.04, 16);
      g.ellipse("Troweled slab", x + 20, z + 22, 7, 2, "grain", 0.04, 16);
    });
    if (variant.id === "aggregate") g.chips(170, 1.1, ["light", "grain", "shade"]);
    else {
      if (variant.id === "smooth") g.scatter(18, (x, z, scale) => g.repeat((dx, dz) => g.ellipse("Troweled cloud", x + dx, z + dz, scale * 6, scale * 1.8, "grain", 0.04, 16)));
      g.chips(70, 0.25, ["light", "shade"], 0.07);
    }
  } else if (asset.id === "floor-brick" || asset.id === "floor-pavers") {
    if (variant.id === "herringbone") floorHerringbone(g, false, false);
    else if (variant.id === "basket") masonryBasket(g);
    else if (variant.id === "cobble") stoneCells(g, 6, 6, true);
    else g.tiles(asset.id === "floor-brick" ? 16 : 32, asset.id === "floor-brick" ? 8 : 16, asset.id === "floor-brick" ? 0.8 : 1, (x, z, w, d, c, r) => {
      g.rectangle("Paving face", x, z, w, d, ["main", "grain", "light"][((c + r) % 3 + 3) % 3]);
      g.line("Worn brick arris", [[x + 0.6, z + 0.7], [x + w - 0.6, z + 0.7]], 0.5, "highlight");
    }, asset.id === "floor-brick" ? 8 : 16);
    g.chips(70, 0.27, ["light", "shade"], 0.08);
  }
}

module.exports = { buildMineralFloor, stoneCells, marbleVeins, terrazzoFloor };
