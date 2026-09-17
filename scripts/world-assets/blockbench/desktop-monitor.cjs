const desktopMonitorPalette = {
  displayBezel: "#29383e", displaySky: "#75b5bc", displayMist: "#bdd4c6",
  displayHills: "#7eaaa0", displayForeground: "#487d7e", displaySun: "#f4dba4",
  keycap: "#e7e2d9", keyAccent: "#dba08c", metal: "#a7b5b5",
};

function buildDesktopMonitor(api, kit, width, depth) {
  const { box, roundedBox, ellipsoid, shape, THREE } = kit;
  const screenZ = -depth / 2 + 3.8;
  const display = new api.Group({
    name: "Tilted display", origin: [0, 18.4, screenZ], rotation: [-10, 0, 0],
  }).addTo(kit.group).init();

  roundedBox("Monitor foot", [0, 0.65, screenZ + 0.6], [12.5, 1.3, 5.6], "main");
  roundedBox("Stand upright", [0, 7.9, screenZ - 0.6], [3.4, 13.6, 1.6], "main");
  box("Stand front inset", [0, 5.1, screenZ + 0.24], [2, 6.8, 0.12], "metal");

  roundedBox("Display housing", [0, 18.4, screenZ], [width - 1.2, 19.8, 1.9], "main").addTo(display);
  roundedBox("Dark screen surround", [0, 18.9, screenZ + 1], [width - 2.8, 17.5, 0.24], "displayBezel").addTo(display);
  box("Screen glass", [0, 18.9, screenZ + 1.16], [width - 4.4, 15.7, 0.1], "displaySky").addTo(display);
  shape("Wallpaper sun", new THREE.CircleGeometry(2.3, 32), [8.2, 22.8, screenZ + 1.25], "displaySun").addTo(display);

  const screenEdge = (width - 4.4) / 2;
  const landscapes = [
    { name: "Distant hills", material: "displayMist", z: 1.3, points: [[-screenEdge, 16.2], [-8.8, 21.4], [-3.2, 17.9], [3.6, 20.3], [screenEdge, 16.4]] },
    { name: "Middle hills", material: "displayHills", z: 1.4, points: [[-screenEdge, 13.8], [-5.3, 18.4], [0.8, 14.9], [8.1, 19.2], [screenEdge, 17.1]] },
    { name: "Foreground hills", material: "displayForeground", z: 1.5, points: [[-screenEdge, 14.5], [-8.2, 15.5], [-1.8, 13.4], [5.8, 15.4], [screenEdge, 13.9]] },
  ];
  for (const landscape of landscapes) {
    const outline = new THREE.Shape();
    outline.moveTo(-screenEdge, 11.05);
    for (const point of landscape.points) outline.lineTo(...point);
    outline.lineTo(screenEdge, 11.05);
    outline.closePath();
    shape(landscape.name, new THREE.ShapeGeometry(outline), [0, 0, screenZ + landscape.z], landscape.material).addTo(display);
  }

  box("Power indicator", [11.7, 9.45, screenZ + 0.98], [0.65, 0.35, 0.12], "displayMist").addTo(display);
  roundedBox("Rear mounting cover", [0, 17.6, screenZ - 1.05], [9, 7.5, 0.5], "shade").addTo(display);
  for (let index = 0; index < 5; index++) {
    box("Rear vent", [-4 + index * 2, 24, screenZ - 1], [1.1, 0.5, 0.12], "shade").addTo(display);
  }

  const keyboardX = -3.5;
  const keyboardZ = depth / 2 - 3.6;
  roundedBox("Keyboard lower shell", [keyboardX, 0.4, keyboardZ], [23.8, 0.8, 6.2], "shade");
  roundedBox("Keyboard upper shell", [keyboardX, 0.94, keyboardZ], [23.5, 0.65, 6], "main");
  box("Recessed key bed", [keyboardX, 1.28, keyboardZ - 0.1], [21.7, 0.1, 4.8], "shade");
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 10; column++) {
      const accent = row === 0 && column === 0 || row === 2 && column === 9;
      box("Keyboard key", [keyboardX - 9.25 + column * 2.05, 1.57, keyboardZ - 1.85 + row * 1.25], [1.65, 0.5, 0.85], accent ? "keyAccent" : "keycap");
    }
  }
  for (const x of [-9.25, -7.2, 7.15, 9.2]) {
    box("Modifier key", [keyboardX + x, 1.57, keyboardZ + 1.9], [1.65, 0.5, 0.85], "keycap");
  }
  box("Space bar", [keyboardX, 1.57, keyboardZ + 1.9], [10.5, 0.5, 0.85], "keycap");

  const mouseX = width / 2 - 3.5;
  ellipsoid("Mouse lower shell", [mouseX, 0.35, keyboardZ], [2.5, 0.35, 3.1], "shade");
  ellipsoid("Mouse upper shell", [mouseX, 1, keyboardZ], [2.4, 1.1, 3], "light");
  roundedBox("Scroll wheel", [mouseX, 2.03, keyboardZ - 0.9], [0.5, 0.3, 1.1], "shade");
}

module.exports = { desktopMonitorPalette, buildDesktopMonitor };
