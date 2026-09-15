function createCharacterHeadwear(api, geometry, appearance) {
  const { ellipsoid, loft, patch, mesh } = geometry;
  if (appearance.headwear === "cap") {
    const cap = new api.THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    mesh("Star cap", "hair", cap.scale(17, 7, 12).translate(0, 75, 0), "jacketDark");
    ellipsoid("Cap brim", "hair", [0, 75, 10], [15, 0.9, 8], "jacketDark");
    patch("Cap star", "hair", [[0, 81.3, 10.8], [0.8, 79.6, 11.5], [2.5, 79.3, 11.6], [1.2, 78.2, 11.9], [1.6, 76.5, 12], [0, 77.3, 12.1], [-1.6, 76.5, 12], [-1.2, 78.2, 11.9], [-2.5, 79.3, 11.6], [-0.8, 79.6, 11.5]], "gold");
  } else if (appearance.headwear === "witch") {
    ellipsoid("Witch brim", "hair", [0, 77, 0], [21, 1, 15], "jacketDark");
    loft("Witch crown", "hair", [[77, 13, 9], [82, 9, 7, 0], [89, 4, 3, -3], [96, 0.1, 0.1, -8]], "jacketDark");
    loft("Hat ribbon", "hair", [[79, 11.5, 8], [81, 10, 7.5]], "hairShine");
    ellipsoid("Moon pin", "hair", [-3, 81, 7.5], [1.4, 1.5, 0.4], "gold", false);
  } else if (appearance.headwear === "beret") {
    ellipsoid("Soft beret", "hair", [-2, 79, 0], [18, 4, 12], "jacket");
    loft("Beret binding", "hair", [[75.3, 15.8, 10.5], [76.3, 16.1, 10.8]], "jacketDark");
    ellipsoid("Beret tip", "hair", [-3, 83, 0], [1, 2, 1], "jacketDark");
  } else if (appearance.headwear === "ribbon") {
    for (const side of [-1, 1]) {
      loft("Hair bow", "hair", [[76.5, 0.4, 0.4, side * 2.3, 4], [78, 3.8, 1.4, side * 5, 4], [81.7, 2.4, 1.2, side * 5.5, 3.8], [82.3, 0.1, 0.1, side * 4, 3.8]], "hairShine");
    }
    ellipsoid("Bow knot", "hair", [0, 79, 4], [1.8, 2, 2], "jacketDark");
  } else if (appearance.headwear === "catears") {
    for (const side of [-1, 1]) {
      loft("Cat ear", "hair", [[75, 5, 3, side * 11, 0], [79, 4, 2.5, side * 12, 0], [89, 0.1, 0.1, side * 14, 0]], "hairDark");
      patch("Cat ear inset", "hair", [[side * 9, 78, 2.7], [side * 15, 78, 2.7], [side * 14, 86, 1]], "jacketLight");
    }
  } else if (appearance.headwear === "blossom") {
    for (const [x, y, size] of [[-13, 72.5, 2.4], [-16, 69, 1.8]]) {
      for (let index = 0; index < 5; index++) {
        const angle = index * Math.PI * 2 / 5;
        ellipsoid("Blossom petal", "hair", [x + Math.cos(angle) * size, y + Math.sin(angle) * size, 8.2], [size * 0.85, size * 0.85, 0.7], "ribbon");
      }
      ellipsoid("Blossom heart", "hair", [x, y, 9], [0.8, 0.8, 0.4], "gold", false);
    }
    loft("Blossom tassel", "hair", [[60, 0.2, 0.2, -17, 6], [61, 0.8, 0.7, -17, 6], [67, 0.6, 0.5, -16.5, 6.5]], "gold");
  } else if (appearance.headwear === "goggles") {
    loft("Goggle strap", "hair", [[73.5, 15.5, 10.9], [75, 15.5, 10.9]], "leather");
    for (const side of [-1, 1]) {
      ellipsoid("Goggle rim", "hair", [side * 6, 76, 10.3], [4.7, 3.4, 1.6], "gold");
      ellipsoid("Goggle lens", "hair", [side * 6, 76.1, 11.6], [3.5, 2.4, 0.65], "tealDark", false);
      ellipsoid("Lens shine", "hair", [side * 6 - 1.2, 77, 12.15], [1.2, 0.65, 0.15], "white", false);
    }
    ellipsoid("Goggle bridge", "hair", [0, 76, 10.7], [1.8, 0.65, 0.8], "leather");
  }
}

module.exports = { createCharacterHeadwear };
