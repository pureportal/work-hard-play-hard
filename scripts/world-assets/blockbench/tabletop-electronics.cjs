const tabletopElectronics = ["decor-laptop", "decor-headphones", "decor-desk-fan"];

function buildLaptop(api, kit, width, depth) {
  const { box, roundedBox, cylinder, shape, THREE } = kit;
  const hingeZ = -depth / 2 + 4.8;
  roundedBox("Laptop lower case", [0, 0.5, 0], [width - 0.8, 1, depth - 0.8], "shade");
  roundedBox("Keyboard deck", [0, 1.15, 0], [width - 1, 0.65, depth - 1], "main");
  for (const x of [-10, 10]) cylinder("Display hinge", [x, 1.8, hingeZ], 0.9, 6, "light", 0.9, [0, 0, 90]);
  const display = new api.Group({ name: "Hinged laptop display", origin: [0, 1.8, hingeZ], rotation: [-12, 0, 0] }).addTo(kit.group).init();
  roundedBox("Display lid", [0, 10.8, hingeZ], [width - 1, 18, 1.2], "main").addTo(display);
  box("Display bezel", [0, 11, hingeZ + 0.65], [width - 2.6, 16.3, 0.2], "ink").addTo(display);
  box("Display glass", [0, 11, hingeZ + 0.8], [width - 4, 14.6, 0.1], "water").addTo(display);
  shape("Wallpaper sun", new THREE.CircleGeometry(2, 24), [7.5, 14.8, hingeZ + 0.92], "cream").addTo(display);
  const edge = (width - 4) / 2;
  for (const [name, material, z, points] of [
    ["Distant landscape", "waterLight", 1, [[-edge, 8], [-7, 13.5], [0, 8.5], [7, 11.5], [edge, 7.5]]],
    ["Foreground landscape", "green", 1.1, [[-edge, 6], [-5, 9], [3, 6], [9, 8.2], [edge, 6.5]]],
  ]) {
    const outline = new THREE.Shape();
    outline.moveTo(-edge, 3.7);
    for (const point of points) outline.lineTo(...point);
    outline.lineTo(edge, 3.7);
    outline.closePath();
    shape(name, new THREE.ShapeGeometry(outline), [0, 0, hingeZ + z], material).addTo(display);
  }
  cylinder("Webcam", [0, 19, hingeZ + 0.8], 0.3, 0.15, "light", 0.3, [90, 0, 0]).addTo(display);
  roundedBox("Rear lid inset", [0, 11, hingeZ - 0.66], [9, 5.5, 0.15], "shade").addTo(display);
  box("Recessed keyboard", [0, 1.52, -0.2], [27, 0.12, 5.4], "shade");
  for (let row = 0; row < 3; row++) for (let column = 0; column < 10; column++) {
    box("Laptop key", [-11.6 + column * 2.55, 1.75, -2 + row * 1.22], [2.02, 0.35, 0.83], row === 0 && column === 0 ? "pink" : "cream");
  }
  for (const x of [-11.6, -9.05, 9.05, 11.6]) box("Modifier key", [x, 1.75, 1.65], [2.02, 0.35, 0.83], "cream");
  box("Space bar", [0, 1.75, 1.65], [12.5, 0.35, 0.83], "cream");
  roundedBox("Trackpad rim", [0, 1.54, 5.1], [9.5, 0.12, 3.4], "shade");
  roundedBox("Trackpad", [0, 1.61, 5.1], [8.9, 0.08, 2.8], "light");
  for (const x of [-width / 2 + 0.39, width / 2 - 0.39]) box("Side port", [x, 0.75, -0.3], [0.12, 0.45, 2.2], "ink");
}

function buildHeadphones(kit) {
  const { roundedBox, cylinder, ellipsoid, shape, THREE } = kit;
  cylinder("Weighted stand foot", [0, 0.7, 0], 6.7, 1.4, "main", 6.2);
  cylinder("Stand foot inset", [0, 1.45, 0], 4.8, 0.15, "shade");
  cylinder("Stand stem", [0, 11.5, 0], 0.8, 21, "gold");
  roundedBox("Headband cradle", [0, 21.5, 0], [4.2, 1.6, 3.4], "main");
  shape("Headphone headband", new THREE.TorusGeometry(5.7, 0.8, 10, 40, Math.PI), [0, 16.8, 0], "main", [1, 1, 1.3]);
  shape("Headband padding", new THREE.TorusGeometry(5.25, 0.48, 8, 40, Math.PI), [0, 16.7, 0], "ink", [1, 1, 1.5]);
  for (const side of [-1, 1]) {
    roundedBox("Ear cup yoke", [side * 5.8, 17, 0], [1, 4.6, 1.5], "gold");
    ellipsoid("Ear cup shell", [side * 5.8, 14.8, 0], [1.65, 3.6, 2.8], "main");
    ellipsoid("Ear cushion", [side * 4.65, 14.8, 0], [0.8, 3.1, 2.5], "ink");
    ellipsoid("Outer ear cup inset", [side * 7.23, 14.8, 0], [0.22, 2.3, 1.8], "light");
  }
}

function buildDeskFan(kit) {
  const { roundedBox, cylinder, ellipsoid, branch, shape, THREE } = kit;
  roundedBox("Fan weighted base", [0, 1, 1.5], [18, 2, 14], "main");
  roundedBox("Base control inset", [0, 2.06, 5], [7, 0.2, 2.8], "shade");
  for (const x of [-2, 0, 2]) cylinder("Fan speed button", [x, 2.35, 5], 0.55, 0.5, "light");
  cylinder("Fan upright", [0, 8.3, -2], 1.25, 13, "gold");
  const yoke = [[-10.6, 22, -2], [-10.6, 16, -2], [0, 14, -2], [10.6, 16, -2], [10.6, 22, -2]].map(point => new THREE.Vector3(...point));
  shape("Continuous fan support yoke", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(yoke), 40, 0.8, 8, false), [0, 0, 0], "main");
  cylinder("Fan motor housing", [0, 22, -4.1], 3.6, 5.4, "main", 3.6, [90, 0, 0]);
  for (const z of [-3.2, 1.2]) shape("Fan cage rim", new THREE.TorusGeometry(10, 0.55, 8, 48), [0, 22, z], "main");
  for (let index = 0; index < 8; index++) {
    const angle = index * Math.PI / 4;
    const x = Math.cos(angle) * 10, y = 22 + Math.sin(angle) * 10;
    branch("Front guard spoke", [0, 22, 2], [x, y, 1.2], 0.16, "gold");
    branch("Rear guard spoke", [0, 22, -4], [x, y, -3.2], 0.16, "shade");
    branch("Cage depth rail", [x, y, -3.2], [x, y, 1.2], 0.22, "main");
  }
  shape("Concentric safety guard", new THREE.TorusGeometry(6.8, 0.18, 6, 40), [0, 22, 1.6], "gold");
  for (let index = 0; index < 3; index++) {
    const angle = index * Math.PI * 2 / 3 + 0.4;
    ellipsoid("Broad fan blade", [Math.cos(angle) * 4, 22 + Math.sin(angle) * 4, -0.7], [4.5, 2.3, 0.5], "light", [0, 0, angle * 180 / Math.PI - 18]);
  }
  cylinder("Rotor axle", [0, 22, -0.5], 1.3, 5, "gold", 1.3, [90, 0, 0]);
  cylinder("Front fan hub", [0, 22, 2], 2, 1, "main", 2, [90, 0, 0]);
  for (const side of [-1, 1]) cylinder("Fan tilt pivot", [side * 10.5, 22, -2], 1.25, 1.5, "gold", 1.25, [0, 0, 90]);
}

function buildTabletopElectronics(api, kit, asset, width, depth) {
  if (asset.id === "decor-laptop") buildLaptop(api, kit, width, depth);
  else if (asset.id === "decor-headphones") buildHeadphones(kit);
  else if (asset.id === "decor-desk-fan") buildDeskFan(kit);
  else throw new Error(`Missing tabletop electronics model: ${asset.id}`);
}

module.exports = { tabletopElectronics, buildTabletopElectronics };
