const gameTablePalette = {
  walnut: "#76513f", walnutLight: "#b7885e", walnutShade: "#4e3937",
  boardLight: "#edd7af", boardDark: "#886349", ivory: "#fff2d3", ivoryShade: "#cead81",
  obsidian: "#303b50", obsidianLight: "#697a95", screen: "#182638", screenWell: "#101c2b",
  screenTrim: "#496780", cyan: "#60d9e5", blue: "#769fe8", coral: "#ed8393",
  amber: "#f0c868", mint: "#8bd2a1", lavender: "#bb99ef", orange: "#eda46e",
};

function buildChessPiece(kit, type, x, z, dark, facing) {
  const { cylinder, ellipsoid, box, shape, THREE } = kit;
  const material = dark ? "obsidian" : "ivory";
  const trim = dark ? "obsidianLight" : "ivoryShade";
  const base = 35.2;
  const name = `${dark ? "Black" : "White"} ${type}`;
  cylinder(`${name} plinth`, [x, base + 0.6, z], 2.9, 1.2, trim, 2.7);
  cylinder(`${name} base`, [x, base + 1.5, z], 2.65, 0.8, material, 2.3);
  cylinder(`${name} stem`, [x, base + 3, z], 2.15, 2.8, material, 1.25);
  if (type === "pawn") {
    cylinder(`${name} collar`, [x, base + 4.4, z], 1.85, 0.7, trim);
    ellipsoid(`${name} head`, [x, base + 5.8, z], [1.8, 1.8, 1.8], material);
  } else if (type === "knight") {
    const profile = new THREE.Shape();
    const points = [[-1.6, 3.7], [-1.9, 6.7], [-0.8, 9.5], [0.1, 10.4], [0.5, 8.7], [1.6, 8.5], [3.1, 6.6], [2.9, 5.7], [0.4, 6], [1.2, 3.7]];
    points.forEach(([z, y], index) => index ? profile.lineTo(z * facing, y) : profile.moveTo(z * facing, y));
    profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: 2.8, bevelEnabled: true, bevelSize: 0.18, bevelThickness: 0.18, bevelSegments: 1, steps: 1 });
    geometry.translate(0, 0, -1.4);
    geometry.rotateY(-Math.PI / 2);
    shape(`${name} carved horse`, geometry, [x, base, z], material);
    for (const side of [-1, 1]) ellipsoid(`${name} eye`, [x + side * 1.52, base + 7.7, z + facing * 0.7], [0.2, 0.38, 0.38], trim);
  } else if (type === "rook") {
    cylinder(`${name} tower`, [x, base + 5, z], 1.8, 4.2, material, 2.1);
    cylinder(`${name} battlement`, [x, base + 7.3, z], 2.65, 1.1, trim);
    for (const [dx, dz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) box(`${name} merlon`, [x + dx, base + 8.3, z + dz], [1.4, 1.7, 1.4], material);
  } else {
    cylinder(`${name} neck`, [x, base + 5.2, z], 1.45, 3, material, 1.1);
    cylinder(`${name} collar`, [x, base + 6.4, z], 2.05, 0.65, trim);
    if (type === "bishop") {
      ellipsoid(`${name} mitre`, [x, base + 8.1, z], [1.8, 2.2, 1.8], material);
      box(`${name} mitre slit`, [x, base + 8.7, z + facing * 1.55], [0.55, 2, 0.25], trim, [0, 0, -28]);
      ellipsoid(`${name} tip`, [x, base + 10.2, z], [0.65, 0.65, 0.65], material);
    } else if (type === "queen") {
      cylinder(`${name} crown`, [x, base + 7.7, z], 1.5, 2, material, 2.5);
      for (let point = 0; point < 5; point++) {
        const angle = point * Math.PI * 2 / 5;
        ellipsoid(`${name} crown pearl`, [x + Math.cos(angle) * 2, base + 9.1, z + Math.sin(angle) * 2], [0.65, 0.9, 0.65], trim);
      }
      ellipsoid(`${name} crown center`, [x, base + 9.4, z], [0.85, 1, 0.85], material);
    } else {
      cylinder(`${name} crown`, [x, base + 7.6, z], 1.4, 2, material, 2);
      box(`${name} cross upright`, [x, base + 10, z], [1.15, 4, 1.2], material);
      box(`${name} cross arms`, [x, base + 10.3, z], [3.8, 1.1, 1.2], material);
    }
  }
}

function buildChessTable(kit, width, depth) {
  const { box, roundedBox, cylinder } = kit;
  for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 6, depth / 2 - 6]) {
    cylinder("Turned walnut leg", [x, 14.5, z], 2.4, 28, "walnut", 3.4);
    cylinder("Brass foot", [x, 1.6, z], 2.65, 2.8, "gold");
    cylinder("Leg collar", [x, 24, z], 3.5, 2, "main");
  }
  for (const side of [-1, 1]) {
    roundedBox("Lacquer apron", [0, 27.5, side * (depth / 2 - 5)], [width - 8, 7, 4], "main");
    roundedBox("Lacquer apron", [side * (width / 2 - 5), 27.5, 0], [4, 7, depth - 8], "main");
    box("Apron brass inlay", [0, 29.6, side * (depth / 2 - 2.8)], [width - 19, 0.7, 0.3], "gold");
    box("Apron brass inlay", [side * (width / 2 - 2.8), 29.6, 0], [0.3, 0.7, depth - 19], "gold");
  }
  roundedBox("Tabletop lacquer edge", [0, 32, 0], [width - 0.8, 5, depth - 0.8], "main");
  roundedBox("Walnut playing surround", [0, 34.25, 0], [width - 5, 1.5, depth - 5], "walnut");
  const board = Math.min(width, depth) - 20;
  box("Board brass keyline", [0, 35, 0], [board + 2.4, 0.35, board + 2.4], "gold");
  const cell = board / 8;
  for (let file = 0; file < 8; file++) for (let rank = 0; rank < 8; rank++) box("Inlaid chess square", [(file - 3.5) * cell, 35.25, (rank - 3.5) * cell], [cell, 0.2, cell], (file + rank) % 2 ? "boardDark" : "boardLight");
  for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 6, depth / 2 - 6]) box("Brass corner diamond", [x, 35.1, z], [2.2, 0.25, 2.2], "gold", [0, 45, 0]);
  const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  for (const dark of [false, true]) for (let file = 0; file < 8; file++) {
    const side = dark ? -1 : 1;
    buildChessPiece(kit, backRank[file], (file - 3.5) * cell, side * 3.5 * cell, dark, -side);
    const rank = file === 3 ? 0.5 : file === 4 ? 1.5 : 2.5;
    buildChessPiece(kit, "pawn", (file - 3.5) * cell, side * rank * cell, dark, -side);
  }
}

function buildFallingBlocksTable(kit, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid } = kit;
  for (const x of [-width / 2 + 8, width / 2 - 8]) for (const z of [-depth / 2 + 8, depth / 2 - 8]) {
    roundedBox("Arcade pedestal leg", [x, 7, z], [7, 14, 7], "shade");
    roundedBox("Pedestal foot", [x, 1.8, z], [8.5, 3, 9], "ink");
    box("Foot brass band", [x, 4.2, z], [7.3, 1.3, 7.3], "gold");
  }
  roundedBox("Cocktail cabinet", [0, 23, 0], [width - 6, 30, depth - 6], "main");
  roundedBox("Lower cabinet trim", [0, 10, 0], [width - 4, 4, depth - 4], "shade");
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 2.9);
    box("Side service inset", [x, 23, -3], [0.3, 18, depth - 31], "shade");
    for (let slot = 0; slot < 5; slot++) box("Cabinet cooling slot", [x + side * 0.25, 17 + slot * 2.7, -17], [0.25, 0.7, 22], "screen");
    for (const [dy, dz] of [[0, 0], [0, 4], [0, 8], [4, 4]]) box("Side block emblem", [x + side * 0.3, 22 + dy, 15 + dz], [0.3, 3.4, 3.4], "cyan");
    box("End panel", [0, 22, side * (depth / 2 - 2.9)], [width - 24, 16, 0.3], "shade");
    for (const x of [-20, -12, -4, 4, 12, 20]) box("End grille", [x, 22, side * (depth / 2 - 2.6)], [3, 7, 0.25], "screen");
  }
  roundedBox("Tabletop bumper", [0, 37.5, 0], [width - 0.8, 5, depth - 0.8], "shade");
  roundedBox("Lacquer tabletop", [0, 39.2, 0], [width - 3, 2, depth - 3], "main");
  roundedBox("Display bezel", [0, 40.3, -7], [width - 12, 1.2, depth - 18], "screenTrim");
  box("Display glass", [0, 41, -7], [width - 16, 0.25, depth - 22], "screen");
  const pitch = 4.2;
  const wellX = -13;
  box("Playfield rim", [wellX, 41.25, -7], [45.4, 0.2, 87.4], "screenTrim");
  box("Ten by twenty playfield", [wellX, 41.5, -7], [43, 0.2, 85], "screenWell");
  for (const x of [wellX - 22, wellX + 22]) box("Playfield light strip", [x, 41.6, -7], [0.45, 0.15, 82], "cyan");
  const colors = { C: "cyan", B: "blue", P: "lavender", Y: "amber", G: "mint", R: "coral", O: "orange" };
  const rows = ["..........", ".......OO.", ".P.....O..", "PPPBB..OR.", "CCCB.GGRR.", "YCCBBGG.R.", "YYYPBB.CCC"];
  for (const [row, blocks] of rows.entries()) for (const [column, color] of [...blocks].entries()) {
    if (color === ".") continue;
    const x = wellX + (column - 4.5) * pitch;
    const z = -7 + (row + 13 - 9.5) * pitch;
    roundedBox("Settled falling block", [x, 41.9, z], [3.65, 0.5, 3.65], colors[color]);
  }
  for (const [column, row] of [[4, 4], [3, 5], [4, 5], [5, 5]]) roundedBox("Falling T piece", [wellX + (column - 4.5) * pitch, 42, -7 + (row - 9.5) * pitch], [3.65, 0.6, 3.65], "lavender");
  for (const [column, row] of [[4, 10], [3, 11], [4, 11], [5, 11]]) box("Landing outline", [wellX + (column - 4.5) * pitch, 41.75, -7 + (row - 9.5) * pitch], [3.65, 0.15, 3.65], "screenTrim");
  for (const [z, material, cells] of [[-33, "amber", [[0, 0], [1, 0], [0, 1], [1, 1]]], [-12, "cyan", [[0, 0], [0, 1], [0, 2], [0, 3]]], [12, "coral", [[0, 0], [1, 0], [1, 1], [2, 1]]]]) {
    roundedBox("Next piece recess", [27, 41.3, z], [15, 0.5, 17], "screenWell");
    for (const [x, row] of cells) box("Next falling piece", [24 + x * 3.1, 41.9, z - 4.5 + row * 3.1], [2.6, 0.3, 2.6], material);
  }
  for (let bar = 0; bar < 3; bar++) box("Score light", [27, 41.8, 27 + bar * 2.5], [13 - bar * 3, 0.2, 0.8], bar === 0 ? "cyan" : "screenTrim");
  roundedBox("Control deck", [0, 40.8, depth / 2 - 9], [width - 13, 1.5, 12], "light");
  cylinder("Joystick socket", [-25, 41.7, depth / 2 - 9], 3.5, 1, "shade");
  cylinder("Joystick shaft", [-25, 44.5, depth / 2 - 9], 0.75, 5, "gold");
  ellipsoid("Joystick ball", [-25, 47, depth / 2 - 9], [2.65, 2.65, 2.65], "coral");
  for (const [x, material] of [[1, "cyan"], [12, "lavender"], [23, "coral"]]) {
    cylinder("Arcade button socket", [x, 41.8, depth / 2 - 9], 3.2, 0.8, "shade");
    cylinder("Arcade button", [x, 42.6, depth / 2 - 9], 2.5, 1.1, material);
  }
}

module.exports = { buildChessTable, buildFallingBlocksTable, gameTablePalette };
