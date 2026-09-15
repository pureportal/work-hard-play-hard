const courtyardModels = ["sofa-reading-bench", "table-chabudai", "plant-bamboo", "light-stone-lantern", "decor-wind-chimes", "decor-pinwheel"];

function animateCourtyardParts(api, parts, name, origin, rotations) {
  const group = new api.Group({ name, origin }).init();
  for (const part of parts) part.element.addTo(group);
  const clip = new api.Animation({ name, length: 1.6, loop: "loop", snapping: 20 }).add();
  const animator = clip.getBoneAnimator(group);
  rotations.forEach((rotation, index) => animator.addKeyframe({ channel: "rotation", time: index * clip.length / (rotations.length - 1), interpolation: "linear", data_points: [{ x: rotation[0], y: rotation[1], z: rotation[2] }] }));
  return { clip, group, frames: 16, frameDuration: 100 };
}

function buildCourtyard(api, kit, asset, width, depth) {
  const { box, roundedBox, cylinder, ellipsoid, branch, shape, surfaceGrain, THREE } = kit;
  if (asset.id === "sofa-reading-bench") {
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) box("Bench leg", [x, 6, z], [4, 12, 4], "wood");
    box("Bench apron", [0, 12, 0], [width - 1, 5, depth - 1], "shade");
    for (const x of [-16, 16]) {
      roundedBox("Linen cushion", [x, 16, 1], [30, 5, depth - 5], "light");
      box("Cushion piping", [x, 16, depth / 2 - 1.3], [27, 0.55, 0.45], "stitch");
      for (const side of [-1, 1]) box("Cushion fold", [x + side * 12.5, 18.52, 1], [0.35, 0.1, depth - 12], "grain");
    }
    for (const x of [-width / 2 + 2, width / 2 - 2]) {
      box("Back post", [x, 22, -depth / 2 + 2], [3, 28, 3], "wood");
      roundedBox("Bench arm", [x, 23, 0], [3, 4, depth - 1], "main");
    }
    roundedBox("Back rail", [0, 34, -depth / 2 + 2], [width - 1, 5, 3], "main");
    for (let x = -24; x <= 24; x += 8) cylinder("Turned back spindle", [x, 26, -depth / 2 + 2], 1, 14, "wood", 1.2);
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) box("Brass bench foot", [x, 1.3, z], [4.1, 2.6, 4.1], "gold");
    return { seatHeight: 17, seatHasBack: true };
  }
  if (asset.id === "table-chabudai") {
    for (const x of [-width / 2 + 6, width / 2 - 6]) for (const z of [-depth / 2 + 6, depth / 2 - 6]) box("Low table leg", [x, 6, z], [5, 12, 5], "shade");
    roundedBox("Lacquered tabletop", [0, 13, 0], [width - 0.5, 3, depth - 0.5], "main");
    box("Tabletop inlay", [0, 14.55, 0], [width - 8, 0.1, depth - 8], "light");
    surfaceGrain([0, 14.64, 0], width - 14, depth - 13);
    for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Brass edge", [0, 14.6, z], [width - 8, 0.1, 0.7], "gold");
    for (const x of [-width / 2 + 4, width / 2 - 4]) for (const z of [-depth / 2 + 4, depth / 2 - 4]) box("Corner lacquer inlay", [x, 14.66, z], [2, 0.1, 2], "gold", [0, 45, 0]);
    return { surfaceHeight: 14.65 };
  }
  if (asset.id === "plant-bamboo") {
    roundedBox("Glazed planter", [0, 7, 0], [width - 1, 14, depth - 1], "main");
    box("Planter rim", [0, 14, 0], [width - 0.5, 2, depth - 0.5], "light");
    box("Dark soil", [0, 15.05, 0], [width - 5, 0.1, depth - 5], "soil");
    for (let i = 0; i < 7; i++) ellipsoid("River pebble", [-10 + i * 3, 15.2, -depth / 2 + 5 + i % 3 * 17], [2.4, 0.8, 1.7], i % 2 ? "cream" : "wood");
    for (const [index, [x, z, height]] of [[-7, -12, 68], [7, 0, 55], [-5, 13, 60]].entries()) {
      cylinder("Bamboo culm", [x, (height + 15) / 2, z], 1.85, height - 15, "green", 1.4);
      for (let y = 24; y < height; y += 11) cylinder("Bamboo node", [x, y, z], 2, 1.1, "cream");
      for (let cluster = 0; cluster < 3; cluster++) {
        const angle = (index * 47 + cluster * 120) * Math.PI / 180;
        const origin = [x, height - 25 + cluster * 6, z];
        const tip = [x + Math.cos(angle) * 8, origin[1] + 6, z + Math.sin(angle) * 8];
        branch("Bamboo twig", origin, tip, 0.65, "green");
        for (let leaf = 0; leaf < 3; leaf++) {
          const turn = angle + (leaf - 1) * 0.7;
          const start = new THREE.Vector3(...tip).lerp(new THREE.Vector3(...origin), leaf * 0.23);
          const direction = new THREE.Vector3(Math.cos(turn), leaf === 0 ? 0.5 : -0.3, Math.sin(turn)).normalize();
          const geometry = new THREE.SphereGeometry(1, 12, 8).scale(2.5, 7, 0.8);
          geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
          shape("Bamboo lance leaf", geometry, start.addScaledVector(direction, 3.5).toArray(), leaf % 2 ? "leafShade" : "leafLight");
        }
      }
    }
    return;
  }
  if (asset.id === "light-stone-lantern") {
    shape("Beveled stone footing", new THREE.CylinderGeometry(12.5, 15.5, 5, 8), [0, 2.5, 0], "stoneLight");
    cylinder("Pedestal collar", [0, 6, 0], 9, 2, "main");
    cylinder("Carved pedestal", [0, 13.5, 0], 6.5, 15, "stoneLight", 5);
    cylinder("Lantern sill", [0, 22, 0], 11, 3, "main");
    box("Warm lantern core", [0, 32, 0], [11.5, 17, 11.5], "paper");
    for (const x of [-6.8, 6.8]) for (const z of [-6.8, 6.8]) box("Lantern pillar", [x, 32, z], [2.5, 19, 2.5], "stoneLight");
    for (const y of [28, 35]) {
      for (const z of [-6.8, 6.8]) box("Window lattice", [0, y, z], [11, 0.8, 0.9], "stoneShade");
      for (const x of [-6.8, 6.8]) box("Window lattice", [x, y, 0], [0.9, 0.8, 11], "stoneShade");
    }
    const roof = [[0, 40.5], [10, 40.5], [15.2, 41.5], [15.4, 43], [12, 42.5], [8, 45], [4, 48], [0, 48]].map(point => new THREE.Vector2(...point));
    shape("Swept stone roof", new THREE.LatheGeometry(roof, 16), [0, 0, 0], "stone", [1, 1, 1], [0, 22.5, 0]);
    shape("Roof lip", new THREE.TorusGeometry(15, 0.5, 6, 48), [0, 42, 0], "stoneLight", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const turn = i * Math.PI / 4;
      branch("Carved roof ridge", [Math.cos(turn) * 4, 48, Math.sin(turn) * 4], [Math.cos(turn) * 12, 43.2, Math.sin(turn) * 12], 0.35, "stoneLight");
    }
    ellipsoid("Stone finial", [0, 49, 0], [2.5, 3, 2.5], "stoneLight");
    return;
  }
  if (asset.id === "decor-wind-chimes") {
    roundedBox("Chime stand foot", [0, 1.5, 0], [width - 1, 3, depth - 1], "main");
    roundedBox("Chime base inlay", [0, 3.1, 0], [width - 6, 0.5, depth - 6], "light");
    surfaceGrain([0, 3.42, 0], width - 10, depth - 10);
    cylinder("Chime post", [-11, 28, -8], 1.5, 53, "wood");
    box("Chime arm", [-1, 55, -8], [23, 2.5, 2.5], "wood");
    cylinder("Hanging cord", [8, 51, -8], 0.3, 6, "gold");
    const first = kit.parts.length;
    cylinder("Bell cap", [8, 46, -8], 7, 3, "main", 4);
    cylinder("Bell rim", [8, 44, -8], 7, 1.4, "gold");
    for (const [x, z, length] of [[4, -8, 15], [8, -4, 19], [12, -8, 17], [8, -12, 21]]) {
      cylinder("Brass chime", [x, 42 - length / 2, z], 1, length, "gold");
      cylinder("Chime end", [x, 42 - length, z], 1.05, 1, "shade");
    }
    cylinder("Sail cord", [8, 28, -8], 0.25, 27, "wood");
    for (const side of [-1, 1]) box("Folded paper sail", [8 + side * 1.8, 17, -8.8], [3.9, 11, 0.65], "paper", [0, side * 28, 0]);
    ellipsoid("Sail flower", [8, 18, -7.6], [1.7, 1.7, 0.2], "main");
    ellipsoid("Sail flower", [8, 18, -9.6], [1.7, 1.7, 0.2], "main");
    return { animation: animateCourtyardParts(api, kit.parts.slice(first), "Chime sway", [8, 49, -8], [[0, 0, -9], [5, 0, 0], [0, 0, 9], [-5, 0, 0], [0, 0, -9]]) };
  }
  if (asset.id === "decor-pinwheel") {
    cylinder("Pinwheel foot", [0, 1, 0], 6.5, 2, "main");
    cylinder("Pinwheel stem", [0, 11, 0], 0.9, 20, "wood");
    cylinder("Pinwheel foot inset", [0, 2.1, 0], 4.7, 0.2, "light");
    const first = kit.parts.length;
    for (let index = 0; index < 4; index++) {
      const blade = new THREE.BufferGeometry();
      blade.setAttribute("position", new THREE.Float32BufferAttribute([[0, 0, 0], [8, 0, -0.7], [6, 6.5, -0.4], [2, 4, 3]].flat(), 3));
      blade.setIndex([0, 1, 3, 1, 2, 3, 2, 0, 3]);
      blade.computeVertexNormals();
      shape("Folded pinwheel blade", blade, [0, 21, 1.5], index % 2 ? "paper" : "main", [1, 1, 1], [0, 0, index * 90]);
      const fold = new THREE.BufferGeometry();
      fold.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.05, 2, 4, 3.05, 6, 6.5, -0.35], 3));
      fold.setIndex([0, 1, 2]);
      fold.computeVertexNormals();
      shape("Pinwheel folded face", fold, [0, 21, 1.5], index % 2 ? "grain" : "shade", [1, 1, 1], [0, 0, index * 90]);
    }
    ellipsoid("Pinwheel hub", [0, 21, 3.7], [1.2, 1.2, 0.8], "gold");
    const animation = animateCourtyardParts(api, kit.parts.slice(first), "Pinwheel spin", [0, 21, 1.5], [[0, 0, 0], [0, 0, 360]]);
    const mount = new api.Group({ name: "Diagonal pinwheel mount", origin: [0, 21, 1.5], rotation: [0, 45, 0] }).init();
    animation.group.addTo(mount);
    return { animation };
  }
  throw new Error(`Missing courtyard model: ${asset.id}`);
}

module.exports = { courtyardModels, buildCourtyard };
