const runwayShoes = {
  jellyfish({ ellipsoid, loft }, foot, x) {
    ellipsoid("Jelly slipper", foot, [x, 3.2, 2], [3.1, 2.1, 4.4], "shoe");
    for (const offset of [-1.8, 0, 1.8]) loft("Jelly toe frill", foot, [[1.8, 0.6, 0.7, x + offset, 6], [4.2, 0.7, 0.8, x + offset, 5.2], [5, 0.1, 0.1, x + offset, 4]], "shoeTrim");
    for (const offset of [-1, 1]) ellipsoid("Jelly slipper pearl", foot, [x + offset, 4.8, 3], [0.55, 0.55, 0.5], "white", false);
  },
  phoenix({ ellipsoid, loft, patch }, foot, x) {
    ellipsoid("Phoenix boot", foot, [x, 2.9, 1.7], [2.8, 1.9, 4.3], "shoe");
    loft("Phoenix ankle", foot, [[3, 2.5, 2.6, x], [8.5, 2.4, 2.5, x]], "shoeDark");
    for (const offset of [-1.6, 0, 1.6]) patch("Phoenix toe feather", foot, [[x + offset - 0.9, 4.5, 2], [x + offset, 5, 3.5], [x + offset + 0.9, 4, 5], [x + offset, 2.8, 6.1]], "shoeTrim");
    patch("Phoenix boot wing", foot, [[x + Math.sign(x) * 2, 4, 0], [x + Math.sign(x) * 5.7, 10, -1.5], [x + Math.sign(x) * 4.7, 4.5, -2], [x + Math.sign(x) * 2, 2.5, -1.5]], "gold");
  },
  disco({ ellipsoid, loft, patch }, foot, x) {
    ellipsoid("Disco platform", foot, [x, 2, 1.5], [3, 1.8, 4.4], "shoeDark");
    ellipsoid("Mirror boot toe", foot, [x, 4.1, 2.5], [2.9, 1.6, 3.5], "shoe");
    loft("Mirror boot shaft", foot, [[4, 2.55, 2.7, x], [10, 2.5, 2.6, x]], "shoe");
    for (const y of [5, 7.5, 10]) patch("Mirror boot tile", foot, [[x - 1.3, y - 0.7, 2.75], [x + 1.3, y - 0.7, 2.75], [x + 1.3, y + 0.7, 2.75], [x - 1.3, y + 0.7, 2.75]], "shoeTrim");
  },
  lace({ ellipsoid, loft, patch }, foot, x) {
    ellipsoid("Lace pump", foot, [x, 3, 2.7], [2.5, 1.4, 3.1], "shoe");
    loft("Lace ankle boot", foot, [[3, 2.2, 2.35, x], [10, 2.4, 2.5, x]], "shoeDark");
    loft("Satin heel", foot, [[0.2, 0.85, 0.85, x, -1.5], [4, 0.9, 1, x, -1.5]], "shoeDark");
    for (const y of [4.5, 6.5, 8.5]) for (const sign of [-1, 1]) patch("Crossed boot lace", foot, [[x + sign * 1.2, y, 2.65], [x + sign * 0.8, y - 0.35, 2.65], [x - sign * 1.2, y + 1.6, 2.65], [x - sign * 0.8, y + 1.95, 2.65]], "shoeTrim");
  },
  satin({ ellipsoid, patch }, foot, x) {
    ellipsoid("Satin loafer", foot, [x, 2.9, 1.8], [2.75, 1.65, 4.2], "shoe");
    ellipsoid("Loafer tongue", foot, [x, 4.1, 0.6], [2.15, 0.7, 1.7], "shoeDark");
    patch("Loafer gold bar", foot, [[x - 1.9, 4.3, 2.3], [x + 1.9, 4.3, 2.3], [x + 1.9, 4.8, 1.8], [x - 1.9, 4.8, 1.8]], "gold");
    ellipsoid("Patent toe shine", foot, [x - 0.7, 3.7, 4.3], [1.1, 0.35, 0.8], "shoeTrim", false);
  },
  harness({ ellipsoid, loft }, foot, x) {
    ellipsoid("Harness sandal foot", foot, [x, 3, 1.5], [2.4, 1.5, 3.8], "skin");
    for (const z of [1, 3.8]) ellipsoid("Harness sandal strap", foot, [x, 4, z], [2.55, 0.7, 0.8], "shoeDark");
    loft("Harness ankle cuff", foot, [[4.5, 2.35, 2.5, x], [7, 2.4, 2.55, x]], "shoeDark");
    ellipsoid("Sandal ring", foot, [x, 4.9, 2.35], [0.9, 0.4, 0.9], "shoeTrim", false);
    ellipsoid("Sandal side buckle", foot, [x + Math.sign(x) * 2.4, 5.8, 0.6], [0.5, 0.8, 0.7], "shoeTrim", false);
  },
};

module.exports = { runwayShoes };
