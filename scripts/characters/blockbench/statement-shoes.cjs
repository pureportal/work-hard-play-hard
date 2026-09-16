function createCharacterFootwear({ ellipsoid, loft, patch }, appearance) {
  const shoes = appearance.shoes;
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const foot = `${prefix}_foot`;
    const x = side * 4;
    ellipsoid(`${prefix} sneaker sole`, foot, [x, 1.1, 1.4], [2.9, 1, 4.5], "sole");
    if (shoes === "festival") {
      ellipsoid(`${prefix} tabi foot`, foot, [x, 2.5, 1], [2.5, 1.5, 3.8], "shirt");
      loft(`${prefix} tabi sock`, foot, [[3, 2.1, 2.1, x], [6.5, 2.1, 2.1, x]], "shirt");
      ellipsoid(`${prefix} sandal strap`, foot, [x, 3.6, 2.7], [2.6, 0.6, 0.9], "shoe");
    } else if (["velvet", "sunset"].includes(shoes)) {
      ellipsoid("Evening foot", foot, [x, 3, 1.1], [2.35, 1.55, 3.65], "skin");
      ellipsoid("Sandal toe strap", foot, [x, 3.3, 3.4], [2.5, 0.65, 1.15], "shoe");
      loft("Ankle strap", foot, [[4.4, 2.25, 2.3, x], [5.6, 2.3, 2.35, x]], "shoe");
      ellipsoid("Ankle buckle", foot, [x + side * 2.15, 5, 0.7], [0.5, 0.65, 0.55], "gold", false);
      if (shoes === "velvet") {
        ellipsoid("Velvet closed toe", foot, [x, 2.6, 3.6], [2.6, 1.35, 2.2], "shoe");
        loft("Velvet heel", foot, [[0.2, 0.9, 1, x, -1.1], [3.8, 1, 1.2, x, -1.1]], "shoeDark");
      } else {
        patch("Crossed sandal strap", foot, [[x - 2, 3.7, 0.7], [x - 1.1, 4, 0.7], [x + 2, 3.7, 3.2], [x + 1.1, 4, 3.2]], "shoeTrim");
      }
    } else {
      ellipsoid(`${prefix} sneaker`, foot, [x, 2.4, 1.3], [2.85, 1.8, 4.3], "shoe");
      if (["street", "ranger", "arcane", "sailor", "cardigan", "kimono", "traveler"].includes(shoes)) {
        ellipsoid(`${prefix} sneaker tongue`, foot, [x, 4, 0.9], [2, 1.4, 2], "jacketLight");
        ellipsoid(`${prefix} shoelace`, foot, [x, 3.8, 2.5], [1.8, 0.35, 0.35], "white", false);
      }
    }
    if (["cyber", "pirate", "astronaut", "biker"].includes(shoes)) {
      loft("Boot shaft", foot, [[3, 2.65, 2.8, x], [8, 2.55, 2.6, x], [9, 2.35, 2.4, x]], "shoe");
      loft("Boot top trim", foot, [[8, 2.7, 2.8, x], [9.5, 2.7, 2.8, x]], shoes === "pirate" ? "shoeDark" : "shoeTrim");
    }
    if (shoes === "cyber") {
      for (const y of [4.5, 6.5]) patch("Neon boot strap", foot, [[x - 2, y, 2.7], [x + 2, y, 2.7], [x + 2, y + 0.75, 2.7], [x - 2, y + 0.75, 2.7]], "shoeTrim");
      ellipsoid("Neon toe cap", foot, [x, 2, 4.7], [2.35, 0.65, 0.9], "shoeTrim");
    }
    if (["pirate", "biker"].includes(shoes)) {
      loft("Boot ankle strap", foot, [[4.2, 2.8, 2.95, x], [5.4, 2.8, 2.95, x]], "shoeDark");
      ellipsoid("Boot square buckle", foot, [x + side * 2.4, 4.9, 1.4], [0.55, 0.85, 0.7], shoes === "pirate" ? "gold" : "white", false);
      if (shoes === "biker") for (const offset of [-1.3, 0, 1.3]) ellipsoid("Boot silver stud", foot, [x + offset, 8.7, 2.7], [0.45, 0.45, 0.35], "white", false);
    }
    if (shoes === "astronaut") {
      ellipsoid("Moonwalk toe shell", foot, [x, 3.1, 3.5], [3, 1.8, 2.4], "shoeTrim");
      for (const y of [4, 6.1]) patch("Pressure boot stripe", foot, [[x - 2.1, y, 2.85], [x + 2.1, y, 2.85], [x + 2.1, y + 0.8, 2.85], [x - 2.1, y + 0.8, 2.85]], "shoeDark");
    }
    if (shoes === "dragon") {
      loft("Dragon ankle scales", foot, [[3, 2.8, 2.9, x], [7.5, 2.5, 2.6, x]], "shoeDark");
      for (const offset of [-1.8, 0, 1.8]) loft("Dragon toe claw", foot, [[1.1, 0, 0, x + offset, 6.1], [2.3, 0.7, 1.9, x + offset, 4.8], [3.5, 0, 0, x + offset, 4.1]], "gold");
    }
    if (shoes === "jester") {
      loft("Curled jester toe", foot, [[1.8, 1.9, 2, x, 4.3], [3.4, 1.6, 1.5, x, 5.5], [5.8, 0.75, 0.7, x, 6.4], [7, 0, 0, x, 6.1]], "shoe");
      ellipsoid("Slipper bell", foot, [x, 6.8, 6.1], [0.9, 0.9, 0.9], "gold");
      loft("Slipper ankle ruff", foot, [[4, 2.7, 2.8, x], [5.6, 2.3, 2.4, x]], "shoeTrim");
    }
    if (shoes === "frog") {
      ellipsoid("Frog slipper toe", foot, [x, 3.2, 2.7], [3.2, 2.3, 3.2], "shoe");
      for (const offset of [-1.45, 1.45]) {
        ellipsoid("Slipper frog eye", foot, [x + offset, 5.1, 3.8], [1, 1.15, 0.9], "shoeTrim");
        ellipsoid("Slipper frog pupil", foot, [x + offset, 5.2, 4.6], [0.4, 0.55, 0.25], "ink", false);
      }
      patch("Slipper frog mouth", foot, [[x - 1.4, 2.7, 5.9], [x + 1.4, 2.7, 5.9], [x + 1, 2.2, 5.9], [x - 1, 2.2, 5.9]], "shoeDark");
    }
    if (shoes === "starlight") {
      ellipsoid("Silver platform", foot, [x, 1.8, 1.5], [2.95, 1.65, 4.4], "shoeDark");
      ellipsoid("Silver platform upper", foot, [x, 3.6, 1.6], [2.8, 1.6, 4.2], "shoe");
      loft("Platform ankle cuff", foot, [[4, 2.3, 2.5, x], [7, 2.45, 2.55, x]], "shoeTrim");
      ellipsoid("Platform star clasp", foot, [x, 5.7, 2.6], [0.8, 1, 0.35], "white", false);
    }
  }
}

module.exports = { createCharacterFootwear };
