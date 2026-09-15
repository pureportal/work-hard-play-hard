function buildBotanical(kit, asset, width, depth) {
  const { box, roundedBox, ellipsoid, cylinder, branch, shape, THREE } = kit;
  const id = asset.id;
  const small = asset.placement.layer === "surface";
  const radius = (Math.min(width, depth) / 2 - 0.6) * (small ? 0.94 : 0.86);
  const potHeight = small ? 7 : 13;
  if (id === "plant-planter-row" || id === "outdoor-garden-bed") {
    roundedBox("Raised planter", [0, 6, 0], [width - 0.5, 12, depth - 0.5], "wood");
    roundedBox("Planter rim", [0, 12, 0], [width, 2, depth], "light");
    box("Soil", [0, 13.1, 0], [width - 4, 0.2, depth - 4], "soil");
    for (const z of [-depth / 2, depth / 2]) box("Planter lower band", [0, 4, z], [width - 2, 1, 0.5], "shade");
    const flowerPositions = id === "plant-planter-row"
      ? [[0.5, 0.1], [0.45, 0.35], [0.55, 0.6], [0.5, 0.88]]
      : [[0.08, 0.12], [0.31, 0.09], [0.62, 0.13], [0.88, 0.08], [0.19, 0.35], [0.47, 0.29], [0.75, 0.37], [0.94, 0.34], [0.06, 0.59], [0.36, 0.55], [0.59, 0.62], [0.85, 0.58], [0.15, 0.86], [0.43, 0.87], [0.7, 0.91], [0.94, 0.84]];
    for (const [index, [u, v]] of flowerPositions.entries()) {
      const x = (u - 0.5) * (width - 18);
      const z = (v - 0.5) * (depth - 18);
      const height = 22 + (index * 7) % 13;
      branch("Stem", [x, 13, z], [x + 1, height, z], 0.8, "green");
      for (const side of [-1, 0, 1]) ellipsoid("Leaf cluster", [x + side * 3.5, 17 + Math.abs(side), z + side * 2], [id === "outdoor-garden-bed" ? 10 : 5.2, 3.5, 6.3], side ? "main" : "leafDark", [0, index * 37, side * 22]);
      for (let petal = 0; petal < 5; petal++) ellipsoid("Flower petal", [x + Math.cos(petal * 1.257) * 2.8, height, z + Math.sin(petal * 1.257) * 2.8], [3.1, 1.5, 2.8], index % 4 === 0 ? "paper" : "pink");
      ellipsoid("Pollen", [x, height + 1.1, z], [1.4, 0.8, 1.4], "gold");
    }
    return;
  }
  cylinder("Pot base", [0, 1, 0], radius, 2, "shade");
  cylinder("Glazed pot", [0, potHeight / 2 + 1, 0], radius - 1, potHeight, "cream", radius - 0.2);
  cylinder("Colored rim", [0, potHeight, 0], radius, 2, "main");
  cylinder("Potting soil", [0, potHeight + 1.1, 0], radius - 1.5, 0.3, "soil");
  shape("Glaze band", new THREE.TorusGeometry(radius - 0.9, 0.45, 5, 48), [0, potHeight * 0.45, 0], "main", [1, 1, 1], [90, 0, 0]);
  for (let stone = 0; stone < 5; stone++) {
    const angle = stone * 2.4;
    ellipsoid("Soil pebble", [Math.cos(angle) * radius * 0.6, potHeight + 1.4, Math.sin(angle) * radius * 0.6], [small ? 0.8 : 1.5, 0.5, small ? 0.6 : 1.2], "cream");
  }
  if (id === "plant-cactus") {
    ellipsoid("Cactus trunk", [0, 28, 0], [5.8, 17, 5.8], "main");
    for (const side of [-1, 1]) {
      branch("Cactus arm", [0, 23, 0], [side * 9, 25, 0], 3.4, "main");
      ellipsoid("Cactus arm tip", [side * 9, 29, 0], [3.5, 8, 3.5], "light");
    }
    for (let y = 18; y < 41; y += 6) for (const x of [-2, 2]) ellipsoid("Spine", [x, y, 5.6], [0.4, 1.3, 0.2], "paper", [0, 0, 20]);
    ellipsoid("Cactus flower", [0, 44, 0], [3.5, 2, 3], "pink");
  } else if (id === "outdoor-topiary") {
    branch("Topiary trunk", [0, potHeight, 0], [0, 64, 0], 2, "wood");
    const points = Array.from({ length: 57 }, (_, index) => {
      const t = index / 56;
      const turn = t * Math.PI * 4;
      const radius = 9.5 * (1 - t) + 1.5;
      return new THREE.Vector3(Math.cos(turn) * radius, 22 + t * 46, Math.sin(turn) * radius);
    });
    shape("Continuous spiral foliage", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 3.5, 12, false), [0, 0, 0], "main");
    const highlightCurve = points.map(point => new THREE.Vector3(point.x, point.y + 2.5, point.z));
    shape("Spiral clipped ridge", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(highlightCurve), 96, 0.65, 8, false), [0, 0, 0], "light");
  } else if (id === "plant-bonsai") {
    const trunk = [[0, potHeight, 0], [-4, 23, 0], [1, 32, 0], [-1, 42, 0]].map(point => new THREE.Vector3(...point));
    shape("Curving bonsai trunk", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trunk), 18, 2.2, 8, false), [0, 0, 0], "wood");
    for (const [x, y, z, size] of [[-10, 29, 8, 10], [10, 35, -8, 11], [-3, 47, 0, 12], [4, 31, 10, 8]]) {
      branch("Bonsai bough", [0, y - 8, 0], [x, y, z], 1.5, "wood");
      ellipsoid("Cloud canopy", [x, y, z], [size, 4.5, size * 0.65], "leafDark");
      for (let lobe = 0; lobe < 7; lobe++) {
        const turn = lobe * 2.4;
        ellipsoid("Clipped leaf cloud", [x + Math.cos(turn) * size * 0.6, y + 2, z + Math.sin(turn) * size * 0.5], [size * 0.42, 2.8, size * 0.35], lobe % 3 === 0 ? "light" : "main");
        kit.parts.at(-1).outline = false;
      }
    }
  } else if (id === "plant-palm") {
    branch("Palm trunk", [0, potHeight, 0], [2, 64, 0], 2.1, "wood");
    for (let y = 18; y < 63; y += 5) cylinder("Trunk ring", [(y - potHeight) / 25, y, 0], 2.25, 0.6, "cream");
    for (let frond = 0; frond < 7; frond++) {
      const angle = frond * Math.PI * 2 / 7;
      const length = frond % 2 ? 29 : 33;
      const spine = Array.from({ length: 7 }, (_, step) => {
        const distance = step / 6 * length;
        return [2 + Math.cos(angle) * distance, 64 + Math.sin(step / 6 * Math.PI) * 8 - step * 1.9, Math.sin(angle) * distance];
      });
      for (let step = 0; step < spine.length - 1; step++) {
        branch("Frond midrib", spine[step], spine[step + 1], 0.55, "light");
        for (const side of [-1, 1]) {
          const spread = Math.sin((step + 0.5) / 6 * Math.PI) * 7;
          const start = spine[step], end = spine[step + 1];
          const edge = [end[0] - Math.sin(angle) * spread * side, end[1] - 1.5, end[2] + Math.cos(angle) * spread * side];
          const notch = [start[0] - Math.sin(angle) * spread * side * 0.38, start[1] - 0.9, start[2] + Math.cos(angle) * spread * side * 0.38];
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute([start, notch, edge, end].flat(), 3));
          geometry.setIndex([0, 1, 2, 0, 2, 3]);
          geometry.computeVertexNormals();
          shape("Tapered palm frond", geometry, [0, 0, 0], side < 0 ? "main" : "light");
        }
      }
    }
  } else {
    const height = small ? 20 : 43;
    branch("Plant stem", [0, potHeight, 0], [0, height - 3, 0], 0.9, "wood");
    for (let i = 0; i < (id === "plant-monstera" ? 5 : 7); i++) {
      const angle = i * 2.4;
      const spread = small ? 5 : 12;
      const x = Math.cos(angle) * spread, z = Math.sin(angle) * spread;
      const y = height - i * 3;
      branch("Leaf stalk", [0, potHeight + 3, 0], [x, y, z], 0.6, "green");
      const leaf = new THREE.Shape();
      const leafWidth = small ? 3.6 : id === "plant-monstera" ? 8 : 7;
      const leafLength = small ? 7 : id === "plant-monstera" ? 18 : 13;
      leaf.moveTo(0, -leafLength / 2);
      if (id === "plant-monstera") {
        leaf.bezierCurveTo(6, -11, 10, -7, 8, -3);
        leaf.lineTo(3, -1).lineTo(8, -1);
        leaf.quadraticCurveTo(8, 2, 6, 4);
        leaf.lineTo(2, 3).lineTo(5, 5);
        leaf.quadraticCurveTo(2, 8, 0, 9);
        leaf.quadraticCurveTo(-2, 8, -5, 5);
        leaf.lineTo(-2, 3).lineTo(-6, 4);
        leaf.quadraticCurveTo(-8, 2, -8, -1);
        leaf.lineTo(-3, -1).lineTo(-8, -3);
        leaf.bezierCurveTo(-10, -7, -6, -11, 0, -leafLength / 2);
      } else {
        leaf.bezierCurveTo(leafWidth, -leafLength / 3, leafWidth, leafLength / 3, 0, leafLength / 2);
        leaf.bezierCurveTo(-leafWidth, leafLength / 3, -leafWidth, -leafLength / 3, 0, -leafLength / 2);
      }
      leaf.closePath();
      const geometry = new THREE.ExtrudeGeometry(leaf, { depth: 0.6, bevelEnabled: false, steps: 1, curveSegments: 5 });
      shape("Sculpted leaf", geometry, [x, y, z], i % 2 ? "main" : "light", [1, 1, 1], [-48, angle * 180 / Math.PI, 12]);
    }
    if (id === "decor-terrarium") {
      for (const turn of [0, 60, 120]) shape("Terrarium frame", new THREE.TorusGeometry(radius + 1.2, 0.65, 5, 6), [0, 14, 0], "gold", [1, 1, 1], [0, turn, 0]);
      shape("Glass highlight", new THREE.TorusGeometry(radius, 0.32, 4, 24, Math.PI * 0.55), [0, 14, 0], "waterLight", [1, 1, 1], [0, 25, 25]);
    }
  }
}

function buildWater(kit, asset, width, depth) {
  const { box, cylinder, shape, ellipsoid, THREE } = kit;
  const fountain = asset.kind === "fountain";
  if (fountain) {
    cylinder("Stone plinth", [0, 2, 0], width / 2 - 0.3, 4, "shade");
    cylinder("Basin", [0, 6, 0], width / 2 - 1, 5, "main");
    cylinder("Water", [0, 8.6, 0], width / 2 - 4, 0.4, "water");
    cylinder("Fountain column", [0, 23, 0], 5, 29, "cream", 3);
    cylinder("Upper bowl", [0, 37, 0], 17, 4, "main", 18);
    cylinder("Upper water", [0, 39.1, 0], 15, 0.2, "water");
    ellipsoid("Spout", [0, 44, 0], [3, 5, 3], "gold");
    for (const angle of [0, 90, 180, 270]) {
      const turn = angle * Math.PI / 180;
      for (let i = 0; i < 7; i++) ellipsoid("Water droplet", [Math.cos(turn) * (18 + i * 0.4), 35 - i * 3.5, Math.sin(turn) * (18 + i * 0.4)], [0.8, 2, 0.8], "waterLight");
    }
    for (const radius of [12, 29]) shape("Water ripple", new THREE.TorusGeometry(radius, 0.35, 4, 64, Math.PI * 1.3), [0, 8.95, 0], "waterLight", [1, 1, 1], [90, 0, radius * 7]);
    shape("Basin coping", new THREE.TorusGeometry(width / 2 - 2.2, 1.2, 8, 64), [0, 8.5, 0], "cream", [1, 1, 1], [90, 0, 0]);
  } else {
    box("Pool foundation", [0, 1, 0], [width - 0.4, 2, depth - 0.4], "shade");
    box("Pool water", [0, 2.2, 0], [width - 10, 0.4, depth - 10], "water");
    for (const x of [-width / 2 + 3, width / 2 - 3]) box("Pool coping", [x, 3, 0], [6, 4, depth], "light");
    for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Pool coping", [0, 3, z], [width, 4, 6], "light");
    for (let index = 0; index < 15; index++) {
      const x = -width / 2 + 14 + (index * 37) % (width - 28);
      const z = -depth / 2 + 14 + (index * 29) % (depth - 28);
      box("Water reflection", [x, 2.5, z], [5 + index % 3 * 2, 0.1, 0.45], "waterLight", [0, -12, 0]);
    }
    for (let x = -width / 2 + 18; x < width / 2 - 5; x += 24) for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Coping joint", [x, 5.05, z], [0.7, 0.1, 5.5], "main");
    for (let z = -depth / 2 + 18; z < depth / 2 - 5; z += 24) for (const x of [-width / 2 + 3, width / 2 - 3]) box("Coping joint", [x, 5.05, z], [5.5, 0.1, 0.7], "main");
    for (const x of [-width / 2 + 7, width / 2 - 7]) box("Underwater edge", [x, 2.51, 0], [2, 0.1, depth - 14], "main");
    if (asset.id === "outdoor-koi-pond") {
      for (const [x, z] of [[-width / 2 + 18, -depth / 2 + 15], [width / 2 - 21, depth / 2 - 19]]) {
        cylinder("Lily pad", [x, 2.8, z], 7, 0.25, "green");
        for (let petal = 0; petal < 5; petal++) ellipsoid("Lotus petal", [x + Math.cos(petal * 1.257) * 2.3, 3.5, z + Math.sin(petal * 1.257) * 2.3], [2.8, 1.2, 2], "pink");
        ellipsoid("Lotus center", [x, 4.4, z], [1.5, 0.7, 1.5], "gold");
      }
      return;
    }
    for (const x of [width / 2 - 30, width / 2 - 17]) {
      cylinder("Pool ladder rail", [x, 7, depth / 2 - 8], 0.9, 12, "gold");
      shape("Pool ladder curve", new THREE.TorusGeometry(3, 0.9, 6, 16, Math.PI), [x, 12, depth / 2 - 5], "gold", [1, 1, 1], [0, 90, 0]);
    }
  }
}

module.exports = { buildBotanical, buildWater };
