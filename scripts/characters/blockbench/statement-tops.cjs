const statementTops = {
  cyber({ loft, patch, ellipsoid }) {
    loft("Runner collar", "torso", [[42, 5.4, 3.9], [46.1, 4.1, 3.1]], "jacketDark");
    for (const side of [-1, 1]) {
      patch("Neon chest circuit", "torso", [[side * 2, 44, 4.5], [side * 6.6, 41.5, 4.6], [side * 6.1, 37, 5], [side * 5.1, 37, 5.5], [side * 5.5, 41, 5.2], [side * 1.8, 43, 4.9]], "jacketLight");
      const forearm = `${side < 0 ? "left" : "right"}_forearm`;
      loft("Neon wrist band", forearm, [[29.6, 3, 3, side * 11], [30.6, 3.05, 3.05, side * 11]], "jacketLight");
      ellipsoid("Runner shoulder pad", `${side < 0 ? "left" : "right"}_arm`, [side * 10.2, 43.5, 0], [3.8, 1.8, 3.7], "jacketDark");
    }
    patch("Neon zip", "torso", [[-0.45, 30, 5.5], [0.45, 30, 5.5], [0.45, 42, 5.25], [-0.45, 42, 5.25]], "jacketLight");
    patch("Runner back chevron", "torso", [[-6.5, 40.5, -4], [0, 36, -5.4], [6.5, 40.5, -4], [6, 38.3, -4.6], [0, 34.2, -5.3], [-6, 38.3, -4.6]], "jacketLight");
  },
  pirate({ loft, patch, ellipsoid }) {
    loft("Corsair standing collar", "torso", [[42.3, 6, 4.1], [46.2, 5, 3.5]], "jacketDark");
    for (const side of [-1, 1]) {
      patch("Corsair lapel", "torso", [[side * 2.7, 45, 3.9], [side * 7.5, 40.7, 4.3], [side * 3.5, 35, 5.8]], "jacketLight");
      for (const y of [32, 35, 38]) ellipsoid("Brass coat button", "torso", [side * 4.5, y, 5.1], [0.65, 0.65, 0.35], "gold", false);
      loft("Corsair turned cuff", `${side < 0 ? "left" : "right"}_forearm`, [[27, 3, 3, side * 11], [31, 3.5, 3.5, side * 11]], "jacketDark");
      patch("Coat tail", "torso", [[side * 3, 29, -4.7], [side * 7.5, 30, -3.7], [side * 9.5, 21, -4.7], [side * 3.5, 23, -6.3]], "jacket");
    }
    patch("Corsair shirt", "torso", [[-2.8, 43, 4.8], [2.8, 43, 4.8], [2.8, 31, 5.65], [-2.8, 31, 5.65]], "shirt");
    loft("Corsair sash", "torso", [[29, 8.1, 5], [31.5, 8.7, 5.4]], "jacketDark");
    ellipsoid("Corsair buckle", "torso", [0, 30, 5.8], [1.5, 1, 0.45], "gold", false);
  },
  astronaut({ loft, patch, ellipsoid }) {
    loft("Pressure collar", "torso", [[43, 5.8, 4.3], [46, 5.1, 3.9]], "jacketDark");
    ellipsoid("Life support pack", "torso", [0, 37.3, -6], [6.4, 7.2, 2.7], "jacketLight");
    patch("Chest console", "torso", [[-4, 35, 5.7], [4, 35, 5.7], [4, 41, 5.2], [-4, 41, 5.2]], "ink");
    patch("Console display", "torso", [[-2.8, 38, 5.85], [2.8, 38, 5.85], [2.8, 40, 5.6], [-2.8, 40, 5.6]], "teal");
    for (const side of [-1, 1]) {
      ellipsoid("Console dial", "torso", [side * 1.7, 36.3, 6], [0.75, 0.75, 0.3], "gold", false);
      loft("Pressure wrist seal", `${side < 0 ? "left" : "right"}_forearm`, [[27.5, 2.8, 2.9, side * 11], [30.5, 3.2, 3.2, side * 11]], "jacketDark");
      ellipsoid("Padded shoulder", `${side < 0 ? "left" : "right"}_arm`, [side * 10.2, 42.5, 0], [4, 3.1, 3.9], "jacketLight");
      loft("Oxygen cylinder", "torso", [[31, 0, 0, side * 4, -8], [32, 1.7, 1.7, side * 4, -8], [42, 1.7, 1.7, side * 4, -8], [43, 0, 0, side * 4, -8]], "jacketDark");
    }
  },
  dragon({ loft, patch, ellipsoid }) {
    for (const side of [-1, 1]) {
      const arm = `${side < 0 ? "left" : "right"}_arm`;
      ellipsoid("Dragon pauldron", arm, [side * 10.1, 43, 0], [4.5, 3, 4], "jacketDark");
      loft("Shoulder horn", arm, [[43, 2, 1.7, side * 12, 0], [46, 1.1, 0.9, side * 13, -0.4], [49, 0, 0, side * 14, -1]], "gold");
      for (const y of [32, 36, 40]) patch("Dragon scale", "torso", [[side * 0.3, y + 2, 5.8], [side * 5.4, y + 1, 5.1], [side * 3.4, y - 2, 5.8]], "jacketLight");
    }
    for (const y of [32, 37, 42]) loft("Dorsal spike", "torso", [[y - 2, 0, 0, 0, -5], [y, 2.4, 3.2, 0, -6], [y + 3, 0, 0, 0, -8]], "gold");
    loft("Dragon gorget", "torso", [[42, 5.5, 4.1], [45.6, 4.3, 3.5]], "jacketDark");
    ellipsoid("Dragon emerald", "torso", [0, 42.5, 5.4], [1.3, 1.6, 0.7], "gold");
  },
  jester({ loft, patch, ellipsoid }) {
    loft("Harlequin ruff", "torso", [[43.5, 6.7, 4.4], [45, 4.4, 3.3], [46, 3.5, 2.8]], "shirt");
    for (const side of [-1, 1]) {
      for (const y of [33.5, 39]) patch("Harlequin diamond", "torso", [[side * 4, y + 2.7, 5.25], [side * 6.7, y, 4.6], [side * 4, y - 2.7, 5.4], [side * 1.3, y, 5.8]], "jacketLight");
      const arm = `${side < 0 ? "left" : "right"}_forearm`;
      loft("Jester flared cuff", arm, [[27, 3.6, 3.6, side * 11], [29.7, 2.9, 2.9, side * 11]], "shirt");
      patch("Tunic pennant", "torso", [[side * 1, 29.2, 5.5], [side * 7, 30, 4.8], [side * 5.7, 25, 5.5]], "jacketLight");
      ellipsoid("Tunic bell", "torso", [side * 5.7, 25, 5.5], [0.9, 0.9, 0.9], "gold");
    }
    for (const y of [33, 38, 42]) ellipsoid("Jester pompom", "torso", [0, y, 6.1], [1, 1, 0.8], "shirt");
    patch("Harlequin back diamond", "torso", [[0, 42, -4.2], [4, 37, -4.9], [0, 31, -5], [-4, 37, -4.9]], "jacketLight");
  },
  frog({ loft, patch, ellipsoid }) {
    ellipsoid("Froggy hood", "torso", [0, 44, -3.8], [8.2, 6.4, 4], "jacket");
    ellipsoid("Froggy belly pocket", "torso", [0, 34.8, 5], [5.8, 4.2, 1.2], "jacketLight");
    for (const side of [-1, 1]) {
      ellipsoid("Hood frog eye", "torso", [side * 5.5, 48.6, -4.5], [2.2, 2.5, 2.1], "jacketLight");
      ellipsoid("Hood frog pupil", "torso", [side * 5.5, 48.9, -6.4], [0.9, 1.2, 0.3], "ink", false);
      patch("Hood drawstring", "torso", [[side * 2.5, 43, 5], [side * 3.1, 43, 5], [side * 3.3, 38.5, 6.1], [side * 2.7, 38.5, 6.1]], "shirt");
      ellipsoid("Pocket frog eye", "torso", [side * 2.3, 36.6, 6.3], [0.6, 0.9, 0.3], "jacketDark", false);
    }
    patch("Pocket frog smile", "torso", [[-1.8, 34, 6.3], [0, 33, 6.45], [1.8, 34, 6.3], [0, 33.7, 6.45]], "jacketDark");
    loft("Hoodie hem", "torso", [[28.2, 7.7, 4.8], [30.1, 8.3, 5.1]], "jacketLight");
  },
  biker({ loft, patch, ellipsoid }) {
    patch("Biker tank", "torso", [[-3.3, 43.5, 4.7], [3.3, 43.5, 4.7], [3.3, 29.5, 5.7], [-3.3, 29.5, 5.7]], "jacketDark");
    for (const side of [-1, 1]) {
      patch("Leather lapel", "torso", [[side * 3.4, 44, 4.4], [side * 7.6, 41, 4.3], [side * 3.4, 36.5, 5.9], [side * 4.9, 40.4, 5.4]], "jacketLight");
      for (const y of [32, 35, 38]) ellipsoid("Silver vest stud", "torso", [side * 6, y, 4.8], [0.55, 0.55, 0.35], "white", false);
      loft("Leather wrist cuff", `${side < 0 ? "left" : "right"}_forearm`, [[27.4, 1.95, 2.05, side * 11], [30, 2.25, 2.3, side * 11]], "jacketDark");
      ellipsoid("Wrist cuff stud", `${side < 0 ? "left" : "right"}_forearm`, [side * 11, 28.6, 2.4], [0.6, 0.6, 0.35], "white", false);
    }
    patch("Biker back lightning", "torso", [[1.8, 42, -4.2], [-3.5, 36, -5.1], [-0.2, 36, -5.45], [-1.8, 30.8, -4.8], [3.9, 37.9, -4.8], [0.8, 37.9, -5.45]], "jacketLight");
  },
  velvet({ loft, patch, ellipsoid }) {
    loft("Velvet corset", "torso", [[28.2, 7.5, 4.5], [32, 7, 4.4], [38, 8.1, 5], [41.5, 8.1, 4.7], [42.3, 0, 0]], "jacket");
    loft("Corset neckline", "torso", [[40.8, 8.2, 4.85], [41.8, 8.2, 4.75]], "jacketDark");
    for (const side of [-1, 1]) {
      patch("Corset boning", "torso", [[side * 3.5, 29, 4.5], [side * 4.1, 29, 4.4], [side * 4.7, 40.8, 4.35], [side * 4.1, 40.8, 4.65]], "gold");
      loft("Opera glove", `${side < 0 ? "left" : "right"}_forearm`, [[27, 1.95, 2.05, side * 11], [30, 2.25, 2.3, side * 11.1], [35.4, 2.4, 2.45, side * 10.9]], "jacketDark");
      ellipsoid("Off-shoulder sleeve", `${side < 0 ? "left" : "right"}_arm`, [side * 10.6, 39.5, 0], [2.9, 2, 2.9], "jacket");
    }
    for (const y of [31, 34, 37]) {
      patch("Corset lacing", "torso", [[-1.5, y, 5.2], [-1.1, y - 0.45, 5.3], [1.5, y + 2, 5.4], [1.1, y + 2.45, 5.4]], "jacketLight");
      patch("Corset crossing lace", "torso", [[1.5, y, 5.2], [1.1, y - 0.45, 5.3], [-1.5, y + 2, 5.4], [-1.1, y + 2.45, 5.4]], "jacketLight");
    }
    loft("Velvet choker", "torso", [[45.5, 2.85, 2.65], [46.5, 2.75, 2.6]], "jacketDark");
    ellipsoid("Choker pearl", "torso", [0, 45.8, 2.9], [0.55, 0.65, 0.4], "gold", false);
  },
  starlight({ loft, patch, ellipsoid }) {
    loft("Starlight halter", "torso", [[34, 7.4, 4.8], [38, 8.1, 5], [41.5, 7.9, 4.5], [44.5, 3.5, 3.4], [46, 2.9, 2.8]], "jacket");
    loft("Halter silver hem", "torso", [[34, 7.5, 4.9], [35, 7.5, 4.9]], "jacketLight");
    patch("Halter star", "torso", [[0, 42, 4.65], [0.9, 39.9, 5.5], [3, 39.5, 5.2], [1.4, 38.1, 5.65], [1.8, 36, 5.55], [0, 37, 5.7], [-1.8, 36, 5.55], [-1.4, 38.1, 5.65], [-3, 39.5, 5.2], [-0.9, 39.9, 5.5]], "jacketLight");
    for (const side of [-1, 1]) {
      loft("Silver bangle", `${side < 0 ? "left" : "right"}_forearm`, [[27.4, 2.1, 2.2, side * 11], [29.1, 2.15, 2.25, side * 11]], "jacketLight");
      ellipsoid("Halter shoulder clasp", "torso", [side * 3, 44, 3], [0.75, 0.75, 0.4], "white", false);
    }
  },
  sunset({ loft, patch, ellipsoid }) {
    loft("Sunset crop", "torso", [[34.8, 7.4, 4.75], [38, 8, 4.95], [42, 7.85, 4.35], [43, 6.5, 3.6], [43.1, 0, 0]], "jacket");
    loft("Sunset stripe", "torso", [[36.2, 7.8, 4.95], [38, 8.1, 5.05]], "jacketLight");
    for (const side of [-1, 1]) {
      ellipsoid("Sunset short sleeve", `${side < 0 ? "left" : "right"}_arm`, [side * 10.2, 41.5, 0], [3, 2.2, 3], "jacket");
      patch("Crop shoulder strap", "torso", [[side * 3, 42.5, 3.8], [side * 4.3, 42.5, 3.8], [side * 4.3, 44.8, 2.6], [side * 3, 44.8, 2.6]], "jacket");
    }
    ellipsoid("Crop tie knot", "torso", [-4, 35, 4.6], [1.2, 1, 0.9], "jacketDark");
    patch("Crop tie", "torso", [[-4, 35, 5], [-6.8, 35.8, 4.2], [-6.1, 32.5, 4.7], [-4.2, 34.1, 5.2], [-2.7, 32.6, 5.2], [-1.9, 35.1, 5.2]], "jacketDark");
  },
};

module.exports = { statementTops };
