const extendedHairStyles = ["buzz", "fade", "quiff", "pompadour", "mohawk", "locs", "topknot", "afropuff", "sidepony", "waterfall", "flame", "nebula", "tentacles", "hollywood", "slickback", "wetlook"];

function createExtendedHair(api, geometry, appearance) {
  const { mesh, ellipsoid, loft, patch } = geometry;
  const style = appearance.hairstyle;
  const cropped = ["buzz", "fade", "quiff", "pompadour", "mohawk", "topknot", "slickback"].includes(style);
  const crown = new api.THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, 1.35);
  mesh("Fitted crown", "hair", crown.scale(cropped ? 15.2 : 16.1, style === "buzz" ? 11.2 : 13.4, 11.2).translate(0, 65.4, -0.5), "hair");
  loft("Shaped nape", "hair", [[cropped ? 58 : 51, 12.1, 7.9, 0, -1.5], [64, 15.4, 10.6, 0, -1], [72, 13.5, 9, 0, -0.5], [76, 5.5, 4]], "hairDark", 1.1, Math.PI * 2 - 2.2);

  function strand(name, rings, material = "hair", back = false) {
    loft(name, "hair", rings, material);
    for (let index = 0; index < rings.length - 1; index++) {
      const [y, w, d, x = 0, z = 0] = rings[index];
      const [ny, nw, nd, nx = 0, nz = 0] = rings[index + 1];
      const front = back ? -1 : 1;
      patch(`${name} highlight`, "hair", [[x - w * 0.22, y, z + front * (d + 0.15)], [x + w * 0.22, y, z + front * (d + 0.15)], [nx + nw * 0.22, ny, nz + front * (nd + 0.15)], [nx - nw * 0.22, ny, nz + front * (nd + 0.15)]], "hairLight");
    }
  }

  if (style === "buzz" || style === "fade") {
    for (const side of [-1, 1]) {
      loft("Clipped temple", "hair", [[60, 0.2, 0.2, side * 14, 1], [64, 1, 4, side * 14.3, 0], [70, 1.7, 4.2, side * 13, 0]], "hairDark");
      patch("Barber line", "hair", [[side * 12.8, 69.2, 6.8], [side * 14.5, 68.2, 4.5], [side * 14.5, 68.9, 4.5], [side * 12.8, 69.9, 6.8]], "hairShine");
    }
    if (style === "fade") for (let index = 0; index < 7; index++) ellipsoid("Textured crop curl", "hair", [-9 + index * 3, 77.2 + (index % 2) * 0.9, 3.5], [3.2, 3.1, 4.2], index % 2 ? "hair" : "hairLight");
  }
  if (["quiff", "pompadour", "slickback"].includes(style)) {
    for (const [index, x] of [-9, -4.5, 0, 4.5, 9].entries()) {
      const top = style === "pompadour" ? 86 - Math.abs(x) * 0.24 : style === "quiff" ? 83.5 - index * 1.3 : 79.5;
      strand("Brushed crest", [[68, 0.2, 0.2, x, 10], [72, 2.9, 1.6, x, 9.6], [top - 2.5, 3.6, 3.5, x - (style === "quiff" ? 2 : 0), 4.5], [top, 2.4, 2.8, x - 1, -0.5], [72, 2, 2, x, -8.7]], "hair");
    }
    if (style === "quiff") strand("Quiff curl", [[65, 0.1, 0.1, -9.5, 10.1], [69, 2.4, 1.2, -11, 10], [74, 3, 2.2, -9, 8.8]]);
  }
  if (style === "mohawk") for (const [index, z] of [-9, -4, 1, 6].entries()) strand("Mohawk fin", [[71, 2.8, 3.4, 0, z], [79, 3.2, 3.2, 0, z], [89 - Math.abs(index - 2) * 2, 0.15, 0.2, 1.2, z - 1.8]]);
  if (style === "locs") {
    for (let index = 0; index < 11; index++) {
      const angle = 0.95 + index / 10 * (Math.PI * 2 - 1.9);
      const x = Math.sin(angle) * 14.5, z = Math.cos(angle) * 10;
      strand("Long loc", [[43 + index % 3 * 3, 0.8, 0.8, x, z - 1], [48, 1.7, 1.8, x, z - 1], [62, 2, 2.2, x, z], [73, 2.2, 2.2, x * 0.8, z * 0.8], [78, 0.2, 0.2, x * 0.35, z * 0.35]], "hair", z < 0);
      if (index % 3 === 0) loft("Loc cuff", "hair", [[48, 1.85, 1.95, x, z - 1], [50, 1.85, 1.95, x, z - 1]], "gold");
    }
    for (const x of [-7, 0, 7]) strand("Forehead loc", [[63 + Math.abs(x) * 0.25, 0.7, 0.8, x, 10.4], [69, 2, 1.2, x, 10.3], [76, 2.4, 2, x * 0.5, 6.5]]);
  }
  if (style === "topknot") {
    ellipsoid("High knot", "hair", [0, 79.5, -6], [6.4, 5.7, 5], "hair");
    loft("Knot binding", "hair", [[76.5, 5.4, 4, 0, -6], [78, 5.5, 4.1, 0, -6]], "gold");
    for (const x of [-7, -2, 3, 8]) strand("Gathered topknot ridge", [[69, 0.1, 0.1, x, 10], [74, 1.3, 0.7, x * 0.8, 8.8], [78, 1.2, 1, x * 0.4, 2.5], [80, 0.1, 0.1, 0, -5]]);
  }
  if (style === "afropuff" || style === "nebula") {
    const centers = style === "afropuff" ? [[0, 80, -3, 10]] : [[-14, 77, -2, 6.6], [14, 77, -2, 6.6], [0, 82, -5, 5.3]];
    for (const [cx, cy, cz, radius] of centers) {
      ellipsoid("Cloud puff", "hair", [cx, cy, cz], [radius, radius * 0.8, radius * 0.85], "hair");
      for (let index = 0; index < 9; index++) {
        const angle = index / 9 * Math.PI * 2;
        ellipsoid("Puff curl", "hair", [cx + Math.cos(angle) * radius * 0.7, cy + Math.sin(angle) * radius * 0.55, cz + radius * 0.45], [radius * 0.35, radius * 0.32, radius * 0.4], index % 3 ? "hair" : "hairLight");
      }
    }
    if (style === "afropuff") loft("Puff wrap", "hair", [[75.4, 8, 6, 0, -3], [77.4, 8, 6, 0, -3]], "ribbon");
    else for (const [x, y] of [[-19, 77], [-11, 82], [14, 79], [3, 85]]) patch("Nebula sparkle", "hair", [[x, y + 2, 5], [x + 1, y, 5], [x, y - 2, 5], [x - 1, y, 5]], "gold");
  }
  if (style === "sidepony") {
    strand("Side ponytail", [[34, 0.2, 0.2, 17, -3], [42, 4, 3, 20, -4], [53, 5, 4, 21, -4], [63, 4.2, 3.6, 20, -3], [70, 2, 2.3, 14, -2]]);
    ellipsoid("Side pony bow", "hair", [17, 68, 1], [3.5, 1.5, 2], "ribbon");
  }
  if (["waterfall", "hollywood", "wetlook", "sidepony"].includes(style)) {
    for (const side of [-1, 1]) {
      if (style !== "sidepony") for (let index = 0; index < 3; index++) {
        const x = side * (10 + index * 2.8), z = -6 + index * 3.2;
        const length = style === "wetlook" ? 47 : 33 + index * 2;
        strand("Flowing wave", [[length, 0.2, 0.2, x - side * 2, z], [length + 5, 2.8, 2.1, x + side * 1.5, z], [49, 3.2, 2.6, x, z], [57, 3.5, 2.9, x + side * (style === "hollywood" ? 2.4 : 0.8), z], [66, 3.1, 3, x, z], [74, 0.2, 0.2, side * 10, z]], "hair", index === 0);
      }
      strand("Side-part fringe", [[side < 0 ? 63 : 67, 0.1, 0.1, side * 11.5, 10], [69, 3.2, 1.5, side * 9, 10], [74, 4.1, 1.8, side * 4.8, 7.8], [78, 1.2, 1, 3, 2.3]]);
    }
    if (style === "waterfall") for (let index = 0; index < 9; index++) ellipsoid("Waterfall braid", "hair", [-12 + index * 3, 68 - Math.sin(index / 8 * Math.PI) * 5, -10], [2.4, 1.9, 1.6], index % 2 ? "hairLight" : "hair");
    if (style === "wetlook") for (const x of [-10, -5, 0, 5, 10]) strand("Slick wet strand", [[56 + Math.abs(x) * 0.5, 0.1, 0.1, x, -10], [68, 0.6, 0.25, x, -11], [76, 0.4, 0.2, x * 0.5, -7]], "hair", true);
  }
  if (style === "flame") for (const [index, x] of [-13, -7, 0, 7, 13].entries()) strand("Flame tongue", [[68, 3.8, 3.8, x, 0], [77, 4.2, 3.6, x, -1], [84 + (2 - Math.abs(index - 2)) * 2, 2.7, 1.8, x + 2, -2], [88 + (2 - Math.abs(index - 2)) * 2, 0.1, 0.1, x - 1, -2]], index % 2 ? "hairLight" : "hair");
  if (style === "tentacles") for (const side of [-1, 1]) for (let index = 0; index < 3; index++) {
    const x = side * (12 + index * 2), z = 3 - index * 6;
    strand("Curling tentacle lock", [[37 + index * 4, 0.1, 0.1, x + side * 6, z + 2], [36 + index * 4, 1.8, 1.8, x + side * 3, z], [44 + index * 4, 3, 3, x + side * 4, z], [56, 3.4, 3.4, x + side * 2, z], [68, 3.6, 3.6, x, z], [75, 1, 1, side * 9, z]], "hair", index === 2);
    for (const y of [46, 51, 56]) ellipsoid("Tentacle pearl", "hair", [x + side * 3, y + index * 2, z + 3], [0.8, 1.1, 0.35], "hairShine", false);
  }
}

function fitHairToHeadwear(geometry, firstPart, headwear) {
  if (!["cap", "witch", "beret", "beanie", "fedora", "tricorn", "flatcap", "bandana", "sunhat", "ufo", "octopus", "leathercap"].includes(headwear)) return;
  for (const { element } of geometry.parts.slice(firstPart)) for (const vertex of Object.values(element.vertices)) {
    if (vertex[1] <= 74) continue;
    vertex[1] = 74 + (vertex[1] - 74) * 0.23;
    vertex[0] = Math.max(-15.5, Math.min(15.5, vertex[0]));
    vertex[2] = Math.max(-10.5, Math.min(10.5, vertex[2]));
  }
}

module.exports = { extendedHairStyles, createExtendedHair, fitHairToHeadwear };
