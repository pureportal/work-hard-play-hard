const { expansionLegs, expansionRing } = require("./joinery.cjs");

const expandedSeating = {
  "chair-windsor": "windsor", "chair-cantilever": "cantilever", "chair-director": "director",
  "chair-rocker": "rocker", "chair-papasan": "papasan", "chair-wingback": "wingback",
  "chair-shell": "shell", "chair-folding": "folding", "chair-saddle": "saddle",
  "chair-drum": "drum", "chair-zaisu": "zaisu", "chair-rattan": "rattan",
  "sofa-chesterfield": "chesterfield", "sofa-futon": "futon", "sofa-daybed": "daybed",
  "sofa-bench-storage": "storage", "sofa-banquette": "banquette", "sofa-slat-bench": "slat", "sofa-chaise": "chaise",
};

function buildExpandedSeating(kit, asset, width, depth) {
  const style = expandedSeating[asset.id];
  const { box, roundedBox, cylinder, ellipsoid, branch, shape, THREE } = kit;
  const seat = style === "zaisu" ? 5 : style === "drum" ? 13 : style === "saddle" ? 23 : style === "papasan" ? 12 : 17;
  const backless = ["saddle", "drum", "storage", "slat", "daybed"].includes(style);
  const rear = -depth / 2 + 3;
  if (style === "drum") {
    cylinder("Upholstered drum", [0, 6.5, 0], width / 2 - 1, 12, "main");
    ellipsoid("Rounded pouf cushion", [0, seat - 1, 0], [width / 2 - 1, 3, depth / 2 - 1], "light");
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      branch("Vertical upholstery welt", [Math.cos(angle) * (width / 2 - 0.8), 3, Math.sin(angle) * (depth / 2 - 0.8)], [Math.cos(angle) * (width / 2 - 0.8), 10, Math.sin(angle) * (depth / 2 - 0.8)], 0.25, "stitch");
    }
    expansionRing(kit, "Pouf piping", [0, 12.4, 0], width / 2 - 1.7, 0.4, "stitch");
    return { seatHeight: seat, seatHasBack: false };
  }
  if (style === "papasan") {
    cylinder("Basket pedestal", [0, 4, 0], 12, 8, "wood", 9);
    const profile = [[0, 4], [12, 4], [20, 9], [23, 16], [22, 18], [19, 13], [12, 10], [0, 10]].map(point => new THREE.Vector2(...point));
    shape("Continuous woven bowl", new THREE.LatheGeometry(profile, 48), [0, 0, 0], "wood");
    ellipsoid("Papasan seat cushion", [0, 13, 2], [width / 2 - 4, 3, depth / 2 - 5], "light");
    ellipsoid("Curved back cushion", [0, 19, -9], [width / 2 - 3, 8, 10], "main", [-10, 0, 0]);
    expansionRing(kit, "Woven bowl rim", [0, 17, 0], 22, 1, "wood");
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      branch("Basket rib", [Math.cos(angle) * 12, 4, Math.sin(angle) * 12], [Math.cos(angle) * 22, 16, Math.sin(angle) * 22], 0.45, "main");
    }
    return { seatHeight: 16, seatHasBack: true };
  }
  if (style === "saddle") {
    cylinder("Stool column", [0, 11, 0], 2, 21, "shade");
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      branch("Stool foot", [0, 3, 0], [Math.cos(angle) * 15, 1, Math.sin(angle) * 15], 1.3, "shade");
    }
    for (const x of [-7, 7]) ellipsoid("Saddle cushion lobe", [x, seat - 1, 0], [8, 3.5, depth / 2 - 3], "main", [0, 0, x > 0 ? -7 : 7]);
    expansionRing(kit, "Foot ring", [0, 8, 0], 9, 0.7, "gold");
    return { seatHeight: seat, seatHasBack: false };
  }
  if (style === "zaisu") {
    roundedBox("Floor seat", [0, 2.5, 5], [width - 2, 5, depth - 12], "main");
    roundedBox("Zaisu cushion", [0, 5, 5], [width - 5, 4, depth - 15], "light");
    roundedBox("Zaisu back", [0, 16, rear + 6], [width - 2, 27, 5], "wood");
    roundedBox("Zaisu back pad", [0, 16, rear + 9], [width - 6, 22, 3], "main");
    return { seatHeight: seat, seatHasBack: true };
  }
  if (style === "storage") {
    roundedBox("Storage bench chest", [0, 8, 0], [width - 1, 16, depth - 1], "main");
    for (const x of [-width / 4, width / 4]) {
      box("Storage panel", [x, 8, depth / 2 - 0.3], [width / 2 - 4, 12, 1], "shade");
      box("Storage handle", [x, 10, depth / 2 + 0.3], [7, 1.2, 1], "gold");
    }
  } else if (style === "cantilever") {
    for (const x of [-width / 2 + 3, width / 2 - 3]) {
      branch("Cantilever runner", [x, 1, rear], [x, 1, depth / 2 - 2], 1.1, "gold");
      branch("Cantilever upright", [x, 1, depth / 2 - 2], [x, seat - 2, depth / 2 - 2], 1.1, "gold");
      branch("Cantilever seat rail", [x, seat - 2, depth / 2 - 2], [x, seat - 2, rear], 1.1, "gold");
      branch("Cantilever back rail", [x, seat - 2, rear], [x, seat + 23, rear], 1.1, "gold");
    }
  } else if (style === "director" || style === "folding") {
    for (const x of [-width / 2 + 3, width / 2 - 3]) for (const side of [-1, 1]) branch("Crossed folding leg", [x, 1, side * (depth / 2 - 3)], [x, seat - 1, -side * (depth / 2 - 3)], 1.6, "wood");
    for (const x of [-width / 2 + 3, width / 2 - 3]) cylinder("Folding pivot", [x, seat / 2, 0], 1.6, 1.2, "gold", 1.6, [0, 0, 90]);
  } else expansionLegs(kit, width, depth, seat - 5, style === "shell" ? "hairpin" : "tapered");
  if (style === "slat" || style === "windsor" || style === "rocker") {
    for (let z = rear; z <= depth / 2 - 2; z += 5) roundedBox("Wood seat slat", [0, seat - 1, z], [width - 1, 2.4, 3.9], style === "slat" ? "main" : "wood");
  } else {
    roundedBox("Seat frame", [0, seat - 5, 0], [width - 1, 4, depth - 1], "shade");
    const count = asset.kind === "sofa" ? Math.max(1, Math.floor(width / 32)) : 1;
    for (let i = 0; i < count; i++) {
      const x = ((i + 0.5) / count - 0.5) * (width - 3);
      roundedBox("Seat cushion", [x, seat - 1, 1], [(width - 4) / count - 1, 5, depth - 5], "light");
      box("Front cushion welt", [x, seat + 1, depth / 2 - 1.7], [(width - 4) / count - 3, 0.45, 0.35], "stitch");
    }
  }
  if (!backless) {
    if (style === "windsor" || style === "rocker" || style === "rattan") {
      const high = style === "rocker" ? 29 : 24;
      for (let x = -width / 2 + 5; x < width / 2 - 3; x += 4) {
        branch("Back spindle", [x, seat, rear], [x, seat + high - Math.abs(x) * 0.14, rear], 0.6, "wood");
        if (style === "rattan") for (let y = seat + 3; y < seat + high; y += 4) box("Wicker cross weave", [0, y, rear + 0.8], [width - 6, 0.7, 0.7], "main");
      }
      roundedBox("Curved top rail", [0, seat + high, rear], [width - 1, 4, 3], "main");
    } else if (style === "director") {
      for (const x of [-width / 2 + 3, width / 2 - 3]) box("Director back post", [x, seat + 10, rear], [2.5, 25, 2.5], "wood");
      box("Canvas back sling", [0, seat + 16, rear], [width - 5, 11, 1], "main");
    } else {
      const height = style === "wingback" ? 38 : style === "banquette" ? 33 : style === "folding" ? 12 : 21;
      const backWidth = style === "chaise" ? width * 0.38 : width - 2;
      const x = style === "chaise" ? -width * 0.3 : 0;
      if (style === "shell") ellipsoid("Moulded oval shell back", [0, seat + 9, rear + 2], [width / 2 - 1, 12, 3], "main");
      else roundedBox("Shaped upholstered back", [x, seat + height / 2, rear], [backWidth, height, 6], "main");
      if (["chesterfield", "banquette", "wingback"].includes(style)) for (let tx = -backWidth / 2 + 6; tx < backWidth / 2 - 3; tx += 9) for (const y of [seat + 7, seat + 17]) {
        ellipsoid("Upholstery tuft", [tx, y, rear + 3.1], [0.85, 0.85, 0.5], "stitch");
        if (style === "chesterfield") for (const side of [-1, 1]) branch("Diamond quilting", [tx - 4, y - side * 5, rear + 3.1], [tx + 4, y + side * 5, rear + 3.1], 0.15, "stitch");
      }
      if (style === "futon") for (let x = -width / 2 + 10; x < width / 2; x += 14) box("Futon channel", [x, seat + 10, rear + 3.05], [0.5, 17, 0.15], "stitch");
      if (style === "wingback") for (const side of [-1, 1]) roundedBox("Wingback cheek", [side * (width / 2 - 4), seat + 24, rear + 6], [6, 23, 12], "main");
    }
  }
  if (["director", "rattan", "rocker", "wingback", "chesterfield", "daybed"].includes(style)) for (const side of [-1, 1]) {
    const x = side * (width / 2 - 3);
    if (style === "chesterfield" || style === "daybed") cylinder("Rolled bolster", [x, seat + 6, 0], 5, depth - 1, "main", 5, [90, 0, 0]);
    else {
      box("Arm support", [x, seat + 4, depth / 2 - 5], [2, 10, 2], "wood");
      roundedBox("Armrest", [x, seat + 9, 0], [4, 3, depth - 2], style === "wingback" ? "main" : "wood");
    }
  }
  if (style === "rocker") for (const x of [-width / 2 + 4, width / 2 - 4]) {
    const points = Array.from({ length: 7 }, (_, i) => new THREE.Vector3(x, 1 + ((i - 3) / 3) ** 2 * 4, (i / 6 - 0.5) * (depth - 1)));
    shape("Curved rocking runner", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, 1.5, 6, false), [0, 0, 0], "wood");
  }
  return { seatHeight: seat, seatHasBack: !backless };
}

module.exports = { expandedSeating, buildExpandedSeating };
