const { expansionDrawers, expansionRing } = require("./joinery.cjs");

const expandedFixtures = ["storage-apothecary", "storage-ladder", "storage-trunk", "storage-plan-chest", "storage-rolling-cart", "fixture-divider", "fixture-slats", "fixture-barrier", "fixture-coat-rack", "fixture-umbrella", "fixture-recycling", "fixture-shoe-rack", "fixture-parcels", "fixture-bicycle", "fixture-signpost"];

function buildExpandedFixture(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, branch, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  if (id === "storage-apothecary") {
    for (const x of [-width / 3, 0, width / 3]) expansionDrawers(kit, x, 0, width / 3 - 0.4, depth - 1, 40, 4);
    box("Apothecary cornice", [0, 41, 0], [width - 0.2, 3, depth - 0.2], "light");
    for (const x of [-width / 3, 0, width / 3]) for (const y of [7, 15, 23, 31]) box("Apothecary label", [x, y, depth / 2 + 0.3], [6, 2, 0.3], "cream");
  } else if (id === "storage-plan-chest") {
    expansionDrawers(kit, 0, 0, width - 1, depth - 1, 29, 6);
    box("Plan chest top", [0, 30, 0], [width - 0.2, 2, depth - 0.2], "light");
    for (const y of [5, 9, 13, 17, 21, 25]) for (const x of [-width / 3, width / 3]) box("Wide drawer pull", [x, y, depth / 2 + 0.3], [8, 1, 1], "gold");
  } else if (id === "storage-trunk") {
    roundedBox("Storage trunk", [0, 12, 0], [width - 1, 24, depth - 1], "main");
    roundedBox("Trunk lid", [0, 25, 0], [width - 0.3, 4, depth - 0.3], "light");
    for (const x of [-width / 3, width / 3]) {
      box("Trunk binding", [x, 27.1, 0], [4, 0.3, depth - 1], "wood");
      box("Trunk strap", [x, 13, depth / 2 - 0.2], [4, 23, 0.5], "wood");
      box("Brass trunk latch", [x, 19, depth / 2 + 0.2], [5, 5, 1], "gold");
    }
    for (const x of [-width / 2 + 0.3, width / 2 - 0.3]) expansionRing(kit, "Side carry handle", [x, 15, 0], 4, 0.7, "gold", [0, 90, 0]);
  } else if (["storage-ladder", "storage-rolling-cart", "fixture-shoe-rack", "fixture-parcels"].includes(id)) {
    const ladder = id === "storage-ladder";
    const height = ladder ? 64 : id === "fixture-parcels" ? 54 : id === "fixture-shoe-rack" ? 25 : 37;
    const rows = ladder ? 4 : 3;
    for (const x of [-width / 2 + 2, width / 2 - 2]) for (const z of [-depth / 2 + 2, depth / 2 - 2]) branch("Shelf upright", [x, 1, z], [x, height, ladder ? -depth / 2 + 4 + (z > 0 ? 8 : 0) : z], 1.5, "wood");
    for (let row = 0; row < rows; row++) {
      const y = 4 + row * (height - 8) / (rows - 1);
      const shelfDepth = ladder ? depth - row * 4 : depth - 1;
      const z = ladder ? -row * 2 : 0;
      if (id === "fixture-shoe-rack") {
        for (let slat = -shelfDepth / 2 + 3; slat < shelfDepth / 2; slat += 5) box("Shoe rack slat", [0, y, slat], [width - 1, 2, 3], "main");
      } else box("Shelf board", [0, y, z], [width - 1, 2, shelfDepth], "main");
      if (id === "fixture-parcels") for (const [index, x] of [-width / 4, width / 4].entries()) {
        box("Parcel", [x, y + 7, 0], [20, 12 + index * 2, depth - 8], index ? "cream" : "wood");
        box("Parcel tape", [x, y + 13 + index * 2, 0], [3, 0.3, depth - 7], "gold");
      }
      if (id === "fixture-shoe-rack" && row !== 1) for (const x of [-width / 3, -width / 6, width / 6, width / 3]) {
        ellipsoid("Shoe toe", [x, y + 4, 4], [4, 2.5, 8], "shade");
        roundedBox("Shoe heel", [x, y + 5, -2], [7, 6, 8], "light");
        for (const z of [-1, 2, 5]) box("Shoe lace", [x, y + 7, z], [5, 0.3, 0.6], "cream");
      }
    }
    if (id === "storage-rolling-cart") {
      for (const x of [-width / 2 + 3, width / 2 - 3]) for (const z of [-depth / 2 + 3, depth / 2 - 3]) cylinder("Caster wheel", [x, 2, z], 2, 2, "shade", 2, [90, 0, 0]);
      for (const x of [-width / 2 + 2, width / 2 - 2]) box("Cart handle", [x, 41, 0], [2, 2, depth - 3], "gold");
    }
  } else if (id === "fixture-divider" || id === "fixture-slats") {
    for (const x of [-width / 2 + 6, width / 2 - 6]) box("Partition foot", [x, 1.5, 0], [10, 3, depth - 0.2], "shade");
    if (id === "fixture-divider") {
      roundedBox("Acoustic felt panel", [0, 31, 0], [width - 1, 54, 5], "main");
      for (let x = -width / 2 + 5; x < width / 2; x += 6) box("Acoustic channel", [x, 31, 2.6], [0.5, 48, 0.2], "stitch");
    } else {
      for (let x = -width / 2 + 3; x < width / 2; x += 7) box("Vertical timber slat", [x, 32, 0], [3, 62, 5], "main");
      for (const y of [4, 60]) box("Partition cross rail", [0, y, 0], [width - 1, 3, 4], "wood");
    }
  } else if (id === "fixture-barrier") {
    for (const x of [-width / 2 + 6, width / 2 - 6]) {
      cylinder("Barrier foot", [x, 1.2, 0], 6, 2.4, "main");
      cylinder("Barrier post", [x, 16, 0], 1.4, 30, "gold");
      ellipsoid("Post finial", [x, 31, 0], [2.7, 2.7, 2.7], "main");
    }
    const curve = new THREE.CatmullRomCurve3([[-width / 2 + 6, 28, 0], [0, 22, 0], [width / 2 - 6, 28, 0]].map(point => new THREE.Vector3(...point)));
    shape("Velvet rope", new THREE.TubeGeometry(curve, 24, 1.4, 8, false), [0, 0, 0], "main");
  } else if (id === "fixture-coat-rack") {
    cylinder("Coat stand base", [0, 2, 0], 15, 4, "main");
    cylinder("Coat stand trunk", [0, 29, 0], 2.3, 56, "wood");
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const tip = [Math.cos(angle) * 17, 54, Math.sin(angle) * 17];
      branch("Coat hook", [0, 44, 0], tip, 1, "main");
      ellipsoid("Hook tip", tip, [2, 2, 2], "gold");
    }
    roundedBox("Hanging scarf", [8, 36, 9], [6, 27, 1.4], "light");
    for (let x = 6; x <= 10; x += 2) box("Scarf fringe", [x, 21, 9], [0.5, 4, 1], "gold");
  } else if (id === "fixture-umbrella") {
    cylinder("Umbrella basket", [0, 10, 0], 10, 20, "main", 11);
    cylinder("Umbrella basket opening", [0, 20.2, 0], 9, 0.3, "shade");
    for (const [index, x] of [-5, 1, 6].entries()) {
      cylinder("Folded umbrella", [x, 23, 0], 2.3, 28 + index * 3, index % 2 ? "light" : "main", 0.9);
      branch("Umbrella handle", [x, 34, 0], [x, 43 + index * 2, 0], 0.7, "gold");
      expansionRing(kit, "Curved handle", [x + 1.4, 42 + index * 2, 0], 1.5, 0.5, "wood", [0, 0, 0]);
    }
  } else if (id === "fixture-recycling") {
    for (let index = 0; index < 3; index++) {
      const x = (index - 1) * width / 3;
      roundedBox("Sorting bin", [x, 16, 0], [width / 3 - 1, 32, depth - 2], "main");
      roundedBox("Bin lid", [x, 33, 0], [width / 3 - 1, 3, depth - 1], ["green", "water", "gold"][index]);
      box("Waste opening", [x, 35, 0], [width / 3 - 8, 0.5, 5], "ink");
      box("Bin front inset", [x, 18, depth / 2 - 0.7], [width / 3 - 7, 14, 0.3], "light");
    }
  } else if (id === "fixture-bicycle") {
    for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Rack ground rail", [0, 1.5, z], [width - 1, 3, 4], "main");
    for (const x of [-width / 3, 0, width / 3]) {
      const curve = new THREE.CatmullRomCurve3([[x, 2, -depth / 2 + 3], [x, 19, -depth / 2 + 3], [x, 25, 0], [x, 19, depth / 2 - 3], [x, 2, depth / 2 - 3]].map(point => new THREE.Vector3(...point)));
      shape("Bicycle parking hoop", new THREE.TubeGeometry(curve, 28, 1.5, 8, false), [0, 0, 0], "main");
    }
  } else if (id === "fixture-signpost") {
    cylinder("Sign base", [0, 1.5, 0], 12, 3, "shade");
    cylinder("Sign pole", [0, 26, 0], 1.5, 50, "gold");
    for (const [index, y] of [48, 37].entries()) {
      roundedBox("Direction board", [0, y, 0], [width - 2, 9, 3], "main");
      for (const z of [-1.6, 1.6]) {
        box("Direction stem", [index ? 2 : -2, y, z], [12, 1.3, 0.2], "light");
        for (const side of [-1, 1]) box("Arrowhead", [index ? -5 : 5, y + side * 2, z], [6, 1.2, 0.2], "light", [0, 0, (index ? -1 : 1) * side * 45]);
      }
    }
  }
}

module.exports = { expandedFixtures, buildExpandedFixture };
