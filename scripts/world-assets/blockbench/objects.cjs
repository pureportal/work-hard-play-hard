function buildStorage(kit, asset, width, depth) {
  const { box, roundedBox, ellipsoid, surfaceGrain } = kit;
  const id = asset.id;
  const height = ["storage-locker", "storage-display", "equipment-bookshelf"].includes(id) ? 62 : 32;
  box("Cabinet back", [0, height / 2, -depth / 2 + 1], [width - 0.6, height, 2], "shade");
  for (const x of [-width / 2 + 1.5, width / 2 - 1.5]) box("Cabinet side", [x, height / 2, 0], [3, height, depth - 0.6], "main");
  for (const y of [2, height - 1]) roundedBox("Cabinet board", [0, y, 0], [width - 0.5, 3, depth - 0.5], "light");
  surfaceGrain([0, height + 0.57, 0], width - 8, depth - 8);
  box("Rear inset panel", [0, height / 2, -depth / 2 - 0.04], [width - 7, height - 9, 0.12], "main");
  for (const x of [-width / 2 + 1.5, width / 2 - 1.5]) {
    box("Side inset panel", [x + Math.sign(x) * 1.55, height / 2, 0], [0.12, height - 9, depth - 8], "grain");
    for (const y of [7, height - 7]) box("Side rail", [x + Math.sign(x) * 1.62, y, 0], [0.1, 1.2, depth - 8], "main");
  }
  const open = ["storage-cubby", "storage-display", "equipment-bookshelf"].includes(id);
  const columns = Math.max(1, Math.round(width / 30));
  if (open) {
    const rows = height > 40 ? 3 : 2;
    for (let row = 1; row < rows; row++) box("Shelf", [0, row * height / rows, 0], [width - 3, 2, depth - 1], "main");
    for (let col = 1; col < columns; col++) box("Divider", [(col / columns - 0.5) * width, height / 2, 0], [2, height - 3, depth - 2], "main");
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const x = ((col + 0.5) / columns - 0.5) * width;
      if (id === "storage-display") {
        ellipsoid("Display ornament", [x, row * height / rows + 9, depth / 2 - 4], [5, 6, 3], row % 2 ? "pink" : "gold");
        box("Display plinth", [x, row * height / rows + 3.6, depth / 2 - 4], [12, 1.5, 9], "cream");
      } else for (let i = 0; i < 4; i++) {
        const h = Math.min(10 + (i * 3 + col) % 7, height / rows - 5.5);
        box("Book", [x - 7 + i * 4, row * height / rows + h / 2 + 3, 2], [3.2, h, depth - 9], ["pink", "main", "cream", "green"][i]);
        box("Spine band", [x - 7 + i * 4, row * height / rows + 6, depth / 2 - 2.3], [2.5, 0.8, 0.2], "gold");
      }
    }
  } else {
    const rows = id === "storage-filing" ? 3 : 1;
    for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
      const x = ((col + 0.5) / columns - 0.5) * width;
      const y = ((row + 0.5) / rows) * (height - 5) + 2;
      box("Cabinet front", [x, y, depth / 2 - 1], [width / columns - 4, (height - 5) / rows - 2, 2], "main");
      box("Handle", [x, y + 2, depth / 2 + 0.4], [7, 1.2, 1], "gold");
      box("Handle recess", [x, y + 2, depth / 2 + 0.15], [10, 3, 0.2], "shade");
      if (id === "storage-filing") {
        box("Label holder", [x, y - 1.7, depth / 2 + 0.2], [8, 2, 0.2], "gold");
        box("Drawer label", [x, y - 1.7, depth / 2 + 0.34], [6, 1.1, 0.1], "paper");
      }
      if (id === "storage-locker") for (let i = 0; i < 3; i++) box("Locker vent", [x, height - 8 - i * 3, depth / 2 + 0.1], [width / columns - 12, 0.8, 0.1], "shade");
    }
  }
  if (asset.footprint.some(region => region.allows?.includes("decoration"))) return { surfaceHeight: height + 0.5 };
}

function buildLamp(kit, asset, width, depth) {
  const { box, cylinder, ellipsoid, shape, THREE } = kit;
  const small = asset.placement.layer === "surface";
  const radius = Math.min(width, depth) / 2;
  const height = small ? 19 : asset.id === "light-crystal" ? 72 : 54;
  const footZ = asset.id === "light-arc" ? -16 : 0;
  const footRadius = radius * (asset.id === "light-arc" ? 0.86 : small ? 0.74 : 0.72);
  cylinder("Lamp foot", [0, 1.2, footZ], footRadius, 2.4, "shade", footRadius - 1);
  cylinder("Inset foot", [0, 2.45, footZ], footRadius - 2, 0.3, "main");
  cylinder("Stem collar", [0, 3, footZ], small ? 2 : 3, 2, "gold");
  if (asset.id === "light-arc") {
    const curve = new THREE.CatmullRomCurve3([[0, 2, -16], [0, 43, -16], [0, 59, -12], [0, 63, 4], [0, 55, 21], [0, 47, 21]].map(point => new THREE.Vector3(...point)));
    shape("Continuous arched stem", new THREE.TubeGeometry(curve, 40, 1.2, 8, false), [0, 0, 0], "gold");
    cylinder("Lamp shade", [0, height - 7, 21], 10, 10, "cream", 6);
    for (const y of [42, 52]) shape("Shade binding", new THREE.TorusGeometry(y === 42 ? 10 : 6, 0.55, 8, 40), [0, y, 21], "main", [1, 1, 1], [90, 0, 0]);
  } else {
    cylinder("Lamp stem", [0, height / 2, 0], small ? 1 : 1.7, height - 3, "gold");
  }
  if (asset.id === "light-crystal") {
    cylinder("Crystal cup", [0, height - 15, 0], 8, 4, "gold", 10);
    for (let i = 0; i < 5; i++) {
      const turn = i * Math.PI * 2 / 5;
      shape("Crystal petal", new THREE.OctahedronGeometry(1), [Math.cos(turn) * 8, height - 7 + i % 2 * 3, Math.sin(turn) * 8], i % 2 ? "main" : "light", [5, 13, 5], [Math.sin(turn) * 18, 0, Math.cos(turn) * -18]);
    }
    shape("Crystal heart", new THREE.OctahedronGeometry(1), [0, height, 0], "highlight", [4, 13, 4]);
  } else if (asset.id === "outdoor-lantern") {
    box("Lantern paper", [0, height - 15, 0], [22, 23, 22], "paper");
    for (const x of [-11, 11]) for (const z of [-11, 11]) box("Lantern stile", [x, height - 15, z], [2, 25, 2], "shade");
    for (const y of [height - 27, height - 3]) box("Lantern rail", [0, y, 0], [25, 2, 25], "main");
    for (const side of [-1, 1]) {
      box("Paper lattice", [0, height - 15, side * 11.1], [1.2, 22, 0.5], "wood");
      box("Paper lattice", [side * 11.1, height - 15, 0], [0.5, 22, 1.2], "wood");
    }
    const roof = [[0, 51], [13, 51], [20, 53], [20, 55], [15, 54], [9, 58], [3, 61], [0, 61]].map(point => new THREE.Vector2(...point));
    shape("Swept pagoda roof", new THREE.LatheGeometry(roof, 4), [0, 0, 0], "main", [1, 1, 1], [0, 45, 0]);
    ellipsoid("Roof finial", [0, 62, 0], [2, 3, 2], "gold");
  } else if (asset.id === "light-paper") {
    ellipsoid("Paper lantern", [0, height - 13, 0], [radius - 2, 19, radius - 2], "paper");
    for (let i = -3; i <= 3; i++) {
      const r = Math.sqrt(1 - (i / 4) ** 2) * (radius - 2);
      shape("Paper rib", new THREE.TorusGeometry(r, 0.45, 6, 40), [0, height - 13 + i * 4.5, 0], "grain", [1, 1, 1], [90, 0, 0]);
    }
    cylinder("Paper lantern crown", [0, height + 5, 0], 3, 1.3, "main");
  } else if (asset.id !== "light-arc") {
    const shadeHeight = small ? 9 : 17;
    const shadeY = height + (small ? 0 : -4);
    const bottomRadius = radius - 1;
    const topRadius = bottomRadius * 0.58;
    cylinder("Linen shade", [0, shadeY, 0], bottomRadius, shadeHeight, "cream", topRadius);
    for (const side of [-1, 1]) shape("Shade binding", new THREE.TorusGeometry(side < 0 ? bottomRadius : topRadius, small ? 0.35 : 0.55, 8, 40), [0, shadeY + side * shadeHeight / 2, 0], "main", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 12; i++) {
      const turn = i * Math.PI / 6;
      kit.branch("Linen fold", [Math.cos(turn) * bottomRadius, shadeY - shadeHeight / 2 + 0.6, Math.sin(turn) * bottomRadius], [Math.cos(turn) * topRadius, shadeY + shadeHeight / 2 - 0.6, Math.sin(turn) * topRadius], 0.15, "grain");
    }
  }
}

function buildDecoration(kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, shape, THREE } = kit;
  const id = asset.id;
  if (["decor-monitor", "decor-laptop"].includes(id)) {
    roundedBox("Computer base", [0, 1, 0], [width - 0.5, 2, depth - 0.5], "main");
    const h = id === "decor-monitor" ? 24 : 15;
    if (id === "decor-monitor") box("Monitor stand", [0, 8, -2], [3, 13, 3], "gold");
    roundedBox("Screen bezel", [0, h, -depth / 2 + 2], [width - 1, 16, 2.4], "shade");
    box("Screen", [0, h, -depth / 2 + 3.1], [width - 4, 13, 0.2], "ink");
    box("Screen sky", [0, h + 2, -depth / 2 + 3.25], [width - 6, 7, 0.1], "water");
    cylinder("Wallpaper sun", [7, h + 3, -depth / 2 + 3.4], 2.1, 0.1, "pink", 2.1, [90, 0, 0]);
    for (let row = 0; row < 2; row++) for (let x = -10; x < 10; x += 4) box("Keyboard key", [x, 2.1, 1 + row * 3], [2.8, 0.2, 2], "light");
    box("Trackpad", [0, 2.11, depth / 2 - 3], [7, 0.1, 2.5], "grain");
    box("Rear emblem", [0, h, -depth / 2 + 0.72], [3, 3, 0.2], "light", [0, 0, 45]);
    box("Display horizon", [0, h - 1, -depth / 2 + 3.4], [width - 6, 0.6, 0.1], "waterLight");
  } else if (id === "decor-pr-tray") {
    box("Tray base", [0, 1, 0], [width - 0.5, 2, depth - 0.5], "main");
    for (const x of [-width / 2 + 1, width / 2 - 1]) box("Tray rim", [x, 3.5, 0], [1.5, 5, depth - 0.5], "main");
    box("Tray back", [0, 3.5, -depth / 2 + 1], [width - 2, 5, 1.5], "main");
    box("Tray lip", [0, 1.7, depth / 2 - 1], [width - 2, 1.4, 1.5], "gold");
    for (let i = 0; i < 3; i++) {
      box("Review paperwork", [i === 1 ? -0.7 : 0.4, 2.6 + i * 1.2, i === 1 ? 0.7 : 0], [width - 6, 0.8, depth - 6], i === 1 ? "cream" : "paper", [0, i === 1 ? -4 : 0, 0]);
    }
    box("Review heading", [-2, 5.55, -depth / 2 + 7], [width - 15, 0.15, 1.1], "shade");
    for (let i = 0; i < 2; i++) box("Review lines", [-3 + i, 5.55, -2 + i * 3], [width - 18 - i * 2, 0.15, 0.65], "wood");
    box("Review tab", [width / 2 - 7, 5.6, depth / 2 - 6], [4, 0.4, 6], "green");
  } else if (id === "decor-books") {
    for (let i = 0; i < 3; i++) {
      box("Book cover", [0, 1 + i * 3.5, 0], [width - 2 - i * 2, 3.3, depth - 1], ["shade", "pink", "main"][i], [0, i * 5 - 5, 0]);
      box("Pages", [0, 1.3 + i * 3.5, depth / 2 - 0.5], [width - 5 - i * 2, 1.7, 0.4], "paper");
    }
    box("Embossed cover", [0, 9.72, 0], [width - 13, 0.12, depth - 7], "grain", [0, 5, 0]);
    box("Book ribbon", [3, 9.82, 0], [1.3, 0.1, depth], "gold", [0, 5, 0]);
  } else if (id === "decor-coffee") {
    cylinder("Saucer", [0, 0.8, 0], 7.5, 1.6, "main");
    cylinder("Cup", [0, 5, 0], 4.2, 7, "cream", 5.2);
    cylinder("Coffee", [0, 8.6, 0], 4.3, 0.2, "wood");
    shape("Cup handle", new THREE.TorusGeometry(2.4, 0.7, 6, 16), [5.2, 5, 0], "main");
    ellipsoid("Latte heart", [0, 8.8, 0], [2, 0.1, 1.5], "paper");
  } else if (id === "decor-clock") {
    box("Clock foot", [0, 1, 0], [15.5, 2, 15.5], "main");
    cylinder("Clock housing", [0, 9, 0], 7, 4, "main", 7, [90, 0, 0]);
    cylinder("Clock face", [0, 9, 2.1], 6, 0.2, "paper", 6, [90, 0, 0]);
    box("Hour hand", [1, 10, 2.3], [3, 0.7, 0.1], "ink", [0, 0, 40]);
    box("Minute hand", [0, 11, 2.3], [0.7, 4, 0.1], "ink");
    for (let hour = 0; hour < 12; hour++) {
      const turn = hour * Math.PI / 6;
      ellipsoid("Clock index", [Math.sin(turn) * 4.7, 9 + Math.cos(turn) * 4.7, 2.35], [0.3, 0.35, 0.1], "wood");
    }
    cylinder("Clock rear cover", [0, 9, -2.15], 5.8, 0.2, "shade", 5.8, [90, 0, 0]);
    cylinder("Clock winder", [0, 9, -2.5], 1.2, 0.8, "gold", 1.2, [90, 0, 0]);
  } else if (id === "decor-headphones") {
    box("Stand", [0, 1, 0], [15.5, 2, 15.5], "main");
    cylinder("Stand stem", [0, 10, 0], 1, 18, "gold");
    shape("Headphone band", new THREE.TorusGeometry(6, 1.4, 8, 32, Math.PI), [0, 17, 0], "shade");
    for (const x of [-6, 6]) {
      ellipsoid("Ear cup", [x, 15, 0], [2, 4, 3], "main");
      ellipsoid("Ear pad", [x - Math.sign(x), 15, 0], [1.1, 3.2, 2.6], "ink");
      ellipsoid("Ear cup glint", [x + Math.sign(x) * 1.8, 15.5, 0], [0.3, 2.2, 1.8], "light");
    }
  } else if (id === "decor-trophy") {
    box("Trophy base", [0, 2, 0], [width - 0.5, 4, depth - 0.5], "main");
    cylinder("Trophy stem", [0, 9, 0], 2, 12, "gold");
    shape("Star crystal", new THREE.OctahedronGeometry(1), [0, 21, 0], "light", [9, 12, 6]);
    shape("Crystal inner facet", new THREE.OctahedronGeometry(1), [-1.2, 22, 3.2], "highlight", [3.4, 7, 2]);
    box("Base inlay", [0, 4.1, 0], [width - 5, 0.2, depth - 5], "shade");
    box("Plaque", [0, 2, depth / 2], [10, 2, 0.2], "gold");
  } else if (id === "decor-maneki-cat") {
    cylinder("Cushion", [0, 1.5, 0], 7.7, 3, "main");
    ellipsoid("Cat body", [0, 8, 0], [5.5, 7, 5], "light");
    ellipsoid("Cat head", [0, 17, 0], [6.5, 5.5, 5], "light");
    for (const x of [-4, 4]) shape("Cat ear", new THREE.ConeGeometry(2.8, 5, 4), [x, 22, 0], "main");
    for (const x of [-2.5, 2.5]) ellipsoid("Happy eye", [x, 18, 4.6], [1.1, 0.4, 0.3], "ink");
    ellipsoid("Lucky paw", [6, 14, 0], [2.2, 5, 2.2], "light");
    ellipsoid("Coin", [0, 9, 4.6], [3, 4, 0.6], "gold");
  } else if (id === "decor-vase") {
    cylinder("Vase foot", [0, 1, 0], 7.5, 2, "shade");
    ellipsoid("Glazed vase", [0, 8, 0], [6.5, 8, 6.5], "main");
    cylinder("Vase neck", [0, 15, 0], 3.2, 6, "light");
    cylinder("Vase lip", [0, 18, 0], 3.7, 1, "gold");
    cylinder("Vase opening", [0, 18.56, 0], 2.5, 0.1, "soil");
    shape("Glaze ring", new THREE.TorusGeometry(5.8, 0.4, 6, 40), [0, 7, 0], "light", [1, 1, 1], [90, 0, 0]);
    ellipsoid("Glaze glint", [-2.5, 10, 5], [0.6, 3, 0.25], "highlight", [0, 0, -12]);
  } else throw new Error(`Missing decoration model: ${id}`);
}

module.exports = { buildStorage, buildLamp, buildDecoration };
