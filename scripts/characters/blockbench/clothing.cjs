function createCharacterClothing(geometry, appearance) {
  const { ellipsoid, loft, patch } = geometry;
  const top = appearance.upperBody;
  function trim(name, points, width, material) {
    for (let index = 0; index < points.length - 1; index++) {
      const [x, y, z] = points[index];
      const [nextX, nextY, nextZ] = points[index + 1];
      patch(name, "torso", [[x - width, y, z], [x + width, y, z], [nextX + width, nextY, nextZ], [nextX - width, nextY, nextZ]], material);
    }
  }
  if (top === "street") {
    loft("Bomber collar", "torso", [[43, 4.8, 3.4], [45.3, 4.1, 3]], "jacketDark");
    for (const side of [-1, 1]) {
      patch("Bomber facing", "torso", [[side * 3.2, 43.6, 4.4], [side * 4.7, 42.6, 4.4], [side * 3.8, 30.1, 5.4], [side * 2.8, 30.1, 5.5]], "jacketLight");
      patch("Welt pocket", "torso", [[side * 5.5, 33, 4.4], [side * 7.5, 35.2, 3.5], [side * 7.5, 36, 3.5], [side * 5.5, 33.8, 4.4]], "jacketDark");
    }
    patch("Jacket badge", "torso", [[5.5, 39, 4.8], [7.5, 39, 4], [6.7, 41.5, 4.3]], "gold");
    patch("Back yoke", "torso", [[-7, 41.5, -3.1], [7, 41.5, -3.1], [6, 39.5, -4.1], [-6, 39.5, -4.1]], "jacketLight");
  }
  if (top === "ranger") {
    loft("Ranger collar", "torso", [[43, 5.5, 3.8], [46, 4.5, 3.4]], "jacketDark");
    for (const side of [-1, 1]) {
      ellipsoid("Utility pocket", "torso", [side * 5.8, 34, 4.45], [2.2, 2.3, 0.75], "jacketDark");
      patch("Pocket flap", "torso", [[side * 3.8, 35.2, 5.3], [side * 7.1, 35.2, 4.4], [side * 5.6, 34.3, 5.45]], "jacketLight");
    }
    trim("Crossbody strap", [[-5, 44.1, 4.5], [-3, 41, 5.85], [0, 37.5, 6.05], [3, 33.6, 6], [5.2, 30.5, 5]], 0.8, "leather");
    ellipsoid("Strap buckle", "torso", [0.6, 37.8, 6.3], [1.2, 1.4, 0.4], "gold", false);
    trim("Back strap", [[-5, 44.1, -2.5], [-3, 41, -4.7], [0, 37.5, -5.4], [3, 33.6, -4.8], [5.2, 30.5, -3.65]], 0.8, "leather");
  }
  if (top === "arcane") {
    loft("High moon collar", "torso", [[42.5, 5.5, 4], [46, 4.5, 3.5]], "jacketDark");
    for (const side of [-1, 1]) {
      ellipsoid("Moon pauldron", `${side < 0 ? "left" : "right"}_arm`, [side * 10.1, 43.8, 0], [4.1, 2.1, 3.8], "jacketLight");
      patch("Moon facing", "torso", [[side * 3, 44, 4.5], [side * 7, 40.5, 4.5], [side * 5.8, 29.8, 4.8], [side * 2.7, 31, 5.8]], "jacketDark");
      patch("Gold piping", "torso", [[side * 3, 43.5, 4.7], [side * 3.6, 43.1, 4.9], [side * 3.5, 31.5, 5.8], [side * 2.9, 31.2, 5.8]], "gold");
    }
    ellipsoid("Moon brooch", "torso", [0, 41, 6.1], [1.35, 1.7, 0.5], "gold");
    ellipsoid("Brooch jewel", "torso", [0, 41.2, 6.6], [0.7, 1, 0.25], "teal", false);
    patch("Back moon", "torso", [[0, 40.5, -5], [2.7, 37, -5.25], [0, 33.5, -5], [-2.7, 37, -5.25]], "gold");
  }
  if (top === "sailor") {
    for (const side of [-1, 1]) {
      patch("Sailor collar", "torso", [[0, 38, 6.2], [side * 8, 42.5, 4.1], [side * 3.3, 45, 4]], "jacketDark");
      patch("Collar braid", "torso", [[side * 0.9, 39.2, 6.25], [side * 7, 42.8, 4.6], [side * 6.4, 43.2, 4.65], [side * 0.9, 40, 6.25]], "shirt");
      patch("Sailor bow", "torso", [[0, 39, 6.55], [side * 3, 40.1, 6.55], [side * 2.8, 37.2, 6.55]], "ribbon");
    }
    patch("Sailor back collar", "torso", [[-7.2, 43, -3.5], [7.2, 43, -3.5], [6.2, 37, -4.7], [-6.2, 37, -4.7]], "jacketDark");
    patch("Back collar braid", "torso", [[-5.5, 38.4, -4.85], [5.5, 38.4, -4.85], [5.5, 39.1, -4.85], [-5.5, 39.1, -4.85]], "shirt");
  }
  if (top === "cardigan") {
    for (const side of [-1, 1]) {
      patch("Knit facing", "torso", [[side * 3.3, 44, 4.4], [side * 4.9, 42, 4.5], [side * 1.6, 35, 6], [side * 1.6, 28.8, 5.1], [0, 28.8, 5.4], [0, 35, 6]], "jacketDark");
      ellipsoid("Knit pocket", "torso", [side * 5.7, 32.5, 4.1], [2, 2, 0.65], "jacketLight");
    }
    for (const y of [30.7, 33.6, 36.5]) ellipsoid("Cardigan button", "torso", [0, y, 6.1], [0.65, 0.65, 0.3], "gold", false);
  }
  if (top === "kimono") {
    for (const side of [-1, 1]) {
      trim("Kimono collar", [[side * 3.1, 44.5, 4], [side * 3.4, 42, 4.6], [0, 38.3, 5.45], [-side * 3.7, 34.2, 5.1]], 0.7, "shirt");
      const arm = `${side < 0 ? "left" : "right"}_forearm`;
      loft("Kimono sleeve drape", arm, [[27, 3.6, 4.2, side * 11], [29, 4, 4.8, side * 11], [35.5, 3.1, 3.4, side * 10.9]], "jacket");
      loft("Kimono sleeve border", arm, [[27, 3.7, 4.3, side * 11], [28.3, 3.9, 4.5, side * 11]], "jacketLight");
    }
    loft("Obi sash", "torso", [[29.9, 8.1, 5.1], [34, 8.7, 5.6]], "ribbon");
    loft("Obi cord", "torso", [[31.5, 8.5, 5.5], [32.3, 8.6, 5.6]], "gold");
    for (const side of [-1, 1]) ellipsoid("Obi bow", "torso", [side * 3, 32.7, -5], [3.4, 2.5, 1.4], "ribbon");
  }
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const legX = side * 4;
    const wide = ["kimono", "sailor"].includes(appearance.lowerBody);
    patch("Trouser fold", `${prefix}_thigh`, [[legX - 0.5, 17, 3.05], [legX + 0.2, 17, 3.1], [legX + 0.9, 25.8, 3.75], [legX - 0.1, 25.8, 3.9]], "trouserLight");
    if (wide) loft("Trouser hem", `${prefix}_shin`, [[5, 2.55, 2.5, legX], [6.2, 2.65, 2.6, legX]], "trouserLight");
    if (["ranger", "arcane"].includes(appearance.shoes)) {
      loft("Boot shaft", `${prefix}_foot`, [[3.1, 2.6, 2.7, legX], [9, 2.5, 2.45, legX]], "shoe");
      loft("Boot cuff", `${prefix}_foot`, [[8.1, 2.7, 2.65, legX], [9.5, 2.8, 2.7, legX]], "leather");
      ellipsoid("Boot buckle", `${prefix}_foot`, [legX + side * 1.6, 7.8, 2.2], [0.75, 0.8, 0.4], "gold", false);
    }
  }
}

module.exports = { createCharacterClothing };
