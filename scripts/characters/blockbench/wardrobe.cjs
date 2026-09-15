function createCharacterWardrobe(geometry, appearance) {
  const { ellipsoid, loft, patch } = geometry;
  if (appearance.upperBody === "traveler") {
    loft("Travel scarf collar", "torso", [[42.7, 5.8, 4.1], [45.7, 5, 3.5], [46.4, 3.2, 2.8]], "ribbon");
    ellipsoid("Scarf knot", "torso", [-4.6, 43, -3.4], [2.3, 2, 2], "ribbon");
    loft("Trailing scarf", "scarf", [[30, 0.1, 0.1, -11, -7.5], [32, 2.2, 0.6, -10, -7.8], [38, 2.5, 0.7, -7.5, -7], [43.5, 1.6, 0.7, -5, -4]], "ribbon");
    patch("Scarf edging", "scarf", [[-12, 32.5, -8.5], [-8, 32.5, -8.5], [-7.8, 33.2, -8.5], [-11.8, 33.2, -8.5]], "gold");
    for (const side of [-1, 1]) {
      patch("Travel lapel", "torso", [[side * 3, 43.5, 4.6], [side * 7.1, 40, 4.4], [side * 3.7, 35.8, 5.8]], "jacketLight");
      ellipsoid("Travel pocket", "torso", [side * 5.7, 32.4, 4.5], [2.1, 2.2, 0.75], "jacketDark");
      ellipsoid("Pocket clasp", "torso", [side * 5.7, 33.7, 5.1], [0.65, 0.65, 0.3], "gold", false);
    }
    loft("Travel belt", "torso", [[29.7, 8.1, 5], [31.2, 8.4, 5.3]], "leather");
    ellipsoid("Belt buckle", "torso", [0, 30.5, 5.5], [1.3, 0.9, 0.3], "gold", false);
  }
  if (appearance.upperBody === "festival") {
    for (const side of [-1, 1]) {
      const arm = `${side < 0 ? "left" : "right"}_forearm`;
      loft("Haori sleeve", arm, [[27.5, 3.5, 3.7, side * 11], [30, 3.9, 4.2, side * 11], [35.5, 3.1, 3.2, side * 10.9]], "jacket");
      loft("Haori cuff", arm, [[27.3, 3.5, 3.8, side * 11], [29, 3.9, 4.3, side * 11]], "jacketDark");
      patch("Haori facing", "torso", [[side * 3, 44, 4.5], [side * 5.1, 42, 4.5], [side * 4, 29.8, 5.1], [side * 2.4, 29.8, 5.4]], "jacketDark");
      patch("Facing braid", "torso", [[side * 3.4, 42.9, 4.9], [side * 3.9, 42.4, 5], [side * 3.2, 30, 5.5], [side * 2.7, 30, 5.5]], "gold");
      patch("Sleeve crest", arm, [[side * 11, 30, 4.35], [side * 13, 32, 4.2], [side * 11, 34, 3.65], [side * 9, 32, 4.2]], "jacketLight");
    }
    patch("Haori back crest", "torso", [[0, 42, -4], [3, 39, -4.8], [0, 35.4, -5.2], [-3, 39, -4.8]], "gold");
    for (const side of [-1, 1]) ellipsoid("Haori cord", "torso", [side * 1.3, 36.3, 6.1], [1.5, 0.45, 0.4], "gold", false);
  }
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const x = side * 4;
    if (appearance.lowerBody === "traveler") {
      ellipsoid("Breeches pocket", `${prefix}_thigh`, [x + side * 2.1, 22, 1.5], [1.2, 2.4, 2.3], "trouserLight");
      loft("Breeches cuff", `${prefix}_shin`, [[9, 2.45, 2.55, x], [11.2, 2.6, 2.7, x]], "trouserLight");
    }
    if (appearance.lowerBody === "festival") {
      for (const offset of [-1.1, 1.1]) patch("Hakama pleat", `${prefix}_thigh`, [[x + offset - 0.25, 16, 2.8], [x + offset + 0.25, 16, 2.8], [x + offset + 0.4, 26, 3.9], [x + offset - 0.4, 26, 3.9]], "trouserLight");
      loft("Hakama hem", `${prefix}_shin`, [[5.5, 2.6, 2.6, x], [7, 2.7, 2.7, x]], "trouserLight");
    }
    if (appearance.shoes === "traveler") {
      loft("Travel boot", `${prefix}_foot`, [[3.1, 2.6, 2.7, x], [10, 2.45, 2.4, x]], "shoe");
      loft("Turned boot cuff", `${prefix}_foot`, [[8.8, 2.7, 2.65, x], [10.5, 2.8, 2.7, x]], "shirt");
      ellipsoid("Travel boot clasp", `${prefix}_foot`, [x + side * 2, 7, 1.9], [0.6, 1, 0.4], "gold", false);
    }
  }
}

module.exports = { createCharacterWardrobe };
