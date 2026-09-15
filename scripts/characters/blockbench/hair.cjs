function createCharacterHair(api, geometry, appearance) {
  const { mesh, ellipsoid, loft, patch } = geometry;
  const style = appearance.hairstyle;
  const firstPart = geometry.parts.length;
  const short = ["spiky", "pixie", "curtains", "tousled", "buns", "curls"].includes(style);
  const tied = ["ponytail", "twintails", "braid", "longbraid"].includes(style);
  const nape = short ? 55 : tied ? 53 : style === "hime" ? 37 : style === "wavy" ? 40 : 49;

  function lock(name, rings, highlight = true, back = false) {
    loft(name, "hair", rings, "hair");
    if (!highlight) return;
    const edge = rings.map(([y, width, depth, x = 0, z = 0]) => [x, y, z + (back ? -1 : 1) * (depth + 0.13), width * 0.32]);
    for (let index = 0; index < edge.length - 1; index++) {
      const [x, y, z, width] = edge[index];
      const [nextX, nextY, nextZ, nextWidth] = edge[index + 1];
      patch(`${name} sheen`, "hair", [[x - width, y, z], [x + width, y, z], [nextX + nextWidth, nextY, nextZ], [nextX - nextWidth, nextY, nextZ]], "hairLight");
    }
  }

  const crown = new api.THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, 1.26);
  mesh("Hair crown", "hair", crown.scale(16.1, 13.4, 11.4).translate(0, 65.4, -0.5), "hair");
  loft("Nape", "hair", [[nape, 12.3, 7.8, 0, -1.5], [nape + 5, 15.5, 10, 0, -1], [64, 16.2, 11.2, 0, -0.6], [71, 14.5, 10, 0, -0.6], [76, 8.6, 6.4, 0, -0.5]], style === "longbraid" ? "hair" : "hairDark", 1.02, Math.PI * 2 - 2.04);
  for (const side of [-1, 1]) {
    const length = style === "hime" ? 38 : style === "wavy" ? 41 : short ? 55.5 : tied ? 53 : 49;
    if (style !== "longbraid") lock("Back layers", [[length, 0.1, 0.1, side * 8.5, -8], [length + 5, 4.8, 2.1, side * 8.5, -8.5], [64, 5.2, 3.6, side * 8.4, -8], [73, 3.8, 2.2, side * 6.4, -6.8], [77, 0.1, 0.1, side * 3, -3]], true, true);
    if (style === "hime") {
      lock("Hime sidelock", [[49.5, 2.3, 1.2, side * 13, 5.4], [54, 2.4, 1.6, side * 13.1, 5.4], [66, 2.9, 2.6, side * 12.8, 4.7], [74, 0.1, 0.1, side * 9, 3.9]]);
    } else {
      const tip = style === "swept" && side === 1 ? 59 : short ? 58.5 : tied ? 54 : style === "wavy" ? 43 : 50;
      lock("Temple lock", [[tip, 0.1, 0.1, side * (style === "wavy" ? 16 : 12.4), 4.9], [tip + 5, 2.3, 1.8, side * 14, 4], [66, 2.6, 2.6, side * 13.7, 4.2], [74.5, 1.8, 2, side * 10, 3.8], [77, 0.1, 0.1, side * 6, 2.2]], side < 0);
    }
  }

  if (style === "curtains") {
    for (const side of [-1, 1]) lock("Parted curtain", [[60.8, 0.1, 0.1, side * 11.2, 8.5], [65, 3.3, 1.2, side * 9.2, 9.2], [70, 4.5, 1.3, side * 6.6, 9.8], [74.5, 3.1, 1.3, side * 4, 7.1], [78, 0.1, 0.1, side * 1.2, 2]]);
  } else if (style === "swept" || style === "pixie") {
    for (const [index, [x, tip]] of [[-10, 61.8], [-5, 64.3], [0.5, 67.4]].entries()) lock("Swept fringe", [[tip, 0.1, 0.1, x - 1.2, 9.8], [tip + 3, 3.5, 0.95, x, 10.1], [73, 4.5, 1.5, x + 4.4, 8.5], [77, 3, 1.1, x + 6.3, 4], [78.3, 0.1, 0.1, x + 5, 1]], index !== 1);
  } else {
    const tips = style === "hime" ? [64, 64.2, 64.2, 64] : style === "spiky" ? [63, 66.5, 63.7, 65.5] : style === "tousled" ? [63.8, 66, 62.5, 65.5] : [62.8, 65, 66.2, 63.2];
    for (const [index, x] of [-10.3, -4.1, 3.3, 9.7].entries()) {
      const tip = tips[index];
      const width = style === "hime" ? 3.4 : 3.8;
      lock("Fringe", [[tip, style === "hime" ? width * 0.75 : 0.1, 0.15, x - 0.7, 10], [tip + 2.8, width, 0.95, x, 10.1], [71.5, width, 1.25, x * 0.85, 9], [75.5, width * 0.72, 1.1, x * 0.62, 5.5], [78.3, 0.1, 0.1, x * 0.27, 1.5]], index === 0 || index === 2);
    }
  }

  if (["spiky", "tousled"].includes(style)) {
    for (const [index, x] of [-12, -6, 0, 6, 12].entries()) {
      const height = style === "spiky" ? 84 - Math.abs(x) * 0.22 : [76.5, 80.2, 82.2, 79, 75.5][index];
      lock("Crown tuft", [[70, 3.8, 3, x, -1], [height - 3.5, 3.2, 2, x, -1], [height, 0.1, 0.1, x + (style === "spiky" ? 3.3 : -3.4), -1.5]], index % 2 === 0);
    }
    if (style === "tousled") for (const side of [-1, 1]) lock("Shag flick", [[59, 0.1, 0.1, side * 18, -1], [64, 3, 3, side * 14, -1], [70, 0.1, 0.1, side * 12, -1]], false);
  }
  if (style === "ponytail") {
    lock("Ponytail", [[34, 0.1, 0.1, -4, -13], [40, 3.6, 2.7, 0, -15], [51, 5.4, 4.4, 3.5, -15], [63, 5.8, 4.4, 2, -14], [72.5, 2.8, 2.8, 0, -10]], true, true);
    ellipsoid("Ponytail tie", "hair", [0, 71.8, -10], [3.6, 1.5, 3], "gold");
  }
  if (style === "twintails") for (const side of [-1, 1]) {
    lock("Twin tail", [[36, 0.1, 0.1, side * 15.5, -3], [43, 3.5, 3.2, side * 19.5, -4], [53, 4.5, 4, side * 21, -4], [62, 4, 3.5, side * 20, -3], [69, 1.8, 2, side * 14.8, -2]]);
    ellipsoid("Tail ribbon", "hair", [side * 17.5, 66.5, -0.5], [2.8, 1.2, 2.8], "gold");
  }
  if (style === "wavy") for (const side of [-1, 1]) lock("Loose wave", [[37, 0.1, 0.1, side * 12.8, -3], [42, 3.4, 2.7, side * 16.7, -3], [48, 3.1, 3, side * 14.3, -3], [54, 3.6, 3.2, side * 16.5, -3], [63, 2.9, 3, side * 13.6, -3], [69, 0.1, 0.1, side * 12, -3]]);
  if (style === "braid") {
    for (let index = 0; index < 7; index++) for (const side of [-1, 1]) {
      const x = 14 + side * (index % 2 ? 1.2 : 0.7);
      ellipsoid("Braid weave", "hair", [x, 54 - index * 2.7, 3.1 + side * 0.45], [2.1, 2.25, 1.8], side < 0 ? "hair" : "hairLight");
    }
    ellipsoid("Braid tie", "hair", [14, 35.7, 3], [2.3, 0.8, 2], "gold");
    lock("Braid tip", [[31, 0.1, 0.1, 13.5, 3], [34, 2.1, 1.6, 14, 3], [36, 1.2, 1.1, 14, 3]], false);
  }
  if (style === "buns") for (const side of [-1, 1]) {
    ellipsoid("Double bun", "hair", [side * 18, 71.7, -2], [5.5, 5.4, 4.5], "hair");
    lock("Bun coil", [[68.5, 0.1, 0.1, side * 17, 1.6], [70.5, 2, 0.3, side * 19, 2], [74, 2.2, 0.3, side * 18, 1.9], [76.4, 0.1, 0.1, side * 16.8, 0.4]]);
    ellipsoid("Bun ribbon", "hair", [side * 16, 68.8, 0], [3.2, 0.8, 2.7], "gold");
  }

  if (style === "curls") {
    for (let index = 0; index < 10; index++) {
      const angle = index / 10 * Math.PI * 2;
      const x = Math.sin(angle) * 13.5, z = Math.cos(angle) * 8.7;
      ellipsoid("Crown curl", "hair", [x, 73.7 + index % 2, z], [4.5, 4.5, 3.5], "hair");
      ellipsoid("Curl glint", "hair", [x - 0.6, 76.4 + index % 2, z + 1.2], [2.1, 0.65, 1.5], "hairLight", false);
    }
    for (const side of [-1, 1]) for (let index = 0; index < 3; index++) {
      ellipsoid("Temple curl", "hair", [side * 14.6, 60 + index * 4, 1.5], [3.6, 3.1, 3.5], "hair");
      ellipsoid("Curl highlight", "hair", [side * 14.6 - 0.4, 61.2 + index * 4, 4.4], [1.7, 0.6, 0.4], "hairLight", false);
    }
  }
  if (style === "longbraid") {
    loft("Gathered braid crown", "hair", [[53, 1.8, 1.1, 0, -12.3], [57, 6.8, 2, 0, -11.6], [64, 12.5, 3.4, 0, -9.5], [70, 12, 3.2, 0, -8.4], [75, 7, 2, 0, -5.4], [77, 0.1, 0.1, 0, -2.5]], "hair");
    for (let index = 0; index < 8; index++) for (const side of [-1, 1]) {
      const x = side * 1.45, y = 54 - index * 2.8, z = -12.8 + side * (index % 2 ? 0.5 : -0.5);
      ellipsoid("Pearl braid weave", "hair_tail", [x, y, z], [2.8 - index * 0.12, 2.5, 2.4], "hair");
      ellipsoid("Braid strand sheen", "hair_tail", [x - 0.25, y + 0.65, z - 2.2], [1.1 - index * 0.04, 1.25, 0.25], "hairLight", false);
    }
    ellipsoid("Braid ribbon", "hair_tail", [0, 32.5, -12.8], [2.7, 0.9, 2.7], "ribbon");
    loft("Braid tassel", "hair_tail", [[27.5, 0.1, 0.1, 1, -12.8], [30, 2.6, 2, 0, -12.8], [32, 1.6, 1.6, 0, -12.8]], "hair");
    for (const side of [-1, 1]) lock("Gathered braid sweep", [[54, 0.1, 0.1, side * 1.4, -13], [59, 2.8, 1.1, side * 4.2, -12.5], [66, 3.4, 1.3, side * 8, -10.8], [72, 3, 1.3, side * 7.5, -8.4], [77, 0.1, 0.1, side * 2.3, -2.5]], true, true);
  }

  if (["cap", "witch", "beret"].includes(appearance.headwear)) {
    for (const { element } of geometry.parts.slice(firstPart)) for (const vertex of Object.values(element.vertices)) {
      if (vertex[1] > 74) vertex[1] = 74 + (vertex[1] - 74) * 0.36;
    }
  }
}

module.exports = { createCharacterHair };
