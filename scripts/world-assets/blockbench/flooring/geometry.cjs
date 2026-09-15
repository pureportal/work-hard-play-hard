function createFloorGeometry(kit, width, depth) {
  const { THREE, shape, box } = kit;
  kit.group.name = "Flooring";
  box("Continuous backing", [0, -0.12, 0], [width + 8, 0.2, depth + 8], "main");

  function polygon(name, points, material, height = 0.02) {
    for (const [axis, boundary, above] of [[0, -4, true], [0, width + 4, false], [1, -4, true], [1, depth + 4, false]]) {
      const clipped = [];
      for (let index = 0; index < points.length; index++) {
        const first = points[index], second = points[(index + 1) % points.length];
        const insideFirst = above ? first[axis] >= boundary : first[axis] <= boundary;
        const insideSecond = above ? second[axis] >= boundary : second[axis] <= boundary;
        if (insideFirst) clipped.push(first);
        if (insideFirst !== insideSecond) {
          const fraction = (boundary - first[axis]) / (second[axis] - first[axis]);
          clipped.push(first.map((value, coordinate) => value + (second[coordinate] - value) * fraction));
        }
      }
      points = clipped;
    }
    if (points.length < 3) return;
    const geometry = new THREE.BufferGeometry();
    const positions = points.flatMap(([x, z]) => [x - width / 2, height, z - depth / 2]);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), []).flat());
    geometry.computeVertexNormals();
    return shape(name, geometry, [0, 0, 0], material);
  }

  function rectangle(name, x, z, w, d, material, height = 0.02) {
    return polygon(name, [[x, z], [x + w, z], [x + w, z + d], [x, z + d]], material, height);
  }

  function polygons(name, contours, material, height) {
    const positions = [], indices = [];
    for (const points of contours) {
      const offset = positions.length / 3;
      positions.push(...points.flatMap(([x, z]) => [x - width / 2, height, z - depth / 2]));
      indices.push(...THREE.ShapeUtils.triangulateShape(points.map(([x, z]) => new THREE.Vector2(x, z)), []).flat().map(index => index + offset));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return shape(name, geometry, [0, 0, 0], material);
  }

  function line(name, points, thickness, material, height = 0.05) {
    for (let index = 1; index < points.length; index++) {
      const [x, z] = points[index - 1];
      const [endX, endZ] = points[index];
      const length = Math.hypot(endX - x, endZ - z);
      const dx = (endZ - z) / length * thickness / 2;
      const dz = (endX - x) / length * thickness / 2;
      polygon(name, [[x - dx, z + dz], [endX - dx, endZ + dz], [endX + dx, endZ - dz], [x + dx, z - dz]], material, height);
    }
  }

  function ellipse(name, x, z, rx, rz, material, height = 0.04, sides = 10) {
    return polygon(name, Array.from({ length: sides }, (_, index) => {
      const angle = index * Math.PI * 2 / sides;
      return [x + Math.cos(angle) * rx, z + Math.sin(angle) * rz];
    }), material, height);
  }

  function repeat(draw) {
    for (const x of [-width, 0, width]) for (const z of [-depth, 0, depth]) draw(x, z);
  }

  function scatter(count, draw) {
    let seed = 7193;
    const random = () => {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0;
      return (seed >>> 0) / 4294967296;
    };
    for (let index = 0; index < count; index++) {
      const x = random() * width;
      const z = random() * depth;
      const size = 0.65 + random() * 1.1;
      draw(x, z, size, index, random);
    }
  }

  function chips(count, size, colors = ["light", "grain", "shade"], height = 0.04) {
    scatter(count, (x, z, scale, index, random) => {
      const radius = size * scale;
      const angle = random() * Math.PI * 2;
      const points = Array.from({ length: 5 }, (_, corner) => {
        const turn = angle + corner * Math.PI * 2 / 5;
        return [Math.cos(turn) * radius * (0.55 + random() * 0.4), Math.sin(turn) * radius];
      });
      repeat((dx, dz) => polygon("Mineral chip", points.map(([px, pz]) => [x + dx + px, z + dz + pz]), colors[index % colors.length], height));
    });
  }

  function tiles(tileWidth, tileDepth, gap, decorate, stagger = 0) {
    rectangle("Grout bed", -4, -4, width + 8, depth + 8, "shade", 0);
    for (let row = -1; row <= depth / tileDepth; row++) {
      const offset = ((row % 2 + 2) % 2) * stagger;
      for (let column = -1; column <= width / tileWidth; column++) {
        const x = column * tileWidth + offset;
        const z = row * tileDepth;
        decorate(x + gap / 2, z + gap / 2, tileWidth - gap, tileDepth - gap, column, row);
      }
    }
  }

  return { polygon, polygons, rectangle, line, ellipse, repeat, scatter, chips, tiles, width, depth };
}

module.exports = { createFloorGeometry };
