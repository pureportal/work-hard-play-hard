const { expansionRing } = require("./joinery.cjs");

const expandedEquipment = ["light-tripod", "light-mushroom", "light-tulip", "light-cage", "light-studio", "breakroom-vending", "breakroom-sink", "breakroom-microwave", "breakroom-bakery", "breakroom-popcorn", "breakroom-juice", "equipment-projector", "equipment-speakers"];

function buildExpandedEquipment(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, branch, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  if (id.startsWith("light-")) {
    if (id === "light-tripod" || id === "light-studio") {
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3 + Math.PI / 2;
        branch("Tripod leg", [Math.cos(angle) * (width / 2 - 2), 1, Math.sin(angle) * (depth / 2 - 2)], [0, 34, 0], 1.4, id === "light-tripod" ? "wood" : "main");
      }
    } else cylinder("Lamp foot", [0, 1.5, 0], width / 2 - 2, 3, "main");
    cylinder("Lamp stem", [0, 24, 0], 1.6, 45, "main");
    if (id === "light-tripod") {
      cylinder("Linen drum shade", [0, 48, 0], 18, 17, "cream");
      for (const y of [39.5, 56.5]) expansionRing(kit, "Shade piping", [0, y, 0], 18, 0.7, "main");
      for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; branch("Linen rib", [Math.cos(a) * 18, 40, Math.sin(a) * 18], [Math.cos(a) * 18, 56, Math.sin(a) * 18], 0.13, "strawShade"); }
    } else if (id === "light-mushroom") {
      ellipsoid("Mushroom dome", [0, 44, 0], [width / 2 - 1, 10, depth / 2 - 1], "main");
      cylinder("Mushroom diffuser", [0, 39, 0], width / 2 - 2, 1, "cream");
      expansionRing(kit, "Dome rim", [0, 41, 0], width / 2 - 1, 0.5, "light");
    } else if (id === "light-tulip") {
      cylinder("Tulip diffuser", [0, 48, 0], 5, 15, "cream", 12);
      for (let i = 0; i < 6; i++) { const a = i * 60; ellipsoid("Tulip glass petal", [Math.cos(a * Math.PI / 180) * 7, 48, Math.sin(a * Math.PI / 180) * 7], [4, 10, 3], i % 2 ? "light" : "main", [0, -a, 0]); }
    } else if (id === "light-cage") {
      ellipsoid("Warm light bulb", [0, 47, 0], [5, 8, 5], "cream");
      for (const y of [35, 58]) expansionRing(kit, "Cage ring", [0, y, 0], 12, 0.8, "main");
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; branch("Lantern cage bar", [Math.cos(a) * 12, 35, Math.sin(a) * 12], [Math.cos(a) * 12, 58, Math.sin(a) * 12], 0.75, "main"); }
      cylinder("Cage roof", [0, 60, 0], 13, 4, "main", 4);
    } else {
      cylinder("Spotlight body", [0, 49, 0], 12, 19, "main", 12, [90, 0, 0]);
      cylinder("Spotlight lens", [0, 49, 10], 9.5, 0.8, "cream", 9.5, [90, 0, 0]);
      for (const x of [-1, 1]) box("Spotlight barn door", [x * 14, 49, 10], [8, 18, 1], "shade", [0, x * -25, 0]);
      for (const y of [-1, 1]) box("Spotlight top flap", [0, 49 + y * 14, 10], [18, 8, 1], "main", [y * 25, 0, 0]);
      for (const x of [-15, 15]) box("Spotlight yoke", [x, 40, 0], [2, 22, 3], "gold");
    }
    return;
  }
  if (id === "breakroom-vending") {
    roundedBox("Vending cabinet", [0, 36, 0], [width - 1, 72, depth - 1], "main");
    box("Vending glass", [-6, 43, depth / 2], [width - 22, 43, 0.5], "ink");
    for (let row = 0; row < 3; row++) {
      box("Product shelf", [-6, 26 + row * 13, depth / 2 + 0.4], [width - 24, 1, 0.5], "gold");
      for (let col = 0; col < 4; col++) roundedBox("Snack packet", [-width / 2 + 10 + col * 9, 31 + row * 13, depth / 2 + 0.7], [6, 8, 0.7], ["pink", "cream", "green", "water"][col]);
    }
    box("Vending header", [0, 66, depth / 2 + 0.2], [width - 9, 6, 0.5], "light");
    box("Retrieval hatch", [-5, 10, depth / 2 + 0.2], [width - 26, 10, 0.5], "shade");
    for (let y = 30; y < 50; y += 5) cylinder("Selection button", [width / 2 - 8, y, depth / 2 + 0.5], 1.5, 0.5, "gold", 1.5, [90, 0, 0]);
  } else if (id === "equipment-speakers") {
    for (const x of [-width / 3, width / 3]) {
      roundedBox("Speaker cabinet", [x, 22, 0], [width / 3 - 2, 44, depth - 1], "main");
      for (const [y, radius] of [[13, 7], [32, 4]]) {
        cylinder("Speaker cone", [x, y, depth / 2], radius, 1, "ink", radius, [90, 0, 0]);
        expansionRing(kit, "Speaker surround", [x, y, depth / 2 + 0.8], radius - 1, 0.6, "gold", [0, 0, 0]);
        ellipsoid("Speaker dust cap", [x, y, depth / 2 + 1], [radius * 0.35, radius * 0.35, 0.5], "shade");
      }
    }
    roundedBox("Stereo receiver", [0, 7, 0], [width / 3 - 3, 14, depth - 3], "shade");
    box("Receiver display", [0, 10, depth / 2 - 1], [12, 3, 0.5], "water");
    for (const x of [-5, 5]) cylinder("Receiver knob", [x, 5, depth / 2], 2, 0.8, "gold", 2, [90, 0, 0]);
  } else if (id === "breakroom-sink") {
    roundedBox("Sink cabinet", [0, 17, 0], [width - 1, 34, depth - 1], "main");
    box("Stone counter", [0, 35, 0], [width - 0.2, 3, depth - 0.2], "light");
    roundedBox("Sink recess", [0, 36.6, 0], [width - 22, 0.2, depth - 16], "shade");
    roundedBox("Steel sink bowl", [0, 36.8, 1], [width - 28, 0.2, depth - 21], "waterLight");
    cylinder("Drain", [0, 37, 2], 2, 0.2, "ink");
    const curve = new THREE.CatmullRomCurve3([[0, 36, -depth / 2 + 5], [0, 49, -depth / 2 + 5], [0, 51, -5], [0, 47, -3]].map(p => new THREE.Vector3(...p)));
    shape("Gooseneck faucet", new THREE.TubeGeometry(curve, 28, 0.8, 8, false), [0, 0, 0], "gold");
    for (const x of [-width / 4, width / 4]) {
      box("Cabinet door", [x, 18, depth / 2 - 0.1], [width / 2 - 4, 28, 1], "main");
      box("Cabinet pull", [x, 28, depth / 2 + 0.6], [8, 1.2, 1], "gold");
    }
  } else {
    const height = id === "breakroom-bakery" ? 30 : 32;
    for (const x of [-width / 2 + 3, width / 2 - 3]) for (const z of [-depth / 2 + 3, depth / 2 - 3]) {
      cylinder("Cart upright", [x, height / 2, z], 1.3, height, "gold");
      cylinder("Cart caster", [x, 2, z], 2, 2, "shade", 2, [90, 0, 0]);
    }
    for (const y of [5, height]) roundedBox("Cart shelf", [0, y, 0], [width - 1, 3, depth - 1], "main");
    if (id === "equipment-projector" || id === "breakroom-microwave") {
      const projector = id === "equipment-projector";
      roundedBox(projector ? "Projector body" : "Microwave body", [0, height + (projector ? 6 : 12), 0], [width - 7, projector ? 9 : 21, depth - 5], "light");
      if (projector) {
        cylinder("Projector lens", [-8, height + 6, depth / 2 - 1], 4.5, 3, "shade", 4.5, [90, 0, 0]);
        cylinder("Lens glass", [-8, height + 6, depth / 2 + 0.7], 3.3, 0.3, "water", 3.3, [90, 0, 0]);
        for (let x = 1; x < width / 2 - 5; x += 3) box("Projector vent", [x, height + 6, depth / 2 - 2.2], [1, 5, 0.2], "shade");
        box("Projector cable box", [0, 9, 0], [width - 14, 6, depth - 12], "shade");
      } else {
        roundedBox("Microwave door", [-4, height + 12, depth / 2 - 2], [width - 21, 15, 0.5], "ink");
        box("Microwave handle", [width / 2 - 14, height + 12, depth / 2 - 1], [1.5, 12, 1.5], "gold");
        box("Microwave display", [width / 2 - 8, height + 17, depth / 2 - 1.7], [5, 3, 0.4], "water");
        cylinder("Microwave dial", [width / 2 - 8, height + 8, depth / 2 - 1], 2, 1, "main", 2, [90, 0, 0]);
      }
    } else if (id === "breakroom-bakery") {
      box("Pastry case back", [0, height + 14, -depth / 2 + 2], [width - 3, 26, 2], "main");
      for (const x of [-width / 2 + 2, width / 2 - 2]) box("Case glass side", [x, height + 14, 0], [1, 26, depth - 2], "waterLight");
      for (const y of [height + 3, height + 16]) {
        box("Pastry tray", [0, y, 0], [width - 7, 1.5, depth - 7], "cream");
        for (const x of [-width / 3, 0, width / 3]) for (const z of [-9, 9]) ellipsoid("Baked bun", [x, y + 3, z], [7, 3, 5], "gold");
      }
      for (const z of [-depth / 2 + 1, depth / 2 - 1]) box("Glazed case roof rail", [0, height + 28, z], [width, 2, 2], "main");
      for (const x of [-width / 2 + 1, width / 2 - 1]) box("Glazed case roof end", [x, height + 28, 0], [2, 2, depth], "main");
      for (const x of [-width / 3, 0, width / 3]) for (const z of [-9, 9]) branch("Bun score", [x - 3, height + 22.1, z - 1], [x + 3, height + 22.1, z + 1], 0.3, "cream");
    } else if (id === "breakroom-popcorn") {
      for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) box("Popcorn case pillar", [x, height + 19, z], [2, 38, 2], "main");
      cylinder("Popcorn kettle", [0, height + 27, 0], 8, 8, "gold");
      roundedBox("Striped canopy", [0, height + 41, 0], [width - 1, 6, depth - 1], "main");
      for (let x = -width / 2 + 5; x < width / 2; x += 8) box("Canopy stripe", [x, height + 44.1, 0], [3, 0.2, depth - 2], "cream");
      for (let i = 0; i < 32; i++) ellipsoid("Popcorn kernel", [(i * 13 % (width - 12)) - (width - 12) / 2, height + 3 + i % 3, (i * 17 % (depth - 12)) - (depth - 12) / 2], [2, 2, 1.8], i % 2 ? "cream" : "paper");
    } else if (id === "breakroom-juice") {
      for (const [index, x] of [-width / 4, width / 4].entries()) {
        roundedBox("Drink dispenser", [x, height + 14, -3], [width / 2 - 5, 22, depth - 9], index ? "pink" : "gold");
        box("Dispenser lid", [x, height + 27, -3], [width / 2 - 4, 3, depth - 8], "main");
        box("Dispenser foot", [x, height + 3, -3], [width / 2 - 7, 5, depth - 9], "shade");
        branch("Drink tap", [x, height + 8, depth / 2 - 7], [x, height + 8, depth / 2 - 2], 1.2, "gold");
        box("Tap lever", [x, height + 11, depth / 2 - 2], [1.3, 5, 1.3], "ink");
      }
    }
  }
}

module.exports = { expandedEquipment, buildExpandedEquipment };
