const extendedHeadwear = {
  beanie(api, { loft, ellipsoid }) {
    loft("Ribbed beanie", "hair", [[75, 16.6, 11.5], [80, 16.1, 11.2], [85, 11, 8], [88, 0.2, 0.2]], "hat");
    loft("Beanie folded cuff", "hair", [[74.5, 16.9, 11.7], [78, 17, 11.8]], "hatLight");
    for (const x of [-10, -5, 0, 5, 10]) ellipsoid("Beanie knit rib", "hair", [x, 80.5, 10 - Math.abs(x) * 0.18], [0.45, 2.3, 0.25], "hatLight", false);
  },
  fedora(api, { loft, ellipsoid, patch }) {
    ellipsoid("Fedora brim", "hair", [0, 75.7, 0], [20, 1, 14], "hat");
    loft("Pinched fedora", "hair", [[76, 14, 10], [83, 12, 8.5], [87, 9, 5.5], [87.1, 0, 0]], "hat");
    loft("Fedora band", "hair", [[77, 14.1, 10.1], [79, 13.6, 9.6]], "hatDark");
    patch("Fedora crease", "hair", [[-2, 87.3, -4], [2, 87.3, -4], [1, 87.3, 4], [-1, 87.3, 4]], "hatDark");
  },
  tricorn(api, { loft, patch, ellipsoid }) {
    loft("Tricorn crown", "hair", [[75, 15.6, 10.8], [82, 11, 8], [84, 0, 0]], "hat");
    for (const side of [-1, 1]) {
      patch("Tricorn upturned brim", "hair", [[0, 77, 14], [side * 21, 82, 0], [side * 17, 74.5, -7], [0, 75, 7]], "hatDark");
      patch("Tricorn gold binding", "hair", [[0, 77, 14.2], [side * 21, 82, 0.2], [side * 20, 80.8, 0.5], [0, 75.8, 14]], "gold");
    }
    ellipsoid("Tricorn badge", "hair", [0, 79.2, 11], [2, 2.3, 0.5], "gold");
  },
  flatcap(api, { ellipsoid, loft }) {
    ellipsoid("Tweed cap", "hair", [0, 78.2, -1], [17.4, 4.6, 12], "hat");
    loft("Tweed binding", "hair", [[74.8, 16, 10.7], [76.3, 16.1, 10.8]], "hatDark");
    ellipsoid("Tweed peak", "hair", [0, 74.9, 10.5], [12.8, 0.65, 5.3], "hatDark");
    ellipsoid("Tweed crown button", "hair", [0, 82.8, -1], [1.1, 0.5, 1.1], "hatLight");
  },
  bandana(api, { loft, patch, ellipsoid }) {
    loft("Bandana wrap", "hair", [[72.8, 16.3, 11.5], [77, 16.3, 11.5], [81, 11, 8], [82, 0, 0]], "hat");
    ellipsoid("Bandana knot", "hair", [0, 73, -12], [2.5, 2, 2], "hatDark");
    for (const side of [-1, 1]) {
      patch("Bandana tail", "hair", [[0, 74, -12], [side * 3, 72.5, -13], [side * 5, 63, -12], [side * 0.5, 65, -13]], "hat");
      patch("Bandana paisley", "hair", [[side * 7, 75, 10.8], [side * 8.2, 76.4, 10.7], [side * 7, 78, 10], [side * 5.8, 76.4, 11]], "hatLight");
    }
  },
  tiara(api, { loft, patch, ellipsoid }) {
    loft("Tiara circlet", "hair", [[75.5, 16.3, 11.5], [76.6, 16.3, 11.5]], "gold");
    for (const x of [-10, -5, 0, 5, 10]) {
      const top = 85 - Math.abs(x) * 0.45, z = 12 - Math.abs(x) * 0.22;
      patch("Tiara point", "hair", [[x - 2.6, 76, z], [x, top, z - 1.4], [x + 2.6, 76, z]], "gold");
      ellipsoid("Tiara jewel", "hair", [x, top - 2.3, z - 0.7], [0.9, 1.3, 0.4], "hatLight", false);
    }
  },
  sunhat(api, { ellipsoid, loft, patch }) {
    ellipsoid("Straw brim", "hair", [0, 75, 0], [22.5, 1.3, 16.5], "hat");
    loft("Straw crown", "hair", [[75, 14.7, 10.7], [81, 13, 9.5], [85, 8, 5.5], [85.1, 0, 0]], "hat");
    loft("Sunhat ribbon", "hair", [[76, 14.5, 10.8], [79, 13.8, 10.4]], "hatDark");
    for (const side of [-1, 1]) patch("Sunhat bow", "hair", [[12, 78, 6], [12 + side * 4, 81, 6], [12 + side * 4, 75, 7]], "hatDark");
  },
  roseband(api, { loft, ellipsoid }) {
    loft("Rose garland", "hair", [[75, 16.2, 11.4], [76.2, 16.3, 11.5]], "hatDark");
    for (let index = 0; index < 7; index++) {
      const angle = -1.25 + index * 2.5 / 6;
      const x = Math.sin(angle) * 15.8, z = Math.cos(angle) * 11.6;
      for (let petal = 0; petal < 5; petal++) {
        const turn = petal * Math.PI * 2 / 5;
        ellipsoid("Rose petal", "hair", [x + Math.cos(turn) * 1.5, 77 + Math.sin(turn) * 1.5, z], [1.5, 1.4, 0.7], "hat");
      }
      ellipsoid("Rose center", "hair", [x, 77, z + 0.7], [1.1, 1.1, 0.65], "hatLight", false);
    }
  },
  pearlcomb(api, { patch, ellipsoid }) {
    patch("Pearl comb", "hair", [[10, 67.8, 9], [15, 69.4, 6], [14.4, 74.7, 6], [9.4, 73.1, 9]], "gold");
    for (let index = 0; index < 5; index++) ellipsoid("Comb pearl", "hair", [10 + index * 1.2, 73.4 + index * 0.3, 9.5 - index * 0.65], [0.95, 1, 0.9], "white");
    for (const y of [64.5, 67, 69.5]) ellipsoid("Hanging pearl", "hair", [15.2, y, 6.5], [0.8, 0.8, 0.8], "white");
  },
  halo(api, { mesh }) {
    const ring = new api.THREE.TorusGeometry(13.7, 1.1, 8, 32);
    mesh("Floating halo", "hair", ring.rotateX(Math.PI / 2).translate(0, 90.5, -1), "gold");
  },
  ufo(api, { ellipsoid, loft }) {
    ellipsoid("Flying saucer brim", "hair", [0, 78, 0], [23, 2, 16], "hat");
    ellipsoid("Saucer cockpit", "hair", [0, 81, 0], [10, 6, 8], "hatLight");
    loft("Saucer rim", "hair", [[77, 23.2, 16.2], [78.2, 23.2, 16.2]], "hatDark");
    for (let index = 0; index < 9; index++) {
      const angle = index / 9 * Math.PI * 2;
      ellipsoid("Saucer running light", "hair", [Math.sin(angle) * 20, 78.7, Math.cos(angle) * 13.7], [1.4, 0.9, 1.3], "gold", false);
    }
  },
  antlers(api, { loft, ellipsoid }) {
    loft("Antler circlet", "hair", [[74.5, 16, 11], [76, 16.1, 11.1]], "hatDark");
    for (const side of [-1, 1]) {
      loft("Branching antler", "hair", [[75, 2.2, 2, side * 12, -1], [81, 1.8, 1.6, side * 16, -2], [87, 1.1, 0.9, side * 18, -2], [91, 0.1, 0.1, side * 16, -2]], "hat");
      loft("Antler outer tine", "hair", [[80, 1.5, 1.3, side * 15.7, -2], [84, 1, 0.8, side * 21, -2], [88, 0.1, 0.1, side * 22, -2]], "hat");
      loft("Antler inner tine", "hair", [[84, 1.1, 1.1, side * 17, -2], [88, 0.1, 0.1, side * 11.5, -2]], "hat");
      ellipsoid("Antler crystal", "hair", [side * 12, 77, 1], [1.6, 2.2, 1.1], "hatLight");
    }
  },
  octopus(api, { ellipsoid, loft }) {
    ellipsoid("Octopus mantle", "hair", [0, 82.5, -1], [14.5, 8.5, 11], "hat");
    for (let index = 0; index < 8; index++) {
      const angle = index / 8 * Math.PI * 2, x = Math.sin(angle), z = Math.cos(angle);
      loft("Octopus hat arm", "hair", [[71, 0.2, 0.2, x * 20, z * 13], [70.5, 2, 2, x * 17, z * 12], [75, 3.1, 2.8, x * 16, z * 11], [79, 3.5, 3, x * 11, z * 7]], "hat");
    }
    for (const side of [-1, 1]) {
      ellipsoid("Octopus eye", "hair", [side * 4.5, 84, 9.5], [2.3, 2.6, 1], "white");
      ellipsoid("Octopus pupil", "hair", [side * 4.5, 84, 10.4], [0.85, 1.3, 0.3], "ink", false);
    }
  },
  fascinator(api, { ellipsoid, patch, loft }) {
    ellipsoid("Satin fascinator", "hair", [-10, 77, 2], [7, 2, 5], "hat");
    for (const offset of [-2, 1, 4]) loft("Fascinator plume", "hair", [[77, 0.4, 0.4, -10, 2], [84, 1.5, 0.7, -12 + offset, 1], [91 - Math.abs(offset), 0.1, 0.1, -15 + offset, 0]], "hatLight");
    for (let index = 0; index < 4; index++) {
      const x = -14 + index * 3;
      patch("Fascinator veil thread", "hair", [[x, 75, 9], [x + 0.45, 75, 9], [x + 6, 65, 10.4], [x + 5.55, 65, 10.4]], "hatDark");
      patch("Crossed veil thread", "hair", [[x + 5, 75, 9], [x + 5.45, 75, 9], [x, 65, 10.4], [x - 0.45, 65, 10.4]], "hatDark");
    }
  },
  leathercap(api, { ellipsoid, loft, patch }) {
    ellipsoid("Leather peaked crown", "hair", [0, 79.8, 0], [17.2, 4.8, 12], "hat");
    loft("Leather cap band", "hair", [[74.5, 16.1, 11.3], [77.5, 16.4, 11.5]], "hatDark");
    ellipsoid("Glossy leather peak", "hair", [0, 74.5, 11], [14, 0.8, 6.5], "hatDark");
    patch("Cap chain", "hair", [[-11, 77, 8.7], [0, 75.6, 12], [11, 77, 8.7], [11, 77.8, 8.7], [0, 76.4, 12], [-11, 77.8, 8.7]], "hatLight");
    ellipsoid("Cap crest", "hair", [0, 80.4, 11.8], [1.7, 1.9, 0.6], "hatLight");
  },
  masquerade(api, { patch, ellipsoid }) {
    for (const side of [-1, 1]) {
      const points = [[2.1, 59.3], [3, 62.1], [7.8, 63.5], [12.5, 63.7], [10.4, 59.2], [8.2, 56.2], [3.3, 56.7]];
      const inner = [[3.1, 59.2], [4, 60.6], [7.5, 61.5], [9.6, 60.6], [8.7, 58.5], [7.3, 57.5], [4.1, 57.7]];
      for (let index = 0; index < points.length; index++) {
        const next = (index + 1) % points.length;
        patch("Masquerade eye frame", "hair", [points[index], points[next], inner[next], inner[index]].map(([x, y]) => [side * x, y, 11.7 - x * 0.14]), "hatDark");
      }
      ellipsoid("Mask jewel", "hair", [side * 11, 62.2, 10.4], [0.85, 0.85, 0.45], "gold", false);
    }
    patch("Mask bridge", "hair", [[-3, 61, 11.4], [0, 62, 11.6], [3, 61, 11.4], [2, 59.2, 11.4], [0, 60, 11.6], [-2, 59.2, 11.4]], "hatDark");
  },
};

module.exports = { extendedHeadwear };
