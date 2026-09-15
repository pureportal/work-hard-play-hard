const { buildChessTable, buildFallingBlocksTable } = require("./game-tables.cjs");
const { buildCelebrationGong } = require("./celebration-gong.cjs");
const { buildArcadeCabinet } = require("./arcade-cabinet.cjs");

function buildEquipment(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  if (id === "equipment-chess") return buildChessTable(kit, width, depth);
  if (id === "equipment-falling-blocks") return buildFallingBlocksTable(kit, width, depth);
  if (id === "equipment-arcade") return buildArcadeCabinet(kit, width, depth);
  if (asset.kind === "whiteboard") {
    const height = 56;
    for (const x of [-width / 2 + 4, width / 2 - 4]) {
      roundedBox("Board foot", [x, 1.3, 0], [6, 2.6, depth - 0.4], "shade");
      cylinder("Board upright", [x, height / 2, 0], 1.7, height, "shade");
      for (const z of [-depth / 2 + 3, depth / 2 - 3]) cylinder("Board caster", [x, 1, z], 1.8, 3, "ink", 1.8, [0, 0, 90]);
    }
    roundedBox("Board frame", [0, 37, 0], [width - 1, 41, 3], "shade");
    box("Frame inner trim", [0, 37, 1.52], [width - 3, 38, 0.18], "main");
    box("Writing surface", [0, 37, 1.65], [width - 6, 36, 0.3], "paper");
    box("Back panel", [0, 37, -1.65], [width - 7, 35, 0.3], "light");
    for (const x of [-width / 2 + 6, width / 2 - 6]) for (const y of [21, 53]) ellipsoid("Frame fastening", [x, y, -1.9], [0.7, 0.7, 0.2], "gold");
    box("Marker tray", [0, 16, 3], [width - 12, 1.5, 5], "shade");
    for (let i = 0; i < 3; i++) box("Marker", [-12 + i * 9, 17, 3], [6, 1.4, 1.4], ["pink", "water", "green"][i]);
    if (id === "equipment-checklist") for (let i = 0; i < 3; i++) {
      box("Checklist square", [-width / 2 + 14, 46 - i * 9, 1.9], [4, 4, 0.2], "main");
      box("Checklist line", [3, 46 - i * 9, 1.9], [width - 43, 0.8, 0.2], "shade");
    }
  } else if (asset.kind === "gong") {
    buildCelebrationGong(kit, width, depth);
  } else if (id === "equipment-tic-tac-toe") {
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) {
      cylinder("Game table leg", [x, 14, z], 2, 28, "shade", 2.8);
      cylinder("Game table foot", [x, 1.5, z], 2.1, 3, "gold");
    }
    roundedBox("Game table", [0, 31, 0], [width - 0.5, 6, depth - 0.5], "main");
    roundedBox("Board border", [0, 34.2, 0], [width - 6, 0.4, depth - 6], "gold");
    for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) ellipsoid("Corner rivet", [x, 34.2, z], [0.8, 0.2, 0.8], "shade");
    box("Board", [0, 34.5, 0], [width - 14, 0.2, depth - 14], "paper");
    for (const i of [-1, 1]) {
      box("Grid line", [i * 13, 34.7, 0], [1.2, 0.1, depth - 18], "shade");
      box("Grid line", [0, 34.7, i * 13], [width - 18, 0.1, 1.2], "shade");
    }
    for (const turn of [-45, 45]) box("Cross", [-26, 34.9, -26], [15, 0.4, 2.2], "pink", [0, turn, 0]);
    shape("Nought", new THREE.TorusGeometry(7, 1.2, 6, 24), [0, 35, 0], "water", [1, 1, 1], [90, 0, 0]);
  } else if (asset.kind === "portal") {
    cylinder("Portal base", [0, 1, 0], width / 2 - 0.2, 2, "shade");
    cylinder("Portal enamel", [0, 2.05, 0], width / 2 - 2, 0.1, "main");
    for (const r of [width / 2 - 4, width / 2 - 9]) shape("Portal circle", new THREE.TorusGeometry(r, 0.9, 8, 64), [0, 2.2, 0], "light", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 4; i++) {
      box("Compass ray", [0, 2.5, 0], [2, 0.3, 30], "grain", [0, i * 45, 0]);
      box("Portal crystal", [Math.sin(i * Math.PI / 2) * 11, 2.8, Math.cos(i * Math.PI / 2) * 11], [4, 0.5, 4], "light", [0, 45, 0]);
    }
    cylinder("Portal heart", [0, 2.9, 0], 5, 0.3, "light");
    cylinder("Portal heart inset", [0, 3.1, 0], 2.8, 0.2, "main");
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      box("Portal rune", [Math.cos(angle) * 23, 2.6, Math.sin(angle) * 23], [2.2, 0.4, 4], "gold", [0, -i * 45, 0]);
    }
  }
}

function buildAppliance(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, shape, surfaceGrain, THREE } = kit;
  const fridge = asset.id === "breakroom-fridge";
  const cooler = asset.id === "breakroom-water-cooler";
  const height = fridge ? 64 : cooler ? 40 : 34;
  box("Appliance base", [0, 2, 0], [width - 0.5, 4, depth - 0.5], "shade");
  roundedBox("Appliance cabinet", [0, height / 2 + 2, 0], [width - 1, height - 4, depth - 1], "main");
  roundedBox("Appliance top", [0, height, 0], [width - 0.2, 2, depth - 0.2], "light");
  box("Rear service panel", [0, height / 2, -depth / 2 - 0.1], [width - 10, height - 13, 0.2], "shade");
  for (let row = 0; row < 4; row++) box("Cooling grille", [0, 8 + row * 3, -depth / 2 - 0.25], [width - 15, 1, 0.2], "main");
  if (fridge) {
    for (const [y, h] of [[18, 28], [48, 26]]) {
      roundedBox("Fridge door", [0, y, depth / 2], [width - 4, h, 3.5], "light");
      roundedBox("Fridge handle", [-width / 2 + 9, y, depth / 2 + 2.7], [2.5, 11, 2], "gold");
      box("Handle inset", [-width / 2 + 9, y, depth / 2 + 1.81], [4.5, 12, 0.1], "grain");
    }
    box("Fridge magnet", [8, 48, depth / 2 + 2], [5, 5, 0.6], "pink", [0, 0, 15]);
    box("Appliance emblem", [width / 2 - 10, 56, depth / 2 + 1.85], [5, 1, 0.2], "gold");
  } else if (cooler) {
    cylinder("Water bottle", [0, height + 12, 0], 9, 21, "water", 8);
    cylinder("Bottle shoulder", [0, height + 23, 0], 8, 3, "waterLight", 5);
    for (const y of [height + 4, height + 11, height + 18]) shape("Bottle rib", new THREE.TorusGeometry(8.7, 0.45, 8, 40), [0, y, 0], "waterLight", [1, 1, 1], [90, 0, 0]);
    ellipsoid("Bottle reflection", [-4.5, height + 12, 6.7], [0.8, 7, 0.4], "waterLight");
    box("Dispenser recess", [0, 28, depth / 2], [20, 14, 0.3], "shade");
    for (const x of [-5, 5]) box("Tap", [x, 29, depth / 2 + 1], [3, 4, 2], x < 0 ? "water" : "pink");
    roundedBox("Drip tray", [0, 20, depth / 2 + 1], [23, 2, 4], "light");
    for (let x = -8; x <= 8; x += 4) box("Tray slot", [x, 21.1, depth / 2 + 1], [1, 0.1, 3], "shade");
  } else {
    roundedBox("Countertop", [0, height + 1.5, 0], [width, 3, depth], "wood");
    surfaceGrain([0, height + 3.1, 0], width - 7, depth - 7);
    for (const x of [-width / 4, width / 4]) {
      box("Cupboard door", [x, 17, depth / 2], [width / 2 - 5, 26, 1], "light");
      box("Handle", [x, 23, depth / 2 + 1], [8, 1, 1], "gold");
    }
    roundedBox("Coffee machine", [-17, height + 14, -6], [30, 24, 24], "main");
    box("Coffee machine face", [-17, height + 14, 6.2], [25, 17, 0.4], "ink");
    roundedBox("Machine drip tray", [-17, height + 3.8, 8], [28, 1.5, 8], "shade");
    for (const x of [-24, -10]) cylinder("Coffee spout", [x, height + 13, 8], 1, 5, "gold");
    for (const x of [-24, -10]) {
      cylinder("Coffee cup", [x, height + 6, 9], 3, 6, "cream");
      ellipsoid("Control", [x, height + 20, 6.6], [1.5, 1.5, 0.4], "gold");
    }
    for (let i = 0; i < 3; i++) cylinder("Cup stack", [20, height + 4 + i * 3, 0], 5, 3, "cream", 5.5);
  }
}

module.exports = { buildEquipment, buildAppliance };
