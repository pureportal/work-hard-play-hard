const { createModelKit } = require("./model-kit.cjs");

const palettes = {
  sakura: { wood: "#98705f", edge: "#634957", paper: "#fff1dd", main: "#d99aae", light: "#ffe0e7", shade: "#b47792", green: "#7b9d83", cream: "#f7e7ce", gold: "#d4ae6e", ink: "#4b4657", tea: "#b5bf86" },
  matcha: { wood: "#90765a", edge: "#4c6158", paper: "#f7f3da", main: "#8dac91", light: "#e1ecd3", shade: "#618675", green: "#658d77", cream: "#f2e9d5", gold: "#c4a666", ink: "#414d50", tea: "#a3b775" },
  indigo: { wood: "#77758f", edge: "#44465f", paper: "#f0edf8", main: "#8f9ec5", light: "#dce3ff", shade: "#737da9", green: "#7a9e9d", cream: "#eae8f3", gold: "#c7b5a0", ink: "#353f59", tea: "#acc3a6" },
};

function teaCart(kit) {
  const { box, cylinder, ellipsoid, shape, THREE } = kit;
  for (const x of [-28.8, 28.8]) {
    for (const z of [-14.9, 14.9]) {
      cylinder("Caster", [x, 3, z], 2.7, 2.2, "ink", 2.7, [90, 0, 0]);
      box("Caster bracket", [x, 5, z], [2, 4, 2], "gold");
      cylinder("Frame upright", [x, 23, z], 1.15, 34, "wood");
      cylinder("Brass collar", [x, 37, z], 1.4, 2, "gold");
    }
  }
  for (const y of [10, 35]) {
    box("Shelf rim", [0, y, 0], [63.5, 3, 31.5], "edge");
    box("Shelf inset", [0, y + 1.7, 0], [61, 0.8, 29], "main");
    box("Shelf front highlight", [0, y + 0.4, 15.8], [57, 0.5, 0.1], "light");
  }
  box("Lower basket", [-10, 17, 0], [19, 10, 24], "cream");
  for (const z of [-12.1, 12.1]) {
    for (const x of [-17, -13, -9, -5]) box("Basket weave", [x, 17, z], [0.5, 8, 0.1], "gold");
  }
  for (let i = 0; i < 3; i++) box("Tea tin", [8 + i * 5, 17, -4], [4, 9, 11], i === 1 ? "light" : "main");
  box("Tray", [0, 37.4, 0], [39, 1.5, 25], "wood");
  box("Linen", [0, 38.3, 1], [35, 0.4, 21], "paper");
  ellipsoid("Teapot body", [-8, 43.2, -3], [6, 5, 5], "main");
  cylinder("Teapot lid", [-8, 47.6, -3], 4.3, 1.1, "light");
  ellipsoid("Lid knob", [-8, 49.1, -3], [1.5, 1.2, 1.5], "gold");
  cylinder("Teapot spout", [-1.9, 44.1, -3], 1.7, 7.5, "main", 1.1, [0, 0, -55]);
  shape("Teapot handle", new THREE.TorusGeometry(4, 0.9, 6, 18), [-13.4, 43.8, -3], "edge", [0.75, 1, 1]);
  for (const [x, z] of [[7, 5], [13, -5]]) {
    cylinder("Saucer", [x, 39, z], 4, 0.7, "light");
    cylinder("Teacup", [x, 41, z], 2.1, 3.4, "cream", 2.9);
    cylinder("Tea", [x, 42.76, z], 2.4, 0.12, "tea");
    shape("Cup handle", new THREE.TorusGeometry(1.3, 0.35, 5, 12), [x + 2.8, 41.3, z], "gold", [0.8, 1, 1]);
  }
  for (const z of [-12, 12]) cylinder("Handle riser", [30.5, 39, z], 0.9, 7, "gold");
  cylinder("Push handle", [30.5, 42.5, 0], 1.2, 26, "wood", 1.2, [90, 0, 0]);
}

function shojiScreen(kit) {
  const { box, cylinder } = kit;
  for (const [panel, center] of [-32, 0, 32].entries()) {
    const z = panel === 1 ? -3 : 2;
    box("Rice paper", [center, 42, z], [29, 64, 1.6], "paper");
    box("Tinted lower panel", [center, 17, z + 1], [28, 12, 0.4], "light");
    box("Back lower panel", [center, 17, z - 1], [28, 12, 0.4], "main");
    for (const x of [-15, 15]) box("Stile", [center + x, 40, z], [1.7, 76, 2.5], "edge");
    for (const y of [3, 10, 24, 77]) box("Rail", [center, y, z], [30, 1.7, 2.8], "wood");
    for (const y of [37, 50, 63]) box("Lattice rail", [center, y, z], [29, 0.65, 2.1], "wood");
    for (const x of [-4.5, 4.5]) box("Lattice stile", [center + x, 50, z], [0.65, 51, 2.1], "wood");
    for (const side of [-1, 1]) {
      box("Panel crest", [center, 17, z + side * 1.3], [4.6, 4.6, 0.3], "gold", [0, 0, 45]);
      box("Crest inset", [center, 17, z + side * 1.5], [2.1, 2.1, 0.25], "shade", [0, 0, 45]);
    }
  }
  for (const x of [-43.8, 43.8]) box("Stabilizing foot", [x, 1.5, 0], [8, 3, 15.6], "wood");
  for (const x of [-16, 16]) {
    for (const y of [17, 65]) cylinder("Brass hinge", [x, y, 0], 1.4, 5, "gold");
  }
}

function sakuraPlanter(kit) {
  const { box, cylinder, ellipsoid, branch } = kit;
  cylinder("Planter foot", [0, 1, 0], 15.8, 2, "edge");
  cylinder("Glazed planter", [0, 9, 0], 15.5, 14, "main", 15);
  cylinder("Pot rim", [0, 16, 0], 15.8, 2.6, "cream");
  cylinder("Moss", [0, 17.4, 0], 14.5, 0.5, "green");
  for (const z of [-15.3, 15.3]) box("Planter emblem", [0, 9, z], [4, 4, 0.3], "gold", [0, 0, 45]);
  branch("Trunk", [0, 17, 0], [-3, 37, 0], 2, "wood");
  branch("Crown trunk", [-3, 37, 0], [1, 54, 1], 1.7, "wood");
  const tips = [[-15, 44, 3], [14, 46, 0], [-8, 53, -9], [8, 57, 9], [0, 64, 0], [-16, 55, 8], [16, 57, -6]];
  for (const [index, tip] of tips.entries()) {
    branch("Flowering branch", [-2, 31 + index * 3, 0], tip, 1.2, "wood");
    ellipsoid("Blossom cluster", tip, [7, 4.8, 6], index % 3 === 0 ? "shade" : "main");
    for (let flower = 0; flower < 4; flower++) {
      const angle = flower * 2.4 + index;
      const center = [tip[0] + Math.cos(angle) * 4.6, tip[1] + 2.2 + flower % 2, tip[2] + Math.sin(angle) * 3.9];
      for (let petal = 0; petal < 5; petal++) {
        const turn = petal * Math.PI * 2 / 5;
        ellipsoid("Sakura petal", [center[0] + Math.cos(turn) * 1.6, center[1], center[2] + Math.sin(turn) * 1.6], [1.65, 0.9, 1.2], flower % 2 ? "light" : "paper", [0, -turn * 180 / Math.PI, 0]);
      }
      ellipsoid("Flower center", [center[0], center[1] + 0.75, center[2]], [0.55, 0.45, 0.55], "gold");
    }
  }
}

const models = {
  "decor-shoji-screen": { name: "Shoji screen", width: 96, depth: 16, build: shojiScreen },
  "breakroom-tea-cart": { name: "Tea cart", width: 64, depth: 32, build: teaCart },
  "plant-sakura": { name: "Sakura planter", width: 32, depth: 32, build: sakuraPlanter },
};

async function createLoungeModel(api, assetId, variantId) {
  const definition = models[assetId];
  if (!definition || !palettes[variantId]) throw new Error(`Unknown lounge design: ${assetId}/${variantId}`);
  api.newProject(api.Formats.free);
  api.Project.name = `${definition.name} - ${variantId}`;
  api.Project.texture_width = api.Project.texture_height = 16;
  const kit = createModelKit(api, palettes[variantId]);
  await Promise.all(Object.values(kit.textures).map((texture) => texture.img.decode()));
  definition.build(kit);
  api.Canvas.updateAll();
  return { ...definition, parts: kit.parts };
}

module.exports = { createLoungeModel, models, palettes };
