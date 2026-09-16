const playfulAssets = ["decor-kinetic-mobile", "decor-jellyfish-lamp", "decor-rocking-bird", "outdoor-mini-windmill", "special-confetti", "special-bubbles", "special-fortune", "special-break-wheel"];

function playfulLoop(api, parts, name, origin, poses, channel = "rotation") {
  const group = new api.Group({ name, origin }).init();
  for (const part of parts) part.element.addTo(group);
  const clip = new api.Animation({ name, length: 1.6, loop: "loop", snapping: 20 }).add();
  const animator = clip.getBoneAnimator(group);
  poses.forEach((pose, i) => animator.addKeyframe({ channel, time: i * 1.6 / (poses.length - 1), interpolation: "linear", data_points: [{ x: pose[0], y: pose[1], z: pose[2] }] }));
  return { animation: { clip, group, frames: 16, frameDuration: 100 } };
}

function buildPlayful(api, kit, asset) {
  const { box, roundedBox, cylinder, ellipsoid, shape, branch, THREE } = kit;
  const id = asset.id;
  if (id === "decor-kinetic-mobile") {
    cylinder("Mobile foot", [0, 1.5, 0], 11, 3, "main");
    branch("Arched mobile stand", [-8, 2, 0], [-8, 39, 0], 0.8, "gold");
    branch("Mobile arm", [-8, 39, 0], [0, 42, 0], 0.8, "gold");
    const start = kit.parts.length;
    cylinder("Mobile wire", [0, 36, 0], 0.2, 12, "gold");
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57, x = Math.cos(a) * 10, z = Math.sin(a) * 10, y = 30 - i * 4;
      branch("Balanced mobile arm", [0, y + 5, 0], [x, y + 5, z], 0.35, "gold");
      cylinder("Mobile string", [x, y + 2, z], 0.15, 6, "gold");
      ellipsoid("Floating petal", [x, y - 1, z], [3.5, 1, 4.5], i % 2 ? "light" : "main", [0, i * 90, 25]);
    }
    return playfulLoop(api, kit.parts.slice(start), "Mobile turn", [0, 42, 0], [[0, 0, 0], [0, 360, 0]]);
  }
  if (id === "decor-jellyfish-lamp") {
    cylinder("Lamp base", [0, 2, 0], 11, 4, "main");
    cylinder("Lamp inset", [0, 4.1, 0], 8.8, 0.3, "light");
    cylinder("Suspension stem", [0, 22, 0], 0.55, 36, "gold");
    const start = kit.parts.length;
    shape("Jellyfish bell", new THREE.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), [0, 29, 0], "light", [1, 0.7, 1]);
    shape("Bell scalloped rim", new THREE.TorusGeometry(8.6, 0.8, 6, 24), [0, 29, 0], "main", [1, 1, 1], [90, 0, 0]);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      const points = Array.from({ length: 6 }, (_, k) => new THREE.Vector3(Math.cos(a) * (5 + Math.sin(k * 1.5) * 1.5), 28 - k * 3, Math.sin(a) * (5 + Math.sin(k * 1.5) * 1.5)));
      shape("Curled jellyfish ribbon", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, 0.6, 6, false), [0, 0, 0], i % 2 ? "pink" : "light");
    }
    return playfulLoop(api, kit.parts.slice(start), "Jellyfish float", [0, 29, 0], [[0, 0, 0], [0, 3, 0], [0, 0, 0]], "position");
  }
  if (id === "decor-rocking-bird") {
    roundedBox("Bird pedestal", [0, 1.5, 0], [25, 3, 22], "main");
    cylinder("Balance post", [0, 8, 0], 1, 13, "gold");
    const start = kit.parts.length;
    ellipsoid("Round bird body", [0, 18, 0], [6, 5, 5], "light");
    ellipsoid("Bird head", [0, 23, 4], [3.7, 3.7, 3.7], "main");
    for (const x of [-2, 2]) ellipsoid("Bird eye", [x, 24, 6.8], [0.55, 0.7, 0.35], "ink");
    shape("Bird beak", new THREE.ConeGeometry(1.4, 3.4, 4), [0, 22.5, 8], "gold", [1, 1, 1], [90, 0, 0]);
    for (const x of [-1, 1]) ellipsoid("Bird wing", [x * 6, 19, -1], [4.5, 1.1, 5], "main", [0, x * 20, x * -20]);
    ellipsoid("Bird tail", [0, 18, -7], [2.5, 1, 5], "shade", [-20, 0, 0]);
    return playfulLoop(api, kit.parts.slice(start), "Bird rock", [0, 13, 0], [[0, 0, -12], [0, 0, 12], [0, 0, -12]]);
  }
  if (id === "outdoor-mini-windmill") {
    cylinder("Windmill plinth", [0, 1.5, 0], 16, 3, "shade");
    cylinder("Windmill tower", [0, 19, 0], 12, 35, "light", 8);
    shape("Windmill roof", new THREE.ConeGeometry(11, 14, 8), [0, 43, 0], "main");
    roundedBox("Windmill door", [0, 9, 11.5], [6, 12, 1], "wood");
    roundedBox("Windmill window", [0, 25, 9.9], [5, 6, 1], "water");
    const start = kit.parts.length;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      branch("Windmill sail spine", [0, 34, 13], [Math.cos(a) * 20, 34 + Math.sin(a) * 20, 13], 0.6, "wood");
      for (let k = 7; k <= 19; k += 3) box("Sail slat", [Math.cos(a) * k - Math.sin(a) * 2, 34 + Math.sin(a) * k + Math.cos(a) * 2, 13], [2.5, 6, 0.8], "main", [0, 0, i * 90]);
    }
    ellipsoid("Windmill hub", [0, 34, 14], [2, 2, 1.5], "gold");
    const result = playfulLoop(api, kit.parts.slice(start), "Windmill spin", [0, 34, 13], [[0, 0, 0], [0, 0, 360]]);
    const mount = new api.Group({ name: "Diagonal windmill", origin: [0, 0, 0], rotation: [0, 45, 0] }).init();
    kit.group.addTo(mount);
    result.animation.group.addTo(mount);
    return result;
  }
  if (id === "special-confetti") {
    roundedBox("Cannon base", [0, 3, 0], [29, 6, 29], "main");
    for (const x of [-10, 10]) box("Cannon support", [x, 14, 0], [3, 21, 8], "gold");
    cylinder("Confetti barrel", [0, 25, 0], 8.5, 26, "main", 9.5, [20, 0, 0]);
    cylinder("Dark muzzle", [0, 37.4, 4.5], 8, 0.8, "ink", 8, [20, 0, 0]);
    for (const y of [17, 31]) shape("Barrel band", new THREE.TorusGeometry(9, 0.8, 6, 24), [0, y, (y - 25) * 0.36], "gold", [1, 1, 1], [110, 0, 0]);
    roundedBox("Launch button", [0, 7, 10], [7, 2, 5], "pink");
    for (let i = 0; i < 5; i++) box("Confetti in barrel", [-5 + i * 2.5, 37.8 + i % 2, 4], [1.5, 0.7, 2], i % 2 ? "pink" : "gold", [0, i * 32, 0]);
  } else if (id === "special-bubbles") {
    roundedBox("Bubble machine body", [0, 11, 0], [28, 22, 24], "main");
    roundedBox("Bubble tank window", [0, 10, 12], [18, 10, 0.8], "water");
    roundedBox("Liquid level", [0, 8, 12.5], [16, 4, 0.5], "waterLight");
    for (const x of [-9, 9]) cylinder("Machine foot", [x, 1, 0], 3, 2, "shade");
    cylinder("Bubble fan face", [0, 26, 0], 10, 4, "shade", 10, [90, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      shape("Bubble wand ring", new THREE.TorusGeometry(2.6, 0.65, 6, 16), [Math.cos(a) * 6, 26 + Math.sin(a) * 6, 3], "gold");
    }
    ellipsoid("Fan center", [0, 26, 3], [2.2, 2.2, 1], "light");
    roundedBox("Bubble button", [8, 22.5, 6], [5, 1.5, 4], "pink");
  } else if (id === "special-fortune") {
    roundedBox("Fortune machine plinth", [0, 3, 0], [29, 6, 28], "shade");
    roundedBox("Fortune cabinet", [0, 19, 0], [25, 31, 24], "main");
    roundedBox("Fortune display", [0, 28, 12.5], [19, 13, 1], "ink");
    ellipsoid("Crystal ball", [0, 29, 13.2], [5, 5, 1], "water");
    ellipsoid("Crystal glint", [-1.5, 31, 14], [1.5, 1.5, 0.3], "paper");
    box("Ticket slot", [0, 13, 12.5], [15, 2, 1], "ink");
    box("Fortune ticket", [1, 11.5, 15], [10, 0.5, 5], "paper", [15, 0, 0]);
    for (const y of [15, 25, 35]) for (const x of [-11, 11]) ellipsoid("Cabinet bulb", [x, y, 12.8], [0.9, 0.9, 0.6], "gold");
    shape("Pagoda canopy", new THREE.ConeGeometry(20, 9, 4), [0, 39, 0], "light", [1, 1, 0.85], [0, 45, 0]);
    ellipsoid("Fortune star", [0, 45, 0], [2, 3, 2], "gold");
  } else if (id === "special-break-wheel") {
    cylinder("Wheel foot", [0, 2, 0], 14, 4, "shade");
    cylinder("Wheel post", [0, 22, -2], 1.6, 40, "gold");
    cylinder("Wheel backing", [0, 32, 0], 17, 3, "shade", 17, [90, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const wedge = new THREE.Shape();
      wedge.moveTo(0, 0); wedge.absarc(0, 0, 15.5, a, a + Math.PI / 4, false); wedge.lineTo(0, 0);
      shape("Wheel segment", new THREE.ShapeGeometry(wedge, 8), [0, 32, 1.6], ["main", "light", "pink", "gold"][i % 4]);
      ellipsoid("Wheel peg", [Math.cos(a) * 16, 32 + Math.sin(a) * 16, 2], [0.8, 0.8, 0.8], "paper");
    }
    ellipsoid("Wheel hub", [0, 32, 2.5], [2.7, 2.7, 1.5], "gold");
    shape("Wheel pointer", new THREE.ConeGeometry(2, 5, 3), [0, 50, 2], "pink", [1, 1, 0.6], [0, 0, 180]);
    const mount = new api.Group({ name: "Diagonal wheel", origin: [0, 0, 0], rotation: [0, 45, 0] }).init();
    kit.group.addTo(mount);
  }
}

module.exports = { playfulAssets, buildPlayful };
