const { floorHerringbone } = require("./wood.cjs");
const { terrazzoFloor } = require("./mineral.cjs");

function pouredResin(g, metallic) {
  const sample = (x, z) => {
    const a = x * Math.PI / 32, b = z * Math.PI / 32;
    return Math.sin(a + 1.8 * Math.cos(b)) + 0.65 * Math.cos(2 * b + 1.6 * Math.sin(a)) + 0.4 * Math.sin(2 * a - b + 1) + 0.18 * Math.cos(3 * a + 2 * b);
  };
  const clip = (points, level, above) => {
    const result = [];
    for (let index = 0; index < points.length; index++) {
      const a = points[index], b = points[(index + 1) % points.length];
      const insideA = above ? a[2] >= level : a[2] <= level;
      const insideB = above ? b[2] >= level : b[2] <= level;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (level - a[2]) / (b[2] - a[2]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, level]);
      }
    }
    return result;
  };
  const bands = [[-0.6, "grain"], [0.3, "light"], [1.15, "highlight"]];
  const pools = bands.map(() => []), rims = [];
  for (let z = 0; z < 64; z += 2) for (let x = 0; x < 64; x += 2) {
    const corners = [[x, z], [x + 2, z], [x + 2, z + 2], [x, z + 2]].map(([px, pz]) => [px, pz, sample(px, pz)]);
    for (const triangle of [[corners[0], corners[1], corners[2]], [corners[0], corners[2], corners[3]]]) {
      for (const [index, [threshold]] of bands.entries()) {
        const points = clip(triangle, threshold, true);
        if (points.length > 2) pools[index].push(points.map(([px, pz]) => [px, pz]));
      }
      if (metallic) {
        const rim = clip(clip(triangle, -0.66, true), -0.60, false);
        if (rim.length > 2) rims.push(rim.map(([px, pz]) => [px, pz]));
      }
    }
  }
  for (const [index, [, color]] of bands.entries()) g.polygons("Pearlescent resin pool", pools[index], color, 0.02 + index * 0.006);
  if (metallic) g.polygons("Metallic flow edge", rims, "accent2", 0.05);
}

function coinFloor(g, pitch, radius) {
  for (let row = -1; row <= 64 / pitch; row++) for (let column = -1; column <= 64 / pitch; column++) {
    const x = (column + 0.5) * pitch, z = (row + 0.5) * pitch;
    g.ellipse("Coin recess", x, z + 0.3, radius + 0.35, radius + 0.35, "shade");
    g.ellipse("Raised coin", x, z, radius, radius, "grain", 0.05, 16);
    g.line("Coin rim light", [[x - radius * 0.55, z - radius * 0.55], [x, z - radius * 0.8], [x + radius * 0.55, z - radius * 0.55]], 0.4, "light", 0.07);
  }
}

function buildResilientFloor(g, asset, variant) {
  if (asset.id === "floor-vinyl") {
    if (variant.id === "parquet") floorHerringbone(g, false, false);
    else if (variant.id === "diamond") {
      for (let row = -1; row <= 4; row++) for (let column = -1; column <= 4; column++) {
        const x = column * 16, z = row * 16;
        g.polygon("Vinyl diamond", [[x, z - 8], [x + 8, z], [x, z + 8], [x - 8, z]], "shade");
      }
    } else terrazzoFloor(g, { id: "fine" });
  } else if (asset.id === "floor-pvc") {
    if (variant.id === "coins") coinFloor(g, 8, 2.4);
    else if (variant.id === "ribbed") {
      for (let x = -4; x <= 68; x += 4) {
        g.rectangle("PVC channel", x, -4, 1.1, 72, "shade");
        g.rectangle("Rounded rib highlight", x + 1.4, -4, 0.55, 72, "light", 0.05);
      }
    } else g.chips(220, 0.5, ["light", "shade", "accent1"]);
  } else if (asset.id === "floor-linoleum") {
    if (variant.id === "inlay") {
      g.tiles(32, 32, 0.35, (x, z, w, d, c, r) => {
        g.rectangle("Linoleum tile", x, z, w, d, (c + r) % 2 ? "grain" : "main");
        g.rectangle("Square inlay", x + 9, z + 9, w - 18, d - 18, "light", 0.04);
        g.rectangle("Inlay center", x + 10, z + 10, w - 20, d - 20, "main", 0.05);
      });
    } else if (variant.id === "stripes") {
      for (let x = -16; x <= 64; x += 16) {
        g.rectangle("Inlaid stripe", x, -4, 6, 72, "grain");
        g.rectangle("Fine stripe", x + 8, -4, 1.2, 72, "light", 0.04);
      }
    } else {
      g.scatter(36, (x, z, size) => g.repeat((dx, dz) => g.line("Linoleum marbling", [[x + dx - 5 * size, z + dz - 2], [x + dx, z + dz], [x + dx + 4 * size, z + dz - 0.7]], 1.2, "grain")));
      g.chips(95, 0.35, ["light", "grain"]);
    }
  } else if (asset.id === "floor-resin") {
    if (variant.id === "flake") g.chips(160, 0.7, ["light", "shade", "accent1"]);
    else pouredResin(g, variant.id === "metallic");
  } else if (asset.id === "floor-rubber") {
    if (variant.id === "studs") coinFloor(g, 16, 4.5);
    else if (variant.id === "gym") {
      g.tiles(32, 32, 0.65, (x, z, w, d, c, r) => g.rectangle("Rubber square", x, z, w, d, (c + r) % 2 ? "grain" : "main"));
      g.chips(110, 0.35, ["light", "shade"]);
    } else g.chips(360, 0.55, ["light", "grain", "shade"]);
  }
}

module.exports = { buildResilientFloor };
