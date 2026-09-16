function createCharacterHead(api, geometry, appearance) {
  const { mesh, ellipsoid, loft, patch } = geometry;
  loft("Face", "head", [[47.2, 0, 0], [48, 3.8, 3.2], [50, 8.6, 5.8], [54, 13.2, 8.4], [59, 14.5, 9.4], [65, 14.1, 9.6], [71, 11.5, 8.2], [75, 4.5, 3.6], [76, 0, 0]], "skin");
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    ellipsoid(`${prefix} ear`, "head", [side * 14, 56.6, 0], [1.9, 2.4, 1.65], "skin");
    ellipsoid(`${prefix} inner ear`, "head", [side * 14.6, 56.6, 1.05], [0.8, 1.35, 0.4], "blush", false);
    const eyeHeight = appearance.face === "dreamy" ? 0.65 : appearance.face === "bright" ? 1.2 : 1.05;
    const eye = (name, points, material, depth) => patch(`${prefix} ${name}`, "eyes", points.map(([u, v]) => {
      const x = side * (6 + u);
      return [x, 58.6 + v * eyeHeight + (appearance.face === "fierce" ? u * 0.12 : 0), 10.15 - Math.abs(x) * 0.13 + depth];
    }), material);
    if (appearance.face === "smile" && side === 1) {
      eye("wink", [[-2.8, -0.4], [-0.3, 1.1], [2.5, 0.3], [3.2, 0.9], [2.3, -0.8], [-0.3, 0.15], [-2.8, -1]], "ink", 0.1);
    } else {
      eye("lash", [[-3, 1.6], [-1.5, 2.7], [1.5, 2.7], [3.3, 1.6], [2.6, -1.8], [1.1, -2.8], [-1.1, -2.8], [-2.6, -1.8]], "ink", 0);
      eye("eye white", [[-2.3, 1.1], [-1.2, 1.9], [1.2, 1.9], [2.4, 1.1], [1.9, -1.3], [0.8, -2], [-0.8, -2], [-1.9, -1.3]], "white", 0.12);
      eye("iris", [[-1.45, 1.95], [1.45, 1.95], [1.45, -1.2], [0.7, -2.1], [-0.7, -2.1], [-1.45, -1.2]], "tealDark", 0.22);
      eye("iris light", [[-1.35, -0.6], [1.35, -0.6], [1.2, -1.4], [0.6, -1.95], [-0.6, -1.95], [-1.2, -1.4]], "teal", 0.3);
      eye("pupil", [[-0.8, 1.9], [0.8, 1.9], [0.8, -0.9], [-0.8, -0.9]], "ink", 0.4);
      const glintX = side < 0 ? 0.1 : -1.4;
      eye("eye glint", [[glintX, 1.7], [glintX + 1.3, 1.7], [glintX + 1.3, 0.4], [glintX, 0.4]], "white", 0.52);
    }
    const browTilt = appearance.face === "fierce" ? 0.7 : appearance.face === "shy" ? -0.55 : 0.15;
    patch(`${prefix} eyebrow`, "head", [[side * 3.8, 64, 9.7], [side * 7.9, 64 + browTilt, 9.2], [side * 8.3, 64.9 + browTilt, 9.1], [side * 4.3, 64.9, 9.7]], "hairDark");
    ellipsoid(`${prefix} cheek`, "head", [side * 9.1, 54.5, 7.5], [appearance.face === "shy" ? 2.25 : 1.6, 0.65, 0.3], "blush", false);
  }
  patch("Nose light", "head", [[-0.55, 54.5, 9.25], [0.45, 54.5, 9.25], [0.2, 55.4, 9.4]], "skinLight");
  const smiling = ["bright", "smile"].includes(appearance.face);
  patch("Mouth", "head", smiling
    ? [[-1.35, 51.9, 7.8], [1.35, 51.9, 7.8], [0.65, 50.9, 7.55], [-0.55, 50.9, 7.55]]
    : [[-0.9, 51.65, 7.85], [0, 51.35, 7.8], [0.9, 51.65, 7.85], [0, 51.95, 7.9]], "lip");

  const band = new api.THREE.TorusGeometry(17, 0.85, 8, 32, Math.PI);
  band.scale(1, 0.88, 1).translate(0, 64.8, -1.6);
  mesh("Headphone band", "headphones", band, "ink");
  for (const side of [-1, 1]) {
    ellipsoid("Ear cushion", "headphones", [side * 16.6, 61.4, 0], [1.45, 3.6, 3.3], "ink");
    ellipsoid("Ear cup", "headphones", [side * 17.65, 61.4, 0], [1.1, 3.1, 2.85], "teal");
    ellipsoid("Cup inset", "headphones", [side * 18.6, 61.4, 0], [0.3, 1.7, 1.55], "gold", false);
  }
}

module.exports = { createCharacterHead };
