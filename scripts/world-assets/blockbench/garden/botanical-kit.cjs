const gardenPalette = {
  leaf: "#61976a", leafLight: "#a3c683", leafDeep: "#356451", vein: "#c2d997",
  bark: "#806452", barkLight: "#b69a79", flower: "#df97b6", flowerLight: "#f5d8df",
  pollen: "#e3b85b", fruit: "#edaf50", berry: "#c76d6b", stone: "#b2acaa",
};

function gardenLeaf(kit, name, from, to, breadth, material = "leaf", striped = false) {
  const { THREE, shape, branch } = kit;
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const delta = end.clone().sub(start), length = delta.length();
  const across = new THREE.Vector3(-delta.z, 0, delta.x);
  if (across.lengthSq() < 0.001) across.set(1, 0, 0);
  across.normalize();
  const normal = across.clone().cross(delta).normalize();
  const point = (t, side, face) => {
    const fullness = Math.pow(Math.sin(Math.PI * t), 0.75);
    return start.clone().addScaledVector(delta, t).addScaledVector(across, side * breadth * fullness)
      .addScaledVector(normal, Math.sin(Math.PI * t) * (length * 0.09 + (1 - Math.abs(side)) * breadth * 0.2) + face * 0.25 * fullness);
  };
  const positions = [], indices = [];
  for (const face of [1, -1]) for (let row = 0; row <= 8; row++) for (const side of [-1, 0, 1]) positions.push(...point(row / 8, side, face).toArray());
  for (let face = 0; face < 2; face++) for (let row = 0; row < 8; row++) for (let column = 0; column < 2; column++) {
    const a = face * 27 + row * 3 + column, b = a + 3;
    indices.push(...(face ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  shape(name, geometry, [0, 0, 0], material);
  if (striped) for (let i = 1; i < 7; i++) branch(`${name} vein`, point(i / 8, 0, 2).toArray(), point((i + 1) / 8, 0, 2).toArray(), 0.28, "vein");
  if (striped === "feathered") for (let i = 2; i < 6; i++) for (const side of [-1, 1]) {
    branch(`${name} painted stripe`, point(i / 8, 0, 2).toArray(), point(i / 8 + 0.07, side * 0.78, 2).toArray(), 0.5, "leafLight");
  }
}

function gardenFlower(kit, position, radius, material = "flower", petals = 5) {
  const [x, y, z] = position;
  for (let i = 0; i < petals; i++) {
    const a = i * Math.PI * 2 / petals;
    kit.ellipsoid("Flower petal", [x + Math.cos(a) * radius * 0.55, y + 0.2, z + Math.sin(a) * radius * 0.55], [radius * 0.52, radius * 0.22, radius * 0.52], material);
  }
  kit.ellipsoid("Flower center", [x, y + radius * 0.24, z], [radius * 0.27, radius * 0.18, radius * 0.27], "pollen");
}

function gardenPot(kit, radius, height, variant) {
  const { cylinder, shape, THREE, branch } = kit;
  cylinder("Planter foot", [0, 1, 0], radius * 0.7, 2, "shade");
  const profile = [[0, 1], [radius * 0.73, 1], [radius, height], [radius - 0.9, height], [radius * 0.73 - 0.9, 2], [0, 2]].map(([x, y]) => new THREE.Vector2(x, y));
  shape("Hollow planter", new THREE.LatheGeometry(profile, 32), [0, 0, 0], "main");
  shape("Rolled planter rim", new THREE.TorusGeometry(radius - 0.35, 0.75, 6, 24), [0, height, 0], "light", [1, 1, 1], [90, 0, 0]);
  cylinder("Potting soil", [0, height - 0.7, 0], radius - 1.1, 0.6, "soil");
  if (variant === "woven") {
    for (let y = 3; y < height - 1; y += 2.4) shape("Woven basket band", new THREE.TorusGeometry(radius * (0.73 + 0.27 * y / height), 0.35, 4, 24), [0, y, 0], "light", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      branch("Basket upright", [Math.cos(a) * radius * 0.8, 3, Math.sin(a) * radius * 0.8], [Math.cos(a) * radius, height - 1, Math.sin(a) * radius], 0.3, "shade");
    }
  } else if (variant === "porcelain") {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      branch("Fluted ceramic", [Math.cos(a) * radius * 0.8, 3, Math.sin(a) * radius * 0.8], [Math.cos(a) * radius * 0.96, height - 2, Math.sin(a) * radius * 0.96], 0.3, "light");
    }
  }
}

module.exports = { gardenPalette, gardenLeaf, gardenFlower, gardenPot };
