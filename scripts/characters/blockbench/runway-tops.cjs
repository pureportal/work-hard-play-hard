const runwayTops = {
  jellyfish({ loft, ellipsoid, patch }) {
    loft("Jellyfish cape bell", "torso", [[38, 12, 7], [41, 12.5, 7.3], [44, 8, 4.7], [46, 3.1, 2.8]], "jacketLight");
    for (let index = 0; index < 8; index++) {
      const angle = index / 8 * Math.PI * 2;
      const x = Math.sin(angle) * 10, z = Math.cos(angle) * 6;
      loft("Cape ribbon tentacle", "torso", [[30 + index % 2 * 3, 0.2, 0.2, x - 1.3, z], [34, 1, 0.8, x + 1, z + 0.5], [39.5, 1.1, 0.9, x, z]], "jacket");
      ellipsoid("Cape pearl", "torso", [x, 39.5, z + 0.4], [0.8, 0.8, 0.7], "white", false);
    }
    for (const side of [-1, 1]) {
      const arm = `${side < 0 ? "left" : "right"}_forearm`;
      loft("Jellyfish bell sleeve", arm, [[27, 4, 3.9, side * 11], [31, 3.2, 3.2, side * 11]], "jacketLight");
      patch("Pearl bodice seam", "torso", [[side * 2.5, 30, 5.9], [side * 3.2, 30, 5.9], [side * 4.1, 37, 5.9], [side * 3.4, 37, 5.9]], "white");
    }
  },
  phoenix({ loft, patch, ellipsoid }) {
    loft("Phoenix feather collar", "torso", [[42, 7, 4.8], [46, 4.6, 3.5]], "jacketDark");
    for (const side of [-1, 1]) {
      const arm = `${side < 0 ? "left" : "right"}_arm`;
      for (let index = 0; index < 4; index++) {
        const x = side * (11 + index * 2);
        patch("Phoenix wing feather", arm, [[side * 9, 44, -0.5], [x + side * 2.5, 42 - index, -1], [x + side * 3, 34 - index * 1.8, -2], [x, 36 - index, -1.5]], index % 2 ? "jacketLight" : "jacket");
      }
      for (const y of [32, 36, 40]) patch("Flame breast feather", "torso", [[side * 0.3, y + 3, 5.9], [side * 6.5, y + 1, 4.8], [side * 3, y - 2, 5.7]], "jacketLight");
      ellipsoid("Phoenix cuff stone", `${side < 0 ? "left" : "right"}_forearm`, [side * 11, 29, 3], [1.5, 1.7, 0.7], "gold");
    }
    ellipsoid("Phoenix heart", "torso", [0, 42.5, 5.3], [1.6, 2, 0.8], "gold");
  },
  disco({ patch, loft, ellipsoid }) {
    for (const side of [-1, 1]) {
      patch("Disco oversized lapel", "torso", [[side * 2.5, 45, 4], [side * 8.2, 41, 4.3], [side * 3.5, 34.5, 6.2], [side * 4.5, 40, 5.6]], "jacketLight");
      loft("Disco flared cuff", `${side < 0 ? "left" : "right"}_forearm`, [[27, 3.8, 3.7, side * 11], [31, 3, 3.1, side * 11]], "jacketDark");
      for (const y of [31.5, 35, 38.5]) for (const x of [4.7, 6.5]) patch("Mirror sequin", "torso", [[side * x, y + 0.8, 5.1], [side * (x + 0.75), y, 5], [side * x, y - 0.8, 5.1], [side * (x - 0.75), y, 5.3]], "white");
    }
    patch("Disco open collar", "torso", [[-2.4, 44, 4.8], [2.4, 44, 4.8], [0, 37, 6]], "skin");
    ellipsoid("Disco pendant", "torso", [0, 37.5, 6.2], [1, 1.6, 0.35], "gold");
    patch("Disco back sun", "torso", [[0, 42, -4.4], [5.5, 36, -5.3], [0, 30.5, -5.3], [-5.5, 36, -5.3]], "jacketLight");
  },
  lace({ loft, patch, ellipsoid }) {
    loft("Lace bustier", "torso", [[29, 7.5, 4.6], [33, 7, 4.5], [39, 8.2, 5.1], [42, 7.8, 4.6], [42.1, 0, 0]], "jacket");
    for (const side of [-1, 1]) {
      patch("Lace shoulder strap", "torso", [[side * 4.7, 41, 4.5], [side * 6, 41, 4.1], [side * 4.1, 45, 2.8], [side * 3, 45, 3.1]], "jacketDark");
      for (const y of [31.5, 35.5, 39.5]) patch("Lace floral inset", "torso", [[side * 4, y + 1.3, 4.9], [side * 5.4, y, 4.6], [side * 4, y - 1.3, 4.9], [side * 2.6, y, 5.2]], "jacketLight");
      loft("Lace wristlet", `${side < 0 ? "left" : "right"}_forearm`, [[27.5, 2.1, 2.15, side * 11], [30, 2.25, 2.3, side * 11]], "jacketDark");
    }
    for (const y of [32, 35, 38]) ellipsoid("Bustier pearl button", "torso", [0, y, 5.4], [0.45, 0.5, 0.3], "white", false);
    loft("Lace collar", "torso", [[45.2, 2.9, 2.75], [46.5, 2.8, 2.65]], "jacketDark");
  },
  satin({ patch, loft, ellipsoid }) {
    patch("Open satin neckline", "torso", [[-3.3, 44.5, 4.5], [3.3, 44.5, 4.5], [2.6, 38, 5.8], [0, 35.5, 5.9], [-2.6, 38, 5.8]], "skin");
    for (const side of [-1, 1]) {
      patch("Satin folded collar", "torso", [[side * 2.9, 45, 4.1], [side * 6.4, 42.5, 4.5], [side * 3.2, 37.5, 6], [side * 2.3, 42, 5.2]], "jacketLight");
      loft("Satin rolled sleeve", `${side < 0 ? "left" : "right"}_forearm`, [[29.5, 3.1, 3.2, side * 11], [32, 3.2, 3.3, side * 11]], "jacketLight");
      patch("Satin shoulder sheen", "torso", [[side * 5, 42, 4.9], [side * 6, 41, 4.9], [side * 5.3, 31, 4.6], [side * 4.8, 34, 5.2]], "jacketLight");
    }
    for (const y of [30.5, 33.5, 36]) ellipsoid("Satin shirt button", "torso", [0, y, 5.8], [0.45, 0.45, 0.3], "gold", false);
  },
  harness({ loft, patch, ellipsoid }) {
    loft("Harness fitted tank", "torso", [[29, 7.45, 4.55], [33, 7, 4.5], [39, 8.1, 5], [42, 7.7, 4.5], [42.1, 0, 0]], "jacket");
    for (const side of [-1, 1]) {
      patch("Harness shoulder strap", "torso", [[side * 4.4, 39, 5], [side * 6.2, 39, 4.5], [side * 4.3, 45, 2.8], [side * 2.8, 45, 3.1]], "jacketDark");
      patch("Harness diagonal", "torso", [[0, 35.5, 5.8], [side * 1.2, 35, 5.8], [side * 6, 41.8, 4.7], [side * 4.8, 42.3, 5]], "jacketLight");
      loft("Harness wrist cuff", `${side < 0 ? "left" : "right"}_forearm`, [[27.4, 2.1, 2.2, side * 11], [30.2, 2.25, 2.3, side * 11]], "jacketDark");
      ellipsoid("Harness shoulder ring", "torso", [side * 4.6, 41.6, 5.2], [0.9, 0.9, 0.4], "white", false);
    }
    loft("Harness waist band", "torso", [[29, 7.55, 4.65], [30.4, 7.6, 4.7]], "jacketLight");
    ellipsoid("Harness central clasp", "torso", [0, 35.3, 5.9], [1.2, 1.2, 0.4], "white", false);
  },
};

module.exports = { runwayTops };
