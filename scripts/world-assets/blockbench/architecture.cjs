const architectureCatalog = {
  rasterSize: 1,
  themeSets: [{ id: "architecture", variants: [{ id: "plaster", name: "Plaster", color: "#b59a87", secondaryColor: "#f4e6d2", accentColor: "#76645f" }] }],
  assets: [["wall", 32, 12], ["door", 64, 8], ["window", 96, 16]].map(([id, width, height]) => ({
    id, name: id, category: "architecture", kind: id, themeSetId: "architecture",
    placement: { layer: "ground", requires: "floor" },
    footprint: [{ range: { x: 0, y: 0, width, height }, type: "body", solid: id !== "door" }],
  })),
};

function buildArchitecture(kit, asset, width, depth) {
  const { box } = kit;
  const renderWidth = asset.id === "wall" ? width + 4 : width;
  box("Frame", [0, -0.1, 0], [renderWidth, 0.2, depth], "shade");
  if (asset.id === "wall") {
    box("Plaster cap", [0, 0.05, 0], [renderWidth, 0.1, depth - 2], "light");
    for (const z of [-depth / 2 + 2, depth / 2 - 2]) box("Oak molding", [0, 0.12, z], [renderWidth, 0.04, 1.3], "main");
    box("Cap highlight", [0, 0.15, -1.5], [renderWidth, 0.02, 0.7], "paper");
  } else if (asset.id === "door") {
    box("Open threshold", [0, 0.05, 0], [width - 3, 0.1, depth - 1.5], "main");
    for (const z of [-2, 2]) box("Sill grain", [0, 0.12, z], [width - 6, 0.04, 0.6], "light");
    for (const x of [-width / 2 + 2, width / 2 - 2]) box("Brass sill end", [x, 0.15, 0], [2, 0.1, depth - 1], "gold");
  } else {
    box("Glazing", [0, 0.05, 0], [width - 3, 0.1, depth - 3], "water");
    for (const z of [-depth / 2 + 1, depth / 2 - 1]) box("Window rail", [0, 0.12, z], [width, 0.1, 1.5], "light");
    for (const x of [-width / 2 + 1, 0, width / 2 - 1]) box("Mullion", [x, 0.18, 0], [1.8, 0.1, depth], "light");
    for (const x of [-28, 20]) {
      box("Glass reflection", [x, 0.14, 0], [1.2, 0.05, depth - 5], "waterLight", [0, -25, 0]);
      box("Glass glint", [x + 4, 0.14, 0], [0.6, 0.05, depth - 5], "paper", [0, -25, 0]);
    }
  }
  for (const part of kit.parts) part.outline = false;
}

module.exports = { architectureCatalog, buildArchitecture };
