const { stoneCells } = require("./mineral.cjs");

function grassFloor(g, variant, artificial) {
  const long = !artificial && variant.id === "dry";
  const medium = !artificial && variant.id === "meadow";
  const length = artificial ? variant.id === "soft" ? 2.3 : 1.4 : long ? 6 : medium ? 4 : 2;
  if (artificial && variant.id === "stripes") {
    for (let x = 0; x < 64; x += 32) g.rectangle("Mown turf stripe", x, -4, 16, 72, "grain", 0.01);
  }
  g.scatter(artificial ? 270 : long ? 125 : medium ? 170 : 225, (x, z, scale, index, random) => {
    const lean = (artificial ? 0.25 : random() - 0.5) * length;
    const tall = length * scale;
    g.repeat((dx, dz) => {
      const bx = x + dx, bz = z + dz;
      if (!artificial) g.polygon("Tuft shade", [[bx - 1.5, bz + 0.5], [bx + 1.8, bz + 0.5], [bx + lean * 0.6, bz - tall * 0.6]], "shade", 0.025);
      const bladeWidth = artificial ? 0.45 : medium || long ? 1.1 : 0.5;
      g.polygon(artificial ? "Turf fiber" : "Tapered grass blade", [[bx - bladeWidth, bz + 0.3], [bx + bladeWidth, bz + 0.3], [bx + lean + bladeWidth * 0.4, bz - tall * 0.55], [bx + lean, bz - tall], [bx + lean - bladeWidth * 0.5, bz - tall * 0.5]], index % 3 ? "grain" : "light", 0.05);
      if (medium || long) {
        g.polygon("Side grass blade", [[bx - 1, bz + 0.4], [bx + 0.5, bz + 0.4], [bx - tall * 0.22, bz - tall * 0.4], [bx - tall * 0.6, bz - tall * 0.62], [bx - tall * 0.38, bz - tall * 0.3]], index % 2 ? "light" : "highlight", 0.07);
        if (long && index % 9 === 0) g.line("Dry seed head", [[bx + lean, bz - tall], [bx + lean - 0.7, bz - tall - 1.2], [bx + lean + 0.4, bz - tall - 0.5]], 0.55, "highlight", 0.08);
      }
    });
  });
}

function buildLandscapeFloor(g, asset, variant) {
  if (asset.id === "floor-grass" || asset.id === "floor-artificial-grass") grassFloor(g, variant, asset.id === "floor-artificial-grass");
  else if (variant.id === "crushed") {
    g.chips(240, 1.4, ["light", "grain", "shade"]);
    g.chips(140, 0.4, ["highlight", "main"], 0.07);
  } else if (variant.id === "river") stoneCells(g, 10, 10, true);
  else {
    g.scatter(330, (x, z, size, index) => g.repeat((dx, dz) => {
      g.ellipse("Pea gravel shade", x + dx, z + dz + 0.25, size * 1.1, size * 0.8, "shade", 0.02, 8);
      g.ellipse("Smooth pea gravel", x + dx, z + dz, size, size * 0.7, index % 3 ? "grain" : "light", 0.05, 8);
    }));
  }
}

module.exports = { buildLandscapeFloor };
