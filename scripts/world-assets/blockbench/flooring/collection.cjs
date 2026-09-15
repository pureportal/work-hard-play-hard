function buildCollectionFloor(geometry, asset, variant) {
  const { rectangle, polygon, line, ellipse, tiles, scatter, repeat, chips, width, depth } = geometry;
  const design = ["classic", "crafted", "patterned"].indexOf(variant.id);
  if (asset.id === "floor-glass") {
    const size = design === 0 ? 16 : design === 1 ? 8 : 8;
    tiles(size, design === 1 ? 32 : size, 1, (x, z, w, d, col, row) => {
      rectangle("Glass block face", x, z, w, d, design === 2 && (col + row) % 3 === 0 ? "grain" : "main");
      rectangle("Refracted inner edge", x + 1, z + 1, w - 2, d - 2, "light", 0.04);
      rectangle("Glass interior", x + 2, z + 2, w - 4, d - 4, "grain", 0.05);
      line("Glass reflection", [[x + 2, z + d * 0.65], [x + w * 0.6, z + 2]], 0.6, "highlight", 0.07);
      if (design === 1) for (let zz = z + 3; zz < z + d - 2; zz += 3) line("Frosted glass rib", [[x + 1, zz], [x + w - 1, zz]], 0.35, "light", 0.07);
    });
  } else if (asset.id === "floor-grating") {
    rectangle("Grating recess", -4, -4, width + 8, depth + 8, "shade", 0);
    if (design < 2) {
      const gap = design === 0 ? 8 : 4;
      for (let x = -gap; x <= width + gap; x += gap) rectangle("Steel load bar", x, -4, 1.3, depth + 8, "light", 0.04);
      for (let z = -16; z <= depth + 16; z += design === 0 ? 8 : 32) rectangle("Steel crossbar", -4, z, width + 8, 1.4, "main", 0.06);
    } else {
      for (let offset = -width - depth; offset <= width + depth; offset += 8) {
        line("Expanded mesh diagonal", [[offset - 4, -4], [offset + depth + 4, depth + 4]], 1.3, "light", 0.04);
        line("Expanded mesh cross", [[offset + depth + 4, -4], [offset - 4, depth + 4]], 1.3, "highlight", 0.06);
      }
    }
    for (const x of [1, width - 1]) for (const z of [1, depth - 1]) ellipse("Grating fastener", x, z, 0.65, 0.65, "highlight", 0.08);
  } else if (asset.id === "floor-leather") {
    if (design < 2) tiles(design === 0 ? 16 : 32, design === 0 ? 16 : 32, 0.8, (x, z, w, d) => {
      rectangle("Leather panel", x, z, w, d, "main");
      rectangle("Soft panel face", x + 1.5, z + 1.5, w - 3, d - 3, "grain", 0.04);
      for (let offset = 2; offset < w - 1; offset += 2) for (const zz of [z + 1, z + d - 1]) rectangle("Leather stitch", x + offset, zz, 0.8, 0.35, "light", 0.06);
      for (let offset = 2; offset < d - 1; offset += 2) for (const xx of [x + 1, x + w - 1]) rectangle("Leather stitch", xx, z + offset, 0.35, 0.8, "light", 0.06);
      if (design === 1) {
        line("Diamond seam", [[x, z + d / 2], [x + w / 2, z], [x + w, z + d / 2], [x + w / 2, z + d], [x, z + d / 2]], 0.55, "stitch", 0.06);
        ellipse("Quilt center", x + w / 2, z + d / 2, 0.8, 0.8, "shade", 0.08);
      }
    });
    else for (let row = -1; row <= depth / 8; row++) for (let col = -1; col <= width / 8; col++) {
      const horizontal = (row + col) % 2 === 0;
      rectangle("Leather woven strip", col * 8 + 0.4, row * 8 + 0.4, 7.2, 7.2, horizontal ? "main" : "grain");
      for (const side of [1, 6.5]) rectangle("Woven leather seam", col * 8 + (horizontal ? 0.6 : side), row * 8 + (horizontal ? side : 0.6), horizontal ? 6.8 : 0.35, horizontal ? 0.35 : 6.8, "light", 0.06);
    }
  } else if (asset.id === "floor-earth") {
    if (design === 0) {
      for (let row = -1; row <= 4; row++) {
        const contour = Array.from({ length: 17 }, (_, i) => [i * 4, row * 16 + Math.sin(i * Math.PI / 8 + row * Math.PI) * 2]);
        polygon("Compacted clay stratum", [...contour, ...contour.toReversed().map(([x, z]) => [x, z + 7])], row % 2 ? "grain" : "main", 0.02);
        line("Compaction grain", contour, 0.4, "stitch", 0.04);
      }
    } else if (design === 1) scatter(22, (x, z, size, index) => repeat((dx, dz) => ellipse("Trowelled earth patch", x + dx, z + dz, size * 7, size * 2.7, index % 3 ? "grain" : "main", 0.02, 13)));
    else chips(90, 0.65, ["grain", "light", "shade"]);
    scatter(110, (x, z, size, index) => repeat((dx, dz) => ellipse("Earth pore", x + dx, z + dz, 0.18 * size, 0.25 * size, index % 2 ? "grain" : "stitch", 0.05, 5)));
  } else if (asset.id === "floor-felt") {
    if (design === 1) tiles(32, 32, 0.5, (x, z, w, d, col, row) => {
      rectangle("Felt panel", x, z, w, d, (col + row) % 2 ? "main" : "grain");
      for (let offset = 2; offset < w; offset += 3) {
        rectangle("Blanket stitch", x + offset, z + 1, 0.6, 1.8, "light", 0.05);
        rectangle("Blanket stitch", x + 1, z + offset, 1.8, 0.6, "light", 0.05);
      }
    });
    if (design === 2) for (let z = -16; z <= depth; z += 16) { rectangle("Pressed wool stripe", -4, z, width + 8, 7, "grain"); rectangle("Wool stripe edge", -4, z + 7, width + 8, 1, "light", 0.03); }
    const bundles = [[], []];
    scatter(500, (x, z, size, index, random) => {
      const dx = (random() - 0.5) * 1.4, dz = (random() - 0.5) * 1.4;
      bundles[index % 2].push([[x - 0.15, z], [x + dx, z + dz], [x + 0.15, z + 0.25]]);
    });
    bundles.forEach((contours, index) => geometry.polygons("Matted wool fibre", contours, index ? "stitch" : "light", 0.07));
  } else if (asset.id === "floor-seagrass") {
    if (design === 1) {
      for (let offset = -width - depth; offset <= width + depth; offset += 4) {
        line("Diagonal grass warp", [[offset - 4, -4], [offset + depth + 4, depth + 4]], 1.8, "light", 0.03);
        line("Diagonal grass weft", [[offset + depth + 4, -4], [offset - 4, depth + 4]], 1.2, "stitch", 0.05);
      }
    } else {
      const step = design === 0 ? 8 : 4;
      for (let row = -1; row <= depth / step; row++) for (let col = -1; col <= width / step; col++) {
        const horizontal = (row + col) % 2 === 0;
        rectangle("Interwoven seagrass bundle", col * step + 0.4, row * step + 0.4, step - 0.8, step - 0.8, horizontal ? "light" : "grain", 0.02);
        for (let strand = 1; strand < step - 1; strand += 1.6) rectangle("Seagrass strand", col * step + (horizontal ? 0.6 : strand), row * step + (horizontal ? strand : 0.6), horizontal ? step - 1.2 : 0.45, horizontal ? 0.45 : step - 1.2, "stitch", 0.05);
      }
      if (design === 2) for (let offset = 0; offset <= width; offset += 32) { rectangle("Panel binding", offset - 0.5, -4, 1, depth + 8, "shade", 0.08); rectangle("Panel binding", -4, offset - 0.5, width + 8, 1, "shade", 0.08); }
    }
  } else throw new Error(`Missing collection floor: ${asset.id}`);
}

module.exports = { buildCollectionFloor };
