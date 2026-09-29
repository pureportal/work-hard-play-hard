function buildArcadeGameTable(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid } = kit;
  const id = asset.id.replace("equipment-", "");
  for (const x of [-width / 2 + 8, width / 2 - 8]) for (const z of [-depth / 2 + 8, depth / 2 - 8]) {
    roundedBox("Cabinet foot", [x, 3, z], [10, 6, 10], "ink");
    roundedBox("Tapered leg", [x, 16, z], [6, 24, 6], "shade");
    box("Leg ferrule", [x, 7, z], [6.5, 3, 6.5], "gold");
  }
  roundedBox("Arcade body", [0, 29, 0], [width - 3, 18, depth - 3], "main");
  roundedBox("Gilded rim", [0, 37, 0], [width - 1, 5, depth - 1], "gold");
  roundedBox("Beveled deck", [0, 39, 0], [width - 4, 3, depth - 4], "shade");
  roundedBox("Inset playing surface", [0, 41, -4], [width - 14, 1, depth - 23], id === "sketch-guess" ? "paper" : "ink");
  for (const x of [-width / 2 + 11, width / 2 - 11]) for (const z of [-depth / 2 + 11, depth / 2 - 11]) cylinder("Corner stud", [x, 41.8, z], 1.2, 0.7, "gold");
  box("Control panel", [0, 41.4, depth / 2 - 11], [width - 19, 0.7, 12], "light");
  cylinder("Left button", [-22, 42.1, depth / 2 - 11], 3.6, 1.3, "pink");
  cylinder("Right button", [22, 42.1, depth / 2 - 11], 3.6, 1.3, "water");

  if (id === "minefield-relay") {
    const clues = [0, 1, 1, 1, 0, 0, 1, 2, 2, 1, 0, 1, 2, 9, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 1];
    for (let i = 0; i < clues.length; i++) {
      const x = (i % 5 - 2) * 12, z = -4 + (Math.floor(i / 5) - 2) * 12;
      box("Field tile", [x, 41.7, z], [10.8, 0.4, 10.8], clues[i] === 9 ? "pink" : clues[i] === 0 ? "green" : "cream");
      if (clues[i] > 0 && clues[i] < 9) cylinder("Clue pip", [x, 42, z], 1.5 + clues[i] * 0.4, 0.35, clues[i] === 1 ? "water" : "main");
      if (clues[i] === 9) ellipsoid("Mine", [x, 42.8, z], [3, 2.2, 3], "ink");
    }
  } else if (id === "memory-sprint") {
    for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
      const color = ["water", "pink", "green", "gold"][(row + column) % 4];
      roundedBox("Illuminated memory pad", [(column - 1.5) * 17, 42, -4 + (row - 1.5) * 16], [14, 0.9, 13], color);
      cylinder("Pad light", [(column - 1.5) * 17, 42.6, -4 + (row - 1.5) * 16], 1, 0.3, "paper");
    }
  } else if (id === "territory-rush") {
    for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) {
      const color = column < 2 ? "water" : column > 4 ? "pink" : row < 3 ? "gold" : "green";
      box("Territory square", [(column - 3) * 9.3, 41.8, -4 + (row - 3) * 9.3], [8.5, 0.45, 8.5], color);
    }
    for (const x of [-28, 28]) cylinder("Claim token", [x, 42.8, 0], 4, 1.8, x < 0 ? "paper" : "ink");
  } else if (id === "sketch-guess") {
    const lines = [[-23, -20, 21, 18], [-20, 18, -2, -22], [-2, -22, 26, 3], [26, 3, 10, 18]];
    for (const [x1, z1, x2, z2] of lines) {
      const length = Math.hypot(x2 - x1, z2 - z1);
      box("Ink stroke", [(x1 + x2) / 2, 42, -4 + (z1 + z2) / 2], [length, 0.5, 2], "main", [0, -Math.atan2(z2 - z1, x2 - x1) * 180 / Math.PI, 0]);
    }
    for (const [x, color] of [[-19, "pink"], [-9, "water"], [1, "green"], [11, "gold"]]) cylinder("Paint pot", [x, 42.5, 28], 2.4, 2.2, color);
  } else if (id === "bomb-arena") {
    for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) {
      const x = (column - 3) * 9.3, z = -4 + (row - 3) * 9.3;
      box("Arena tile", [x, 41.8, z], [8.7, 0.35, 8.7], (row + column) % 2 ? "cream" : "light");
      if (column % 2 === 0 && row % 2 === 0) roundedBox("Stone block", [x, 43.3, z], [7, 2.7, 7], "shade");
    }
    for (const [x, z] of [[-14, -18], [19, 13]]) {
      ellipsoid("Bomb shell", [x, 44.7, z], [4, 4, 4], "ink");
      cylinder("Bomb fuse", [x, 48, z], 0.7, 3, "gold");
    }
  } else if (id === "snake-scramble") {
    for (let row = 0; row < 7; row++) for (let column = 0; column < 7; column++) box("Screen cell", [(column - 3) * 9.3, 41.7, -4 + (row - 3) * 9.3], [8.6, 0.25, 8.6], (row + column) % 2 ? "shade" : "main");
    for (const [x, z] of [[-25, 14], [-16, 14], [-7, 14], [-7, 5], [-7, -4], [2, -4], [11, -4]]) roundedBox("Snake segment", [x, 42.4, z], [7.6, 1.1, 7.6], "green");
    ellipsoid("Food jewel", [21, 43, -24], [3, 3, 3], "pink");
  } else if (id === "mini-golf") {
    box("Felt course", [0, 41.8, -4], [width - 17, 0.4, depth - 26], "green");
    for (const x of [-32, 32]) box("Course rail", [x, 43, -4], [2.5, 2, depth - 26], "wood");
    for (const z of [-36, 28]) box("Course rail", [0, 43, z], [width - 17, 2, 2.5], "wood");
    box("Course obstacle", [-5, 42.8, -10], [3, 2, 28], "gold");
    cylinder("Cup", [23, 42.1, -22], 4, 0.4, "ink");
    cylinder("Flag pole", [23, 48, -22], 0.7, 11, "paper");
    box("Flag", [26, 51, -22], [6, 4, 0.4], "pink");
    ellipsoid("Golf ball", [-22, 43, 18], [3, 3, 3], "paper");
  } else if (id === "space-defense") {
    for (const [x, z] of [[-27, -29], [8, -22], [20, 18], [-18, 10], [28, -9], [1, 25]]) ellipsoid("Star", [x, 41.8, z], [1, 0.3, 1], "paper");
    for (const [x, z] of [[-18, -14], [0, -26], [19, -7]]) {
      roundedBox("Enemy ship", [x, 43, z], [8, 2.5, 5], "pink");
      box("Enemy wings", [x, 42.3, z], [13, 0.8, 2], "gold");
    }
    roundedBox("Defender hull", [0, 44, 17], [10, 2.5, 8], "water");
    box("Defender wings", [0, 43.2, 19], [18, 1, 3], "light");
    cylinder("Laser", [0, 42.3, 4], 1, 0.8, "green");
  }
}

module.exports = { buildArcadeGameTable };
