const tabletopOrnaments = ["decor-globe", "decor-hourglass", "decor-tea-set", "decor-origami", "decor-model-ship"];

function buildGlobe(api, kit) {
  const { cylinder, shape, THREE } = kit;
  cylinder("Globe weighted base", [0, 0.8, 0], 8.5, 1.6, "main", 8);
  cylinder("Globe base inset", [0, 1.65, 0], 6.4, 0.2, "light");
  cylinder("Globe pedestal", [0, 4.2, 0], 1.6, 6.2, "gold", 2.3);
  shape("Globe meridian", new THREE.TorusGeometry(12, 0.55, 8, 64), [0, 18, 0], "gold");
  const globe = new api.Group({ name: "Tilted globe axis", origin: [0, 18, 0], rotation: [0, 0, -18] }).addTo(kit.group).init();
  shape("Globe ocean", new THREE.SphereGeometry(10.8, 48, 32), [0, 18, 0], "water").addTo(globe);
  for (const y of [6.5, 29.5]) cylinder("Polar axle", [0, y, 0], 0.6, 2, "gold").addTo(globe);
  shape("Equator", new THREE.TorusGeometry(10.88, 0.12, 6, 64), [0, 18, 0], "waterLight", [1, 1, 1], [90, 0, 0]).addTo(globe);
  const continents = [
    [[-155, 64], [-127, 68], [-107, 53], [-61, 54], [-83, 28], [-97, 16], [-112, 30], [-130, 40]],
    [[-81, 10], [-50, -3], [-35, -11], [-50, -37], [-67, -55], [-76, -23]],
    [[-10, 35], [5, 57], [30, 70], [100, 70], [150, 56], [141, 35], [115, 20], [100, 5], [78, 8], [63, 26], [34, 32], [15, 40]],
    [[-17, 34], [12, 37], [34, 24], [43, 10], [34, -9], [19, -35], [9, -30], [-6, 6], [-17, 17]],
    [[112, -11], [136, -9], [154, -24], [145, -40], [117, -34]],
    [[-52, 59], [-25, 72], [-43, 81], [-61, 75]],
  ];
  for (const [index, outline] of continents.entries()) {
    const polygon = new THREE.Shape(outline.map(point => new THREE.Vector2(...point)));
    const flat = new THREE.ShapeGeometry(polygon).toNonIndexed();
    const positions = flat.getAttribute("position");
    const vertices = [];
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      const a = new THREE.Vector2(positions.getX(triangle), positions.getY(triangle));
      const b = new THREE.Vector2(positions.getX(triangle + 1), positions.getY(triangle + 1));
      const c = new THREE.Vector2(positions.getX(triangle + 2), positions.getY(triangle + 2));
      const point = (u, v) => {
        const longitude = (a.x + (b.x - a.x) * u / 10 + (c.x - a.x) * v / 10) * Math.PI / 180;
        const latitude = (a.y + (b.y - a.y) * u / 10 + (c.y - a.y) * v / 10) * Math.PI / 180;
        return [10.91 * Math.cos(latitude) * Math.sin(longitude), 10.91 * Math.sin(latitude), 10.91 * Math.cos(latitude) * Math.cos(longitude)];
      };
      for (let u = 0; u < 10; u++) for (let v = 0; v < 10 - u; v++) {
        vertices.push(...point(u, v), ...point(u + 1, v), ...point(u, v + 1));
        if (u + v < 9) vertices.push(...point(u + 1, v), ...point(u + 1, v + 1), ...point(u, v + 1));
      }
    }
    flat.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    shape(`Spherical landmass ${index + 1}`, geometry, [0, 18, 0], "green").addTo(globe);
  }
}

function buildHourglass(kit) {
  const { cylinder, branch, shape, THREE } = kit;
  cylinder("Hourglass bottom plate", [0, 0.7, 0], 6.3, 1.4, "main");
  cylinder("Bottom plate inset", [0, 1.42, 0], 4.9, 0.15, "light");
  const crown = [[4.7, -0.7], [6.3, -0.7], [6.3, 0.7], [4.7, 0.7], [4.7, -0.7]].map(point => new THREE.Vector2(...point));
  shape("Open hourglass crown", new THREE.LatheGeometry(crown, 48), [0, 25.3, 0], "main");
  shape("Crown inlay", new THREE.TorusGeometry(5.5, 0.18, 8, 48), [0, 26.04, 0], "light", [1, 1, 1], [90, 0, 0]);
  for (const x of [-5, 5]) for (const z of [-3, 3]) branch("Hourglass support", [x, 1.3, z], [x, 24.6, z], 0.4, "gold");
  for (const y of [1.5, 24.7]) shape("Glass rim", new THREE.TorusGeometry(4.6, 0.22, 8, 40), [0, y, 0], "waterLight", [1, 1, 1], [90, 0, 0]);
  const profile = [[4.6, 1.5], [4.5, 4], [3.1, 8], [0.7, 12.5], [0.7, 13.5], [3.1, 18], [4.5, 22], [4.6, 24.7]];
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const points = profile.map(([radius, y]) => new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    shape("Glass contour highlight", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.17, 6, false), [0, 0, 0], "waterLight");
  }
  cylinder("Upper sand reservoir", [0, 17.5, 0], 0.65, 6.6, "gold", 3.65);
  cylinder("Sand surface", [0, 20.83, 0], 3.65, 0.08, "cream");
  cylinder("Falling sand", [0, 9.8, 0], 0.2, 8.8, "gold");
  cylinder("Lower sand mound", [0, 3.9, 0], 4.35, 3.8, "gold", 0.15);
}

function buildTeaSet(kit, width, depth) {
  const { roundedBox, cylinder, ellipsoid, shape, THREE } = kit;
  roundedBox("Tea tray", [0, 0.7, 0], [width - 0.8, 1.4, depth - 0.8], "wood");
  for (const x of [-width / 2 + 1, width / 2 - 1]) roundedBox("Tray side rim", [x, 1.4, 0], [1, 1.6, depth - 1], "main");
  for (const z of [-depth / 2 + 1, depth / 2 - 1]) roundedBox("Tray end rim", [0, 1.4, z], [width - 1, 1.6, 1], "main");
  cylinder("Teapot foot", [-5, 1.95, -4], 3, 1.1, "light");
  ellipsoid("Teapot body", [-5, 6.9, -4], [5.4, 4.6, 5.1], "main");
  cylinder("Teapot lid rim", [-5, 11.2, -4], 3.6, 0.6, "light");
  ellipsoid("Teapot lid", [-5, 11.5, -4], [3.4, 0.9, 3.4], "light");
  ellipsoid("Lid finial", [-5, 12.7, -4], [0.9, 0.8, 0.9], "gold");
  shape("Teapot loop handle", new THREE.TorusGeometry(3.7, 0.7, 10, 40), [-10.1, 7.2, -4], "main", [0.85, 1, 1]);
  const spout = [[-1, 6, -4], [2, 7, -4], [4.2, 10, -4], [5.7, 10.8, -4]].map(point => new THREE.Vector3(...point));
  shape("Curved teapot spout", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spout), 20, 1, 10, false), [0, 0, 0], "main");
  cylinder("Spout lip", [5.7, 10.8, -4], 1.15, 0.4, "light", 1.15, [0, 0, -62]);
  cylinder("Spout opening", [5.91, 10.91, -4], 0.75, 0.12, "ink", 0.75, [0, 0, -62]);
  for (const [x, z] of [[7, 7], [-7, 8]]) {
    cylinder("Tea saucer", [x, 1.75, z], 4.6, 0.7, "light");
    const profile = [[0, 0], [1.8, 0], [2.5, 0.3], [3, 3.6], [2.45, 3.6], [2, 0.6], [0, 0.6]].map(point => new THREE.Vector2(...point));
    shape("Hollow tea cup", new THREE.LatheGeometry(profile, 32), [x, 2.1, z], "main");
    cylinder("Tea surface", [x, 5.2, z], 2.35, 0.12, "wood");
    shape("Cup handle", new THREE.TorusGeometry(1.3, 0.4, 8, 24), [x + 3.15, 4, z], "light");
  }
}

function buildOrigami(api, kit) {
  const { shape, THREE } = kit;
  for (const [x, z, turn, material] of [[-7, -6, -18, "paper"], [7, 7, 25, "main"]]) {
    const crane = new api.Group({ name: "Folded paper crane", origin: [x, 0, z], rotation: [0, turn, 0] }).addTo(kit.group).init();
    const panel = (name, vertices, faces, color) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
      geometry.setIndex(faces.flat());
      geometry.computeVertexNormals();
      shape(name, geometry, [x, 0, z], color).addTo(crane);
    };
    panel("Folded crane body", [[0, 7, 0], [-1.9, 4, 0], [0, 4, 3], [1.9, 4, 0], [0, 4, -3], [0, 0, 0]], [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]], material);
    for (const side of [-1, 1]) {
      panel("Folded crane wing", [[0, 7, 0], [side * 1.9, 4, 0], [side * 8.5, 10, -1], [side * 4, 4.7, -3], [0, 4, -3]], [[0, 1, 2], [0, 2, 3], [0, 3, 4]], material);
      panel("Wing folded underside", [[side * 1.9, 4, 0], [side * 8.5, 10, -1], [side * 4, 4.7, -3], [0, 4, -3]], [[0, 1, 2], [0, 2, 3]], "cream");
    }
    for (const [name, profile] of [
      ["Folded neck and beak", [[2, 4], [4.3, 10], [6, 12], [9, 10.2], [6.2, 10.5], [5.3, 8.7], [3, 3.7]]],
      ["Folded pointed tail", [[-2, 4], [-8.5, 11], [-5, 4.7], [-3, 3.7]]],
    ]) {
      const outline = new THREE.Shape(profile.map(([pz, py]) => new THREE.Vector2(-pz, py)));
      const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.55, bevelEnabled: false });
      geometry.rotateY(Math.PI / 2);
      geometry.translate(-0.275, 0, 0);
      shape(name, geometry, [x, 0, z], material).addTo(crane);
    }
  }
}

function buildModelShip(kit, width) {
  const { roundedBox, cylinder, branch, shape, THREE } = kit;
  roundedBox("Ship display plinth", [0, 0.8, 0], [width - 3, 1.6, 15], "main");
  for (const x of [-11, 11]) roundedBox("Hull cradle", [x, 3, 0], [3.2, 3.8, 8], "gold");
  const plan = [[-18, -4.5], [10, -6], [21, 0], [10, 6], [-18, 4.5], [-20, 0]];
  const vertices = [...plan.map(([x, z]) => [x * 0.86, 3.7, z * 0.45]), ...plan.map(([x, z]) => [x, 8.5, z])];
  const faces = [];
  for (let index = 0; index < plan.length; index++) {
    const next = (index + 1) % plan.length;
    faces.push(index, next, index + 6, next, next + 6, index + 6);
    if (index > 0 && index < 5) faces.push(0, next, index);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  hull.setIndex(faces);
  hull.computeVertexNormals();
  shape("Tapered sailboat hull", hull, [0, 0, 0], "wood");
  const deck = new THREE.Shape(plan.map(([x, z]) => new THREE.Vector2(x * 0.96, -z * 0.92)));
  shape("Inset wooden deck", new THREE.ShapeGeometry(deck), [0, 8.5, 0], "cream", [1, 1, 1], [-90, 0, 0]);
  for (let index = 0; index < plan.length; index++) {
    const [x, z] = plan[index], [nextX, nextZ] = plan[(index + 1) % plan.length];
    branch("Gunwale", [x, 8.5, z], [nextX, 8.5, nextZ], 0.35, "main");
  }
  cylinder("Sailboat mast", [-1, 20, 0], 0.55, 23, "gold");
  branch("Sail boom", [-1, 10, 0], [16, 10, 0], 0.35, "gold");
  for (const [name, points, material] of [
    ["Bowed mainsail", [[0, 31, 0], [0, 10.2, 0], [16, 10.2, 0], [5.5, 18, 2.5]], "paper"],
    ["Bowed forward sail", [[-2, 28, 0], [-16, 11, 0], [-2, 11, 0], [-7, 17, -2]], "light"],
  ]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 3, 1, 2, 3, 2, 0, 3]);
    geometry.computeVertexNormals();
    shape(name, geometry, [0, 0, 0], material);
  }
  for (const x of [-18, 20]) branch("Standing rigging", [x, 8.5, 0], [-1, 31.5, 0], 0.14, "shade");
  roundedBox("Display plaque", [0, 1.2, 7.55], [10, 0.9, 0.15], "gold");
}

function buildTabletopOrnament(api, kit, asset, width, depth) {
  if (asset.id === "decor-globe") buildGlobe(api, kit);
  else if (asset.id === "decor-hourglass") buildHourglass(kit);
  else if (asset.id === "decor-tea-set") buildTeaSet(kit, width, depth);
  else if (asset.id === "decor-origami") buildOrigami(api, kit);
  else if (asset.id === "decor-model-ship") buildModelShip(kit, width);
  else throw new Error(`Missing tabletop ornament model: ${asset.id}`);
}

module.exports = { tabletopOrnaments, buildTabletopOrnament };
