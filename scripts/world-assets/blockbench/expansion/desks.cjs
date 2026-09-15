const { expansionLegs, expansionTop, expansionDrawers } = require("./joinery.cjs");

const expandedDesks = {
  "desk-secretary": "secretary", "desk-rolltop": "rolltop", "desk-sawhorse": "sawhorse",
  "desk-pedestal": "pedestal", "desk-partner": "partner", "desk-carrel": "carrel",
  "desk-laboratory": "laboratory", "desk-sewing": "sewing", "desk-animation": "animation",
  "desk-music": "music", "desk-jeweler": "jeweler", "desk-calligraphy": "calligraphy",
  "desk-floating-shelf": "floating", "desk-pipe": "pipe", "desk-campaign": "campaign",
  "desk-library": "library", "desk-ladder": "ladder", "desk-traveler": "traveler",
  "desk-glass": "glass", "desk-computer-hutch": "computer", "desk-modular": "modular",
};

function buildExpandedDesk(kit, asset, width, depth) {
  const style = expandedDesks[asset.id];
  const { box, roundedBox, cylinder, branch } = kit;
  const height = style === "jeweler" ? 40 : 34;
  if (style === "jeweler") {
    for (const [x, z, w, d] of [[0, -8, width, depth - 16], [-24, depth / 2 - 8, 32, 16], [24, depth / 2 - 8, 32, 16]]) {
      box("Notched jeweler worktop", [x, height, z], [w - 0.3, 3, d - 0.3], "main");
      box("Wood worktop face", [x, height + 1.55, z], [w - 1, 0.1, d - 1], "light");
      kit.surfaceGrain([x, height + 1.65, z], w - 6, d - 6);
    }
  } else expansionTop(kit, width, depth, height, "rectangle", style === "glass" ? "waterLight" : "light");
  if (!["pedestal", "partner", "floating", "ladder", "modular"].includes(style)) expansionLegs(kit, width, depth, height - 3, ["sawhorse", "campaign"].includes(style) ? "trestle" : ["pipe", "glass", "music"].includes(style) ? "sled" : "tapered");
  const back = -depth / 2 + 5;
  if (style === "secretary" || style === "computer") {
    box("Hutch back", [0, height + 16, back], [width - 2, 30, 2], "main");
    for (const x of [-width / 2 + 2, width / 2 - 2]) box("Hutch cheek", [x, height + 15, back + 5], [3, 30, 12], "wood");
    box("Hutch cornice", [0, height + 31, back + 5], [width - 1, 3, 14], "light");
    box("Hutch shelf", [0, height + (style === "computer" ? 23 : 16), back + 5], [width - 4, 2, 12], "wood");
    if (style === "secretary") for (let x = -width / 2 + 18; x < width / 2 - 9; x += 16) box("Letter cubby divider", [x, height + 23, back + 5], [1.5, 12, 10], "wood");
    else {
      box("Keyboard tray", [0, height - 5, depth / 2 - 9], [width - 28, 2, 16], "shade");
      expansionDrawers(kit, width / 2 - 14, 0, 23, depth - 10, height - 4, 2);
      box("Computer monitor", [-10, height + 12, back + 9], [30, 19, 2], "shade");
      box("Monitor glass", [-10, height + 12, back + 10.1], [26, 15, 0.2], "water");
      box("Screen window", [-13, height + 13, back + 10.3], [16, 9, 0.1], "paper");
      box("Monitor stand", [-10, height + 2, back + 9], [14, 1, 8], "shade");
    }
  } else if (style === "rolltop") {
    for (const side of [-1, 1]) roundedBox("Rolltop end", [side * (width / 2 - 3), height + 11, back + 8], [5, 23, 22], "main");
    for (let step = 0; step <= 12; step++) {
      const angle = step * Math.PI / 24;
      box("Curved tambour slat", [0, height + 3 + Math.cos(angle) * 21, back + 2 + Math.sin(angle) * 19], [width - 6, 2, 2], step % 3 === 0 ? "wood" : "main", [-step * 7.5, 0, 0]);
    }
    expansionDrawers(kit, -width / 2 + 14, 0, 23, depth - 8, height - 4);
  } else if (style === "pedestal" || style === "partner") {
    const sides = style === "partner" ? [-1, 1] : [-1];
    for (const side of sides) expansionDrawers(kit, side * (width / 2 - 15), 0, 26, depth - 6, height - 3, 3);
    if (style === "pedestal") for (const z of [-depth / 2 + 4, depth / 2 - 4]) cylinder("Open-side leg", [width / 2 - 4, 15, z], 2.4, 30, "gold");
    if (style === "partner") {
      roundedBox("Leather writing inset", [0, height + 1.04, 0], [width - 14, 0.2, depth - 13], "shade");
      box("Dividing brass strip", [0, height + 1.18, 0], [width - 14, 0.12, 0.9], "gold");
    }
  } else if (style === "carrel") {
    for (const side of [-1, 1]) box("Acoustic privacy wing", [side * (width / 2 - 2), height + 17, 0], [3, 34, depth - 2], "main");
    box("Acoustic back", [0, height + 17, back], [width - 4, 34, 3], "main");
    for (let x = -width / 2 + 8; x < width / 2; x += 6) box("Felt vertical seam", [x, height + 17, back + 1.7], [0.5, 29, 0.2], "stitch");
  } else if (style === "laboratory") {
    roundedBox("Resin working slab", [0, height + 1.2, 0], [width - 6, 0.6, depth - 6], "paper");
    for (const x of [-width / 2 + 5, width / 2 - 5]) box("Utility rail post", [x, height + 17, back], [2, 34, 2], "shade");
    box("Utility service rail", [0, height + 28, back], [width - 8, 5, 4], "shade");
    for (let x = -width / 2 + 15; x < width / 2; x += 18) box("Service socket", [x, height + 28, back + 2.1], [5, 3, 0.4], "cream");
    box("Instrument shelf", [0, height + 12, back + 3], [width - 12, 2, 8], "main");
  } else if (style === "sewing") {
    roundedBox("Sewing machine base", [0, height + 2, back + 5], [30, 3, 14], "cream");
    roundedBox("Sewing machine arm", [0, height + 17, back + 5], [28, 7, 9], "main");
    roundedBox("Machine column", [9, height + 10, back + 5], [8, 20, 10], "main");
    cylinder("Handwheel", [15, height + 16, back + 5], 4, 2, "gold", 4, [0, 0, 90]);
    branch("Needle", [-10, height + 14, back + 5], [-10, height + 4, back + 5], 0.5, "shade");
    box("Foot pedal", [0, 2, 6], [12, 3, 9], "shade");
  } else if (style === "animation") {
    roundedBox("Lightbox bezel", [0, height + 2, 0], [width - 14, 2, depth - 10], "shade");
    roundedBox("Lightbox glass", [0, height + 3.1, 0], [width - 19, 0.2, depth - 15], "paper");
    for (const x of [-9, 0, 9]) cylinder("Animation registration peg", [x, height + 4, back + 4], 0.8, 1.5, "gold");
    box("Pencil trough", [0, height + 1.1, depth / 2 - 4], [width - 12, 1, 3], "wood");
  } else if (style === "music") {
    box("Keyboard housing", [0, height + 1.5, depth / 2 - 8], [width - 10, 1.5, 15], "shade");
    for (let key = 0; key < 20; key++) box("Piano key", [-width / 2 + 10 + key * (width - 20) / 20, height + 2.5, depth / 2 - 6], [(width - 22) / 20, 0.4, 9], "paper");
    for (let key = 0; key < 19; key++) if (key % 7 !== 2 && key % 7 !== 6) box("Piano sharp", [-width / 2 + 12 + key * (width - 20) / 20, height + 3.1, depth / 2 - 8], [1.5, 0.7, 4.5], "ink");
    box("Monitor bridge", [0, height + 10, back + 3], [width - 5, 3, 10], "main");
    for (const x of [-width / 2 + 5, width / 2 - 5]) box("Bridge support", [x, height + 5, back + 3], [4, 10, 8], "shade");
  } else if (style === "jeweler") {
    box("Jeweler catch drawer", [0, height - 10, -8], [width - 13, 7, depth - 24], "shade");
    box("Bench pin", [0, height, depth / 2 - 17], [7, 3, 5], "wood");
    for (const x of [-width / 2 + 4, width / 2 - 4]) box("Raised tool edge", [x, height + 3, 0], [3, 5, depth - 2], "wood");
    for (let x = -width / 2 + 10; x < width / 2; x += 8) cylinder("Tool holder hole", [x, height + 1.1, back], 1.6, 0.2, "shade");
  } else if (style === "calligraphy") {
    roundedBox("Writing felt", [0, height + 1.1, 2], [width - 16, 0.2, depth - 15], "ink");
    for (const x of [-width / 2 + 12, width / 2 - 12]) box("Scroll roller", [x, height + 2, 2], [2.5, 2.5, depth - 15], "wood");
    box("Brush rest", [0, height + 3, back + 3], [22, 3, 5], "main");
    for (const x of [-6, 1, 7]) branch("Brush", [x, height + 4.5, back], [x, height + 4.5, back + 9], 0.55, "gold");
  } else if (style === "floating") {
    box("Cantilever back", [0, height / 2, back], [width - 4, height, 5], "main");
    for (const x of [-width / 2 + 10, width / 2 - 10]) branch("Cantilever brace", [x, 2, back + 3], [x, height - 3, depth / 2 - 5], 2, "gold");
    box("Floating drawer", [0, height - 7, 2], [width - 10, 8, depth - 6], "main");
    box("Recessed drawer grip", [0, height - 5, depth / 2 - 1], [width - 18, 1.2, 0.5], "shade");
  } else if (style === "pipe") {
    for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 3, depth / 2 - 3]) cylinder("Pipe coupling", [x, height - 7, z], 3, 3, "gold");
    box("Lower reclaimed shelf", [0, 9, 0], [width - 10, 3, depth - 8], "wood");
    for (let z = -depth / 2 + 8; z < depth / 2; z += 10) box("Reclaimed board joint", [0, height + 1, z], [width - 5, 0.15, 0.6], "shade");
  } else if (style === "campaign" || style === "traveler") {
    roundedBox("Campaign writing case", [0, height - 3, 0], [width - 2, 9, depth - 2], "main");
    for (const x of [-width / 2 + 5, width / 2 - 5]) for (const z of [-depth / 2 + 5, depth / 2 - 5]) box("Brass corner plate", [x, height + 1.6, z], [8, 0.3, 8], "gold");
    for (const x of [-width / 4, width / 4]) box("Case latch", [x, height - 2, depth / 2 - 0.7], [5, 4, 1], "gold");
    if (style === "traveler") {
      box("Open case lid", [0, height + 20, back], [width - 3, 38, 3], "main");
      roundedBox("Lid document pocket", [0, height + 16, back + 2], [width - 15, 18, 1], "shade");
      box("Pocket trim", [0, height + 25, back + 2.6], [width - 17, 1.4, 0.3], "gold");
    }
  } else if (style === "library") {
    box("Library book ledge", [0, height + 12, back + 5], [width - 4, 3, 15], "wood");
    for (const x of [-width / 2 + 4, width / 2 - 4]) box("Book ledge end", [x, height + 7, back + 5], [3, 12, 15], "main");
    for (const x of [-width / 3, 0, width / 3]) {
      cylinder("Reading light stem", [x, height + 9, back + 5], 0.9, 16, "gold");
      roundedBox("Reading light shade", [x, height + 18, back + 7], [17, 4, 7], "green");
    }
  } else if (style === "ladder") {
    for (const side of [-1, 1]) for (const z of [-depth / 2 + 3, depth / 2 - 3]) box("Ladder upright", [side * (width / 2 - 2), 34, z], [3, 68, 3], "wood");
    for (const y of [10, 48, 64]) box("Ladder shelf", [0, y, back + 7], [width - 2, 2, 16], "main");
  } else if (style === "glass") {
    for (const z of [-depth / 2 + 2, depth / 2 - 2]) box("Polished glass edge", [0, height + 1.1, z], [width - 4, 0.2, 1], "water");
    branch("Glass reflected highlight", [-width / 3, height + 1.05, -depth / 3], [width / 3, height + 1.05, depth / 3], 0.35, "paper");
    box("Suspended pencil drawer", [0, height - 7, 0], [width / 2, 5, depth - 10], "shade");
  } else if (style === "modular") {
    expansionDrawers(kit, -width / 2 + 16, 0, 28, depth - 4, height - 3, 2);
    for (const x of [width / 2 - 27, width / 2 - 2]) box("Open pedestal side", [x, 15, 0], [3, 30, depth - 4], "main");
    for (const y of [2, 15, 28]) box("Open pedestal shelf", [width / 2 - 14, y, 0], [27, 2, depth - 3], "wood");
  }
  return { surfaceHeight: height + (style === "animation" ? 3.2 : style === "jeweler" ? 1.65 : style === "laboratory" ? 1.5 : 1.1) };
}

module.exports = { expandedDesks, buildExpandedDesk };
