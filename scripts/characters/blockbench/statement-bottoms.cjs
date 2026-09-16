function createStatementBottoms({ loft, patch, ellipsoid }, appearance) {
  const bottom = appearance.lowerBody;
  if (bottom === "velvet") {
    loft("Velvet skirt", "pelvis", [[21.5, 8.9, 5.4], [25, 8.1, 4.9], [29.4, 7.3, 4.5]], "trousers");
    loft("Velvet waistband", "pelvis", [[28.1, 7.5, 4.65], [29.6, 7.35, 4.55]], "trouserLight");
    patch("Velvet skirt drape", "left_thigh", [[-8.5, 24, 4.6], [-1, 25, 5.3], [-1.8, 17, 4.7], [-7.6, 18, 4.2]], "trousers");
    patch("Slit satin edge", "left_thigh", [[-1.7, 24, 5.45], [-1, 24, 5.45], [-1.8, 17, 4.85], [-2.5, 17, 4.85]], "trouserLight");
  }
  if (bottom === "starlight") {
    loft("Starlight skirt", "pelvis", [[21, 9.3, 5.8], [23, 8.8, 5.5], [29.4, 7.3, 4.5]], "trousers");
    loft("Silver skirt hem", "pelvis", [[20.8, 9.4, 5.9], [22, 9.25, 5.8]], "trouserLight");
    for (const x of [-5.5, -2, 2, 5.5]) patch("Starlight pleat", "pelvis", [[x - 0.4, 22.1, 5.4], [x + 0.4, 22.1, 5.4], [x * 0.76 + 0.3, 28.5, 4.5], [x * 0.76 - 0.3, 28.5, 4.5]], "trouserLight");
  }
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const x = side * 4;
    const thigh = `${prefix}_thigh`;
    const shin = `${prefix}_shin`;
    if (bottom === "cyber") {
      ellipsoid("Circuit cargo pocket", thigh, [x + side * 2.4, 22, 0.5], [1.3, 2.7, 2.6], "trousers");
      patch("Circuit leg stripe", thigh, [[x + side * 1.8, 16, 2.5], [x + side * 2.6, 16, 2.5], [x + side * 2.8, 25, 3.1], [x + side * 2, 25, 3.1]], "trouserLight");
      loft("Neon trouser cuff", shin, [[6, 2.3, 2.4, x], [7.2, 2.4, 2.5, x]], "trouserLight");
    }
    if (bottom === "pirate") {
      loft("Corsair breeches", thigh, [[16.5, 2.8, 2.9, x], [21, 3.7, 3.9, x], [26.5, 3.65, 3.95, x]], "trousers");
      for (const y of [18.5, 23]) patch("Corsair trouser stripe", thigh, [[x - 2, y, 3.5], [x + 2, y, 3.5], [x + 2, y + 0.85, 3.7], [x - 2, y + 0.85, 3.7]], "trouserLight");
      loft("Corsair leg wrap", shin, [[6, 2.4, 2.5, x], [11, 2.65, 2.8, x]], "trouserLight");
    }
    if (bottom === "astronaut") {
      ellipsoid("Pressure knee", shin, [x, 15, 1], [2.9, 2.4, 2.5], "trouserLight");
      ellipsoid("Utility thigh pouch", thigh, [x + side * 2.4, 22, 0.5], [1.3, 2.4, 2.7], "trouserLight");
      for (const y of [7, 10]) loft("Pressure leg rib", shin, [[y, 2.55, 2.6, x], [y + 0.9, 2.55, 2.6, x]], "trouserLight");
    }
    if (bottom === "dragon") {
      for (const y of [18, 22, 26]) patch("Thigh scale", thigh, [[x - 2.5, y, 3.65], [x, y - 3, 4], [x + 2.5, y, 3.65], [x, y + 1.2, 4]], "trouserLight");
      ellipsoid("Dragon knee guard", shin, [x, 14.8, 2.4], [2.7, 2.6, 1.5], "trouserLight");
      patch("Dragon shin plate", shin, [[x - 1.8, 13, 3.1], [x + 1.8, 13, 3.1], [x + 1.2, 6, 2.3], [x - 1.2, 6, 2.3]], "trouserLight");
    }
    if (bottom === "jester") {
      for (const y of [19, 24]) patch("Harlequin leg diamond", thigh, [[x, y + 2.1, 3.9], [x + 1.6, y, 3.7], [x, y - 2.1, 3.75], [x - 1.6, y, 3.7]], side < 0 ? "trouserLight" : "trousers");
      loft("Harlequin ankle ruff", shin, [[5, 2.8, 2.8, x], [7, 2.35, 2.5, x]], "shirt");
    }
    if (["frog", "sunset"].includes(bottom)) {
      loft("Shorts leg", thigh, [[20.8, 3.2, 3.5, x], [23, 3.5, 3.8, x], [27.3, 3.6, 3.95, x]], "trousers");
      loft("Turned shorts hem", thigh, [[20.6, 3.35, 3.65, x], [22.4, 3.55, 3.85, x]], "trouserLight");
      patch("Shorts pocket", thigh, [[x - 1.4, 26, 3.8], [x + 1.4, 26, 3.8], [x + 1.2, 23.5, 4.05], [x, 23, 4.15], [x - 1.2, 23.5, 4.05]], "trouserLight");
    }
    if (bottom === "biker") {
      for (const y of [18.5, 22.5]) {
        patch("Ripped denim opening", thigh, [[x - 1.7, y, 3.8], [x + 1.8, y + 0.5, 3.8], [x + 1.6, y + 1.5, 3.85], [x - 1.9, y + 1, 3.85]], "skin");
        patch("Denim frayed edge", thigh, [[x - 1.9, y + 1, 3.95], [x + 1.6, y + 1.5, 3.95], [x + 1.6, y + 1.95, 3.95], [x - 1.9, y + 1.45, 3.95]], "trouserLight");
      }
      loft("Denim ankle cuff", shin, [[5, 2.35, 2.4, x], [6.5, 2.4, 2.5, x]], "trouserLight");
    }
    if (["velvet", "starlight"].includes(bottom)) {
      loft("Evening stocking", shin, [[4.4, 2.2, 2.25, x], [9, 2.3, 2.4, x], [15.5, 2.75, 2.85, x]], "trousers");
      loft("Stocking top band", shin, [[14.3, 2.8, 2.9, x], [15.6, 2.8, 2.9, x]], "trouserLight");
    }
  }
}

module.exports = { createStatementBottoms };
