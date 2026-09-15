function wovenFloor(g, style, coarse = false) {
  const pitch = coarse ? 4 : 2;
  if (style === "basket") {
    for (let row = -1; row <= 8; row++) for (let column = -1; column <= 8; column++) {
      const sideways = (row + column) % 2 !== 0;
      const x = column * 8, z = row * 8;
      g.rectangle("Woven block", x, z, 8, 8, sideways ? "grain" : "main");
      for (const offset of [1.5, 4, 6.5]) g.line("Interlaced fiber", sideways ? [[x + 0.3, z + offset], [x + 7.7, z + offset]] : [[x + offset, z + 0.3], [x + offset, z + 7.7]], coarse ? 1 : 0.65, "light");
    }
  } else if (style === "herringbone") {
    const size = coarse ? 2 : 1;
    for (let row = -2; row <= 18 / size; row++) for (let column = -1; column <= 8 / size; column++) {
      const x = column * 8 * size, z = row * 4 * size;
      g.line("Woven chevron", [[x, z], [x + 4 * size, z + 3 * size], [x + 8 * size, z]], 1.1 * size, row % 2 ? "light" : "grain");
      g.line("Fiber shadow", [[x, z + 1.5 * size], [x + 4 * size, z + 4.5 * size], [x + 8 * size, z + 1.5 * size]], 0.4 * size, "shade");
    }
  } else if (style === "loops") {
    for (let row = -1; row <= 16; row++) for (let column = -1; column <= 16; column++) {
      const x = column * 4 + (row % 2 ? 2 : 0), z = row * 4;
      g.ellipse("Fiber loop", x, z, 1.4, 1.8, "light");
      g.ellipse("Loop hollow", x + 0.1, z + 0.2, 0.65, 1, "grain", 0.06);
    }
  } else {
    for (let x = -2; x <= 66; x += pitch) {
      g.rectangle("Sisal warp", x, -4, pitch * 0.38, 72, "light", 0.02);
      for (let z = -2; z <= 66; z += 8) g.rectangle("Cross binding", x, z + (x % 4 ? 4 : 0), pitch * 0.7, 0.65, "grain", 0.05);
    }
  }
}

function buildTextileFloor(g, asset, variant) {
  if (asset.id === "floor-sisal" || asset.id === "floor-jute") {
    wovenFloor(g, variant.id, asset.id === "floor-jute");
  } else if (asset.id === "floor-carpet") {
    if (variant.id === "tiles") {
      for (let row = -1; row < 3; row++) for (let column = -1; column < 3; column++) {
        const x = column * 32, z = row * 32, sideways = (row + column) % 2 !== 0;
        g.rectangle("Carpet square", x, z, 32, 32, sideways ? "grain" : "main");
        for (let stripe = 2; stripe < 32; stripe += 2) g.line("Directional pile", sideways ? [[x + stripe, z], [x + stripe, z + 32]] : [[x, z + stripe], [x + 32, z + stripe]], 0.45, "light");
      }
    } else if (variant.id === "ribbed") wovenFloor(g, "ribbed");
    else {
      g.scatter(380, (x, z, size, index) => g.repeat((dx, dz) => {
        g.line("Soft tuft", [[x + dx - 0.45, z + dz + 0.4], [x + dx, z + dz - size * 0.5], [x + dx + 0.45, z + dz + 0.2]], 0.65, index % 3 ? "grain" : "light");
      }));
    }
  } else if (asset.id === "floor-cork") {
    if (variant.id === "blocks") g.tiles(16, 32, 0.4, (x, z, w, d, c, r) => g.rectangle("Cork block", x, z, w, d, (c + r) % 2 ? "main" : "grain"), 8);
    if (variant.id === "mosaic") g.tiles(8, 8, 0.25, (x, z, w, d, c, r) => g.rectangle("Pressed cork square", x, z, w, d, ["main", "grain", "light"][((c * 3 + r) % 3 + 3) % 3]));
    g.chips(variant.id === "natural" ? 260 : 155, variant.id === "natural" ? 0.8 : 1.2, ["light", "shade", "grain"], 0.05);
    g.chips(130, 0.3, ["highlight", "shade"], 0.07);
  }
}

module.exports = { buildTextileFloor };
