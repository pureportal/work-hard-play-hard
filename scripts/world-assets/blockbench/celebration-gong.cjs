const gongPalette = {
  bronze: "#bf8d43", bronzeLight: "#f1d184", bronzeShade: "#79502f", bronzeWarm: "#d9ad5f",
  walnut: "#76513f", walnutLight: "#b7885e", cord: "#543d3e", ribbon: "#cd7185", felt: "#f6e7cd",
};

function buildGongStand(kit, span, footDepth) {
  const { box, roundedBox, cylinder, branch } = kit;
  for (const side of [-1, 1]) {
    const x = side * span / 2;
    roundedBox("Walnut runner", [x, 3, 0], [11, 6, footDepth], "walnut");
    for (const z of [-1, 1].map(sign => sign * (footDepth / 2 - 3))) {
      roundedBox("Runner brass cap", [x, 3.2, z], [11.2, 4.5, 5], "gold");
      box("Runner inlay", [x, 6.05, z * 0.65], [1.3, 0.25, 9], "walnutLight");
      branch("Side support brace", [x, 6, z * 0.87], [x, 33, -3], 2.2, "walnut");
    }
    roundedBox("Lacquer upright", [x, 45.5, -3], [7, 83, 8], "main");
    roundedBox("Post socket", [x, 11, -3], [8.5, 12, 9.5], "shade");
    for (const y of [6.5, 16, 78]) box("Post brass collar", [x, y, -3], [8.7, 1.4, 9.7], "gold");
    for (const z of [-7.1, 1.1]) box("Post face inlay", [x, 47, z], [1.1, 49, 0.3], "gold");
    box("Post side inlay", [x + side * 3.6, 49, -3], [0.3, 39, 1.2], "gold");
    for (const y of [22, 73]) cylinder("Side brass fastener", [x + side * 3.8, y, -3], 1.6, 0.6, "gold", 1.6, [0, 0, 90]);
  }
  roundedBox("Low frame stretcher", [0, 10, -3], [span, 4, 5], "walnut");
  roundedBox("Overhanging crossbeam", [0, 87, 2], [span + 14, 7, 12], "shade");
  roundedBox("Crossbeam crown", [0, 90.6, 2], [span + 12, 1.8, 11], "main");
  for (const x of [-(span + 7) / 2, (span + 7) / 2]) {
    roundedBox("Raised beam end", [x, 89, 2], [7, 8, 12], "main");
    box("Beam end brass band", [x, 89, 2], [1.2, 8.2, 12.2], "gold");
  }
  for (const z of [-4.1, 8.1]) box("Crossbeam brass inlay", [0, 87, z], [span - 2, 0.9, 0.3], "gold");
  box("Beam crest", [0, 87, 8.35], [3.1, 3.1, 0.35], "gold", [0, 0, 45]);
}

function buildBronzeGong(kit) {
  const { cylinder, ellipsoid, branch, shape, THREE } = kit;
  const center = [0, 43, 7];
  for (const x of [-13, 13]) {
    cylinder("Suspension ferrule", [x, 83.6, 7], 1.7, 2, "gold");
    branch("Suspension cord", [x, 83, 7], [x * 0.9, 64, 7], 0.9, "cord");
    ellipsoid("Suspension knot", [x * 0.9, 64, 8.5], [1.5, 1.5, 1], "cord");
  }
  const profile = [
    [0, 7.4], [3.4, 7.2], [5.3, 6.5], [6.7, 4.8], [7.4, 2.8], [9, 1.8],
    [17.5, 1.8], [21, 1.2], [23.2, 0.3], [24, 0.2], [24.5, -0.6],
    [24.5, -2.8], [24, -3.6], [23.1, -3.6], [22.8, -2.2], [20.5, -0.2],
    [17, 0.4], [9, 0.4], [6.3, 1.2], [5, 3.8], [3.3, 5.8], [0, 6.1],
  ].map(point => new THREE.Vector2(...point));
  shape("Hollow forged bronze bowl", new THREE.LatheGeometry(profile, 64), center, "bronze", [1, 1, 1], [90, 0, 0]);
  const front = [[8.5, 1.92], [17.5, 1.92], [21, 1.32]].map(point => new THREE.Vector2(...point));
  shape("Warm bronze striking face", new THREE.LatheGeometry(front, 64), center, "bronzeWarm", [1, 1, 1], [90, 0, 0]);
  const boss = [[0, 7.5], [3.4, 7.3], [5.3, 6.6], [6.7, 4.9], [7.4, 2.9]].map(point => new THREE.Vector2(...point));
  shape("Raised front striking boss", new THREE.LatheGeometry(boss, 48), center, "bronzeLight", [1, 1, 1], [90, 0, 0]);
  const recess = [[0, 5.9], [3.3, 5.6], [5, 3.6], [6.3, 1], [8, 0.3]].map(point => new THREE.Vector2(...point));
  shape("Recessed rear boss", new THREE.LatheGeometry(recess, 48), center, "bronzeShade", [1, 1, 1], [90, 0, 0]);
  for (const [name, radius, tube, z, material] of [
    ["Front rolled lip", 23.9, 0.75, 7.1, "bronzeLight"],
    ["Rear rolled lip", 23.7, 0.65, 3.55, "bronzeWarm"],
    ["Front turned ring", 16.5, 0.26, 9, "bronzeLight"],
    ["Boss seat", 8.2, 0.5, 9, "bronzeShade"],
    ["Rear turned ring", 17.1, 0.25, 7.3, "bronzeWarm"],
  ]) shape(name, new THREE.TorusGeometry(radius, tube, 8, 64), [0, 43, z], material);
  for (let stamp = 0; stamp < 12; stamp++) {
    const angle = stamp * Math.PI / 6;
    ellipsoid("Hammered face mark", [Math.sin(angle) * 19.3, 43 + Math.cos(angle) * 19.3, 8.65], [0.7, 1.25, 0.18], stamp % 3 ? "bronze" : "bronzeLight", [0, 0, -stamp * 30]);
  }
}

function buildCelebrationGong(kit, width, depth) {
  const { box, cylinder, ellipsoid, branch, group } = kit;
  const span = width - 18;
  buildGongStand(kit, span, depth - 24);
  buildBronzeGong(kit);
  const malletX = span / 2 + 4;
  branch("Mallet support arm", [span / 2, 35, 1], [malletX, 35, 19], 1.2, "gold");
  cylinder("Mallet handle", [malletX, 33, 19], 1.1, 26, "walnutLight");
  cylinder("Mallet grip", [malletX, 23, 19], 1.5, 8, "cord");
  ellipsoid("Felt mallet head", [malletX, 47, 19], [3.8, 4.3, 3.8], "felt");
  cylinder("Mallet binding", [malletX, 43.5, 19], 1.6, 1.8, "ribbon");
  branch("Celebration cord", [-span / 2 + 2, 82, 6], [-span / 2 + 3, 66, 7], 0.75, "ribbon");
  ellipsoid("Silk cord knot", [-span / 2 + 3, 67, 7], [1.8, 1.5, 1.3], "ribbon");
  for (const side of [-1, 1]) box("Silk tassel", [-span / 2 + 3 + side, 62, 7], [1.4, 7, 0.9], "ribbon", [0, 0, side * 10]);
  group.name = "Celebration gong";
}

module.exports = { buildCelebrationGong, gongPalette };
