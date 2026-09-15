const arcadePalette = {
  cabinetInk: "#253044", cabinetInset: "#37465e", screenGlass: "#142639",
  screenBorder: "#526c87", neonBlue: "#64d5df", neonPink: "#ec86a5",
  neonGold: "#f3cd78", starWhite: "#ecf5e9", cabinetMetal: "#a6b6c6",
};

function buildArcadeCabinet(kit, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, shape, THREE } = kit;
  const back = -depth / 2 + 2;
  const front = depth / 2 - 2;
  const sideX = width / 2 - 2;
  const profile = [[back, 5], [front, 5], [front, 48], [front - 3, 52], [20, 52], [-4, 94], [3, 96], [3, 106], [back, 106]];

  function sidePanel(name, points, x, thickness, material, bevel = 0) {
    const outline = new THREE.Shape();
    points.forEach(([z, y], index) => index ? outline.lineTo(z, y) : outline.moveTo(z, y));
    outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: thickness, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1,
    });
    geometry.translate(0, 0, -thickness / 2);
    geometry.rotateY(-Math.PI / 2);
    shape(name, geometry, [x, 0, 0], material);
  }

  roundedBox("Cabinet plinth", [0, 2.5, 0], [width - 1, 5, depth - 1], "cabinetInk");
  box("Lower cabinet", [0, 25, 0], [width - 6, 40, depth - 6], "main");
  box("Enclosed monitor housing", [0, 72, back + 17], [width - 6, 57, 32], "main");
  box("Rear cabinet wall", [0, 57, back + 0.8], [width - 6, 98, 1.6], "main");
  for (const side of [-1, 1]) sidePanel("Sculpted cabinet cheek", profile, side * sideX, 2, "main", 0.35);

  roundedBox("Marquee crown", [0, 101, (back + 3) / 2], [width - 4, 10, 3 - back], "cabinetInk");
  box("Crown enamel cap", [0, 106.1, (back + 1) / 2], [width - 7, 0.4, 1 - back], "light");
  roundedBox("Crown emblem rim", [0, 106.5, -21], [width - 16, 0.5, 33], "screenBorder");
  box("Crown emblem field", [0, 106.85, -21], [width - 19, 0.2, 30], "cabinetInk");
  for (const z of [-33, -9]) box("Crown illuminated trim", [0, 107.05, z], [width - 25, 0.15, 1.2], "neonBlue");
  const star = new THREE.Shape();
  for (let index = 0; index < 10; index++) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 ? 3.7 : 8.4;
    const point = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    if (index) star.lineTo(...point);
    else star.moveTo(...point);
  }
  star.closePath();
  const starGeometry = new THREE.ExtrudeGeometry(star, { depth: 0.2, bevelEnabled: false });
  starGeometry.rotateX(-Math.PI / 2);
  shape("Crown star emblem", starGeometry, [0, 107, -21], "neonGold");
  for (const x of [-16, 16]) box("Crown shooting star", [x, 107.1, -21], [3.5, 0.2, 3.5], "neonPink", [0, 45, 0]);
  box("Marquee trim", [0, 101, 3.2], [width - 8, 8, 0.6], "neonBlue");
  box("Marquee glass", [0, 101, 3.65], [width - 11, 6, 0.3], "cabinetInk");
  for (const x of [-17, 17]) {
    box("Marquee streak", [x, 101, 3.9], [10, 1, 0.15], "neonPink");
    box("Marquee glint", [x, 103, 3.9], [6, 0.55, 0.15], "neonBlue");
  }
  for (const x of [-7, 0, 7]) box("Marquee star", [x, 101, 4], [x === 0 ? 3.4 : 2.3, x === 0 ? 3.4 : 2.3, 0.2], "neonGold", [0, 0, 45]);

  const tilt = 29 * Math.PI / 180;
  function screenPart(name, x, y, size, material, offset) {
    box(name, [x, 75 + y * Math.cos(tilt) + offset * Math.sin(tilt), 8 - y * Math.sin(tilt) + offset * Math.cos(tilt)], size, material, [-29, 0, 0]);
  }
  screenPart("Recessed monitor bezel", 0, 0, [width - 7, 45, 3], "cabinetInk", 0);
  screenPart("Monitor gasket", 0, 0, [width - 14, 37, 0.5], "screenBorder", 1.6);
  screenPart("CRT glass", 0, 0, [width - 18, 33, 0.35], "screenGlass", 2);
  screenPart("CRT upper reflection", -7, 14.1, [26, 0.75, 0.12], "screenBorder", 2.24);
  screenPart("Screen horizon", 0, -12.7, [39, 0.45, 0.12], "screenBorder", 2.24);
  const invader = ["01110", "11011", "11111", "01010"];
  for (const [index, x] of [-13, 0, 13].entries()) {
    for (const [row, pixels] of invader.entries()) for (let col = 0; col < pixels.length; col++) {
      if (pixels[col] === "1") screenPart("Pixel opponent", x + (col - 2) * 1.55, 7 - row * 1.55, [1.55, 1.55, 0.12], index === 1 ? "neonPink" : "neonGold", 2.28);
    }
  }
  const ship = ["00100", "00100", "01110", "11111", "10001"];
  for (const [row, pixels] of ship.entries()) for (let col = 0; col < pixels.length; col++) {
    if (pixels[col] === "1") screenPart("Player starfighter", (col - 2) * 1.9, -4 - row * 1.5, [1.9, 1.5, 0.12], row < 3 ? "starWhite" : "neonBlue", 2.28);
  }
  for (const [x, y] of [[-18, -5], [16, -8], [-7, 12], [9, -1]]) screenPart("Screen starlight", x, y, [0.8, 0.8, 0.12], "neonBlue", 2.28);
  screenPart("Player laser", 0, -0.3, [0.9, 2.4, 0.12], "neonPink", 2.28);

  roundedBox("Control deck rim", [0, 50, 32], [width - 3, 5, 30], "light");
  box("Control deck face", [0, 52.6, 32], [width - 9, 0.4, 25], "cabinetInk");
  box("Control deck accent", [0, 53, 43], [width - 13, 0.25, 1.4], "neonBlue");
  cylinder("Joystick socket", [-15, 53.3, 31], 4.1, 0.8, "cabinetMetal");
  cylinder("Joystick boot", [-15, 54.2, 31], 2.5, 1.2, "cabinetInk");
  cylinder("Joystick shaft", [-15, 57.2, 31], 0.9, 5, "cabinetMetal");
  ellipsoid("Joystick ball", [-15, 60.4, 31], [3.5, 3.5, 3.5], "neonPink");
  ellipsoid("Joystick glint", [-16, 62.1, 32.8], [0.9, 0.7, 0.6], "starWhite");
  for (const [column, x] of [6, 13, 20].entries()) for (const [row, z] of [28, 36].entries()) {
    cylinder("Action button socket", [x, 53.4, z], 3, 0.9, "screenBorder");
    cylinder("Action button", [x, 54.1, z], 2.3, 1.1, ["neonPink", "neonBlue", "neonGold"][(column + row) % 3]);
  }
  for (const x of [-20, -12]) cylinder("Start button", [x, 53.3, 22], 1.5, 0.7, "starWhite");

  box("Front kick panel", [0, 26, front - 0.4], [width - 9, 38, 1], "main");
  for (const x of [-23, 23]) box("Front enamel stripe", [x, 26, front + 0.25], [1.4, 33, 0.2], "light");
  roundedBox("Coin door rim", [0, 26, front + 0.5], [20, 24, 0.7], "cabinetMetal");
  box("Coin door", [0, 26, front + 1], [17, 21, 0.3], "cabinetInk");
  box("Coin slot surround", [-2.5, 32, front + 1.25], [8, 4, 0.3], "neonGold");
  box("Coin slot", [-2.5, 32, front + 1.5], [5, 1, 0.15], "cabinetInk");
  ellipsoid("Coin door lock", [5, 30, front + 1.4], [1, 1, 0.2], "cabinetMetal");
  box("Coin return", [0, 20.5, front + 1.2], [9, 5, 0.3], "screenBorder");
  box("Coin return recess", [0, 21, front + 1.4], [6, 2.5, 0.2], "cabinetInk");
  box("Front toe rail", [0, 7, front + 0.4], [width - 9, 3, 0.8], "cabinetInk");

  for (const side of [-1, 1]) {
    const x = side * (sideX + 1.4);
    sidePanel("Side inset border", [[-39, 15], [37, 15], [37, 40], [13, 46], [-6, 79], [-39, 89]], x, 0.12, "light");
    sidePanel("Side constellation panel", [[-37, 18], [34, 18], [34, 37], [10, 44], [-8, 77], [-37, 85]], x + side * 0.12, 0.1, "cabinetInset");
    sidePanel("Side comet trail", [[-34, 24], [24, 24], [-5, 40], [-34, 35]], x + side * 0.25, 0.1, "neonPink");
    sidePanel("Side comet highlight", [[-34, 31], [15, 31], [-8, 43], [-34, 39]], x + side * 0.35, 0.1, "neonBlue");
    sidePanel("Side starfighter", [[-16, 45], [-21, 50], [-12, 53], [-6, 69], [0, 53], [9, 50], [4, 45], [-6, 50]], x + side * 0.4, 0.1, "starWhite");
    sidePanel("Starfighter cockpit", [[-9, 52], [-6, 59], [-3, 52]], x + side * 0.52, 0.1, "neonBlue");
    for (const [z, y, size] of [[-27, 68, 2.3], [9, 32, 2], [-29, 47, 1.4]]) box("Side star", [x + side * 0.45, y, z], [0.12, size, size], "neonGold", [45, 0, 0]);
  }

  box("Rear service panel rim", [0, 48, back - 0.1], [width - 13, 72, 0.6], "shade");
  box("Rear service panel", [0, 48, back - 0.5], [width - 17, 68, 0.3], "light");
  for (const x of [-18, 18]) for (const y of [19, 77]) ellipsoid("Service panel screw", [x, y, back - 0.8], [0.7, 0.7, 0.18], "cabinetInk");
  for (const y of [32, 36, 40, 65, 69, 73]) box("Rear cooling vent", [0, y, back - 0.8], [30, 1.6, 0.25], "cabinetInk");
  box("Rear carrying grip", [0, 91, back - 0.2], [20, 5, 0.7], "cabinetInk");
  box("Rear grip inset", [0, 90.4, back - 0.65], [14, 1.4, 0.2], "cabinetMetal");
  box("Power socket", [10, 20, back - 0.9], [6, 5, 0.35], "cabinetInk");
  box("Power switch", [10, 20, back - 1.15], [2, 2.5, 0.15], "neonPink");
}

module.exports = { buildArcadeCabinet, arcadePalette };
