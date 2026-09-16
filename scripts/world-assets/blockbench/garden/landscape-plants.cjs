const { gardenLeaf, gardenFlower } = require("./botanical-kit.cjs");

const landscapePlants = ["outdoor-cypress", "outdoor-date-palm", "outdoor-ginkgo", "outdoor-dogwood", "outdoor-boxwood", "outdoor-pampas"];

function buildLandscapePlant(kit, asset, variant, width, depth) {
  const { ellipsoid, branch, cylinder, shape, THREE } = kit;
  const radius = Math.min(width, depth) / 2 - 3;
  if (asset.id === "outdoor-cypress") {
    branch("Cypress trunk", [0, 0, 0], [1, 78, 0], 2.5, "bark");
    for (let tier = 0; tier < 7; tier++) {
      const y = 20 + tier * 10, r = 11 - tier * 1.2;
      ellipsoid("Upright cypress crown", [0, y, 0], [r, 16, r], tier % 3 ? "leaf" : "leafDeep");
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + tier * 0.6;
        ellipsoid("Pointed cypress spray", [Math.cos(a) * r * 0.65, y + 3, Math.sin(a) * r * 0.65], [3.5, 10, 3.5], i % 3 ? "leaf" : "leafLight");
      }
    }
    for (let i = 0; i < 5; i++) ellipsoid("Cypress root stone", [Math.cos(i * 2.4) * 7, 1, Math.sin(i * 2.4) * 7], [2.8, 1.7, 2.4], "stone");
  } else if (asset.id === "outdoor-date-palm") {
    branch("Curved palm trunk", [-3, 0, 0], [0, 37, 0], 4.6, "bark");
    branch("Leaning palm crown", [0, 37, 0], [7, 70, 2], 3.7, "barkLight");
    for (let i = 0; i < 11; i++) cylinder("Palm trunk ring", [-3 + i * 0.8, 5 + i * 5.5, i > 5 ? 1 : 0], 4.2 - i * 0.06, 1, "bark");
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9, reach = radius - 4;
      const points = Array.from({ length: 8 }, (_, k) => {
        const t = k / 7;
        return new THREE.Vector3(7 + Math.cos(a) * reach * t, 70 + Math.sin(t * Math.PI) * 16 - t * 12, 2 + Math.sin(a) * reach * t);
      });
      shape("Curved palm frond rib", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.6, 5, false), [0, 0, 0], "leafDeep");
      for (let k = 1; k < 7; k++) for (const side of [-1, 1]) {
        const p = points[k], span = (1 - k / 9) * 12;
        gardenLeaf(kit, "Palm leaflet", p.toArray(), [p.x + Math.cos(a + side * 1.2) * span, p.y - 7, p.z + Math.sin(a + side * 1.2) * span], 1.8, k % 2 ? "leaf" : "leafLight");
      }
    }
    for (let i = 0; i < 3; i++) ellipsoid("Palm date cluster", [6 + Math.cos(i * 2.1) * 5, 64, 2 + Math.sin(i * 2.1) * 5], [3.4, 5, 3.4], "fruit");
  } else if (asset.id === "outdoor-ginkgo" || asset.id === "outdoor-dogwood") {
    const ginkgo = asset.id === "outdoor-ginkgo", top = ginkgo ? 76 : 58;
    branch("Tree trunk", [0, 0, 0], [-2, top - 16, 1], 3.5, "bark");
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, r = i < 5 ? radius * 0.55 : radius * 0.22;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = top - 14 + i % 3 * 8;
      branch("Spreading tree branch", [-1, 25 + i % 3 * 7, 0], [x, y, z], 1.7, "barkLight");
      ellipsoid("Leafy branch cushion", [x, y, z], [12, ginkgo ? 10 : 5.5, 11], i % 3 ? "leaf" : "leafDeep");
      if (ginkgo) for (let k = 0; k < 7; k++) {
        const turn = k * 2.4, px = x + Math.cos(turn) * 9, pz = z + Math.sin(turn) * 8;
        const fan = new THREE.Shape();
        fan.moveTo(0, 0); fan.lineTo(-5, 5); fan.quadraticCurveTo(-3, 8, 0, 6.5); fan.quadraticCurveTo(3, 8, 5, 5); fan.closePath();
        shape("Ginkgo fan leaf", new THREE.ExtrudeGeometry(fan, { depth: 0.5, bevelEnabled: false, steps: 1, curveSegments: 5 }), [px, y + 6, pz], k % 2 ? "leafLight" : "leaf", [1, 1, 1], [-65, k * 43, 0]);
      } else for (let k = 0; k < 6; k++) {
        const turn = k * 2.4;
        gardenFlower(kit, [x + Math.cos(turn) * 7, y + 4 + k % 2 * 2, z + Math.sin(turn) * 7], 4, variant.id === "summer" ? "flower" : "flowerLight", 4);
      }
    }
    for (let i = 0; i < 4; i++) branch("Tree root", [0, 3, 0], [Math.cos(i * 1.57) * 9, 0.7, Math.sin(i * 1.57) * 9], 1.2, "bark");
  } else if (asset.id === "outdoor-boxwood") {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 15, y = 10 + i % 2 * 8, r = i === 1 ? 14 : 11;
      branch("Boxwood stem", [x, 0, 0], [x, y, 0], 2, "bark");
      ellipsoid("Clipped boxwood dome", [x, y, 0], [r, r, r], "leafDeep");
      for (let k = 0; k < 20; k++) {
        const turn = k * 2.4, vertical = (k % 5) / 5, reach = r * Math.sqrt(1 - vertical * vertical) * 0.85;
        ellipsoid("Boxwood leaf cluster", [x + Math.cos(turn) * reach, y + vertical * r, Math.sin(turn) * reach], [3.5, 3, 3.5], k % 4 ? "leaf" : "leafLight");
      }
    }
  } else if (asset.id === "outdoor-pampas") {
    for (let i = 0; i < 19; i++) {
      const a = i * 2.4;
      gardenLeaf(kit, "Pampas grass blade", [0, 1, 0], [Math.cos(a) * (radius - 2), 14 + i % 4 * 6, Math.sin(a) * (radius - 2)], 1.25, i % 2 ? "leaf" : "leafLight");
    }
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, x = Math.cos(a) * 10, z = Math.sin(a) * 10, y = 40 + i % 3 * 7;
      branch("Pampas reed", [x * 0.2, 0, z * 0.2], [x, y, z], 0.7, "barkLight");
      ellipsoid("Feathery pampas plume", [x, y, z], [3.8, 11, 3.5], "cream");
      for (let k = 0; k < 9; k++) {
        const turn = k * 2.4;
        ellipsoid("Pampas plume tuft", [x + Math.cos(turn) * 2.4, y - 7 + k * 1.5, z + Math.sin(turn) * 2.4], [2, 4, 2], k % 2 ? "paper" : "strawLight");
      }
    }
  }
}

module.exports = { landscapePlants, buildLandscapePlant };
