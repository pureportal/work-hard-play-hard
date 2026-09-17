function createRunwayBottoms({ loft, patch, ellipsoid }, appearance) {
  const style = appearance.lowerBody;
  if (["jellyfish", "phoenix", "lace"].includes(style)) {
    loft("Runway skirt", "pelvis", [[21, style === "jellyfish" ? 11 : 9.6, 6], [25, 9.2, 5.5], [29.5, 7.4, 4.6]], "trousers");
    loft("Runway waistband", "pelvis", [[28.5, 7.7, 4.8], [30, 7.4, 4.65]], "trouserLight");
  }
  if (style === "jellyfish") for (let index = 0; index < 10; index++) {
    const angle = index / 10 * Math.PI * 2;
    const x = Math.sin(angle) * 10, z = Math.cos(angle) * 5.8;
    const bone = x < 0 ? "left_thigh" : "right_thigh";
    loft("Jellyfish skirt streamer", bone, [[12 + index % 3 * 2, 0.1, 0.1, x + 1.3, z], [16, 0.8, 0.65, x - 0.5, z], [22, 1.2, 0.9, x, z]], "trouserLight");
  }
  if (style === "phoenix") for (let index = 0; index < 10; index++) {
    const angle = index / 10 * Math.PI * 2, x = Math.sin(angle), z = Math.cos(angle);
    patch("Phoenix skirt feather", "pelvis", [[x * 6 - 1.5, 29, z * 4.7], [x * 6 + 1.5, 29, z * 4.7], [x * 11 + 1.8, 22, z * 6.5], [x * 11, 18.8, z * 6.8], [x * 11 - 1.8, 22, z * 6.5]], index % 2 ? "trouserLight" : "trousers");
  }
  if (style === "lace") {
    patch("Lace asymmetric drape", "left_thigh", [[-8.7, 24, 4.9], [-0.5, 24, 6.3], [-1.2, 15.8, 4.4], [-7.6, 17, 4.5]], "trousers");
    for (const y of [18, 21, 24]) patch("Lace skirt motif", "left_thigh", [[-5, y + 1.1, 5.55], [-3.8, y, 5.8], [-5, y - 1.1, 5.55], [-6.2, y, 5.4]], "trouserLight");
  }
  for (const side of [-1, 1]) {
    const x = side * 4, prefix = side < 0 ? "left" : "right";
    const thigh = `${prefix}_thigh`, shin = `${prefix}_shin`;
    if (style === "disco") {
      loft("Disco bell bottom", shin, [[4.2, 3.8, 3.5, x], [6.5, 3.7, 3.4, x], [11, 2.7, 2.8, x], [15.5, 2.8, 2.9, x]], "trousers");
      patch("Disco trouser stripe", thigh, [[x - 0.5, 16, 2.9], [x + 0.5, 16, 2.9], [x + 0.7, 27, 3.9], [x - 0.7, 27, 3.9]], "trouserLight");
      for (const y of [7, 10.5]) patch("Disco flare sequin", shin, [[x, y + 1.1, 3.5], [x + 1.1, y, 3.5], [x, y - 1.1, 3.5], [x - 1.1, y, 3.5]], "white");
    }
    if (style === "satin") {
      patch("Satin trouser crease", thigh, [[x - 0.35, 16, 2.9], [x + 0.35, 16, 2.9], [x + 0.45, 27, 4], [x - 0.45, 27, 4]], "trouserLight");
      patch("Satin shin crease", shin, [[x - 0.3, 5, 2.35], [x + 0.3, 5, 2.35], [x + 0.35, 14.5, 2.9], [x - 0.35, 14.5, 2.9]], "trouserLight");
      loft("Satin turned hem", shin, [[4.5, 2.35, 2.4, x], [6, 2.4, 2.5, x]], "trouserLight");
    }
    if (style === "harness") {
      loft("Belted leather shorts", thigh, [[21, 3.45, 3.65, x], [24, 3.6, 3.9, x], [27.5, 3.65, 4, x]], "trousers");
      loft("Thigh strap", thigh, [[17, 2.95, 3.1, x], [18.3, 3.05, 3.15, x]], "trousers");
      patch("Shorts buckle strap", thigh, [[x + side * 1.8, 18, 2.9], [x + side * 2.7, 18, 2.9], [x + side * 2.7, 24, 3.3], [x + side * 1.8, 24, 3.5]], "trouserLight");
      ellipsoid("Shorts silver buckle", thigh, [x + side * 2.2, 21.5, 3.65], [0.7, 0.9, 0.35], "white", false);
    }
  }
}

module.exports = { createRunwayBottoms };
