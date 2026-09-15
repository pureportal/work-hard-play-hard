function createModelKit(api, palette) {
  const { THREE, Cube, Mesh, MeshFace, Group, Texture } = api;
  const group = new Group({ name: "Furniture", origin: [0, 0, 0] }).init();
  const textures = {};
  const parts = [];

  for (const [name, color] of Object.entries(palette)) {
    const canvas = api.document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 16, 16);
    textures[name] = new Texture({ name: `${name}.png` }).fromDataURL(canvas.toDataURL()).add(false);
  }

  function box(name, position, size, material, rotation = [0, 0, 0]) {
    const faces = Object.fromEntries(["north", "east", "south", "west", "up", "down"].map((direction) => [direction, {
      texture: textures[material].uuid, uv: [0, 0, 16, 16],
    }]));
    const element = new Cube({
      name, origin: position, rotation, autouv: 0, faces,
      from: position.map((value, axis) => value - size[axis] / 2),
      to: position.map((value, axis) => value + size[axis] / 2),
    }).addTo(group).init();
    parts.push({ element, color: palette[material], outline: true });
    return element;
  }

  function shape(name, geometry, position, material, scale = [1, 1, 1], rotation = [0, 0, 0], outline = false) {
    geometry.scale(...scale);
    geometry.rotateX(rotation[0] * Math.PI / 180);
    geometry.rotateY(rotation[1] * Math.PI / 180);
    geometry.rotateZ(rotation[2] * Math.PI / 180);
    geometry.translate(...position);
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
    const coordinates = triangles.getAttribute("position");
    const element = new Mesh({ name, vertices: {} }).addTo(group);
    const vertexIds = new Map();
    for (let index = 0; index < coordinates.count; index += 3) {
      const vertices = [];
      for (let corner = 0; corner < 3; corner++) {
        const point = [coordinates.getX(index + corner), coordinates.getY(index + corner), coordinates.getZ(index + corner)].map((value) => Math.round(value * 100000) / 100000);
        const key = point.join(",");
        if (!vertexIds.has(key)) vertexIds.set(key, element.addVertices(point)[0]);
        vertices.push(vertexIds.get(key));
      }
      if (new Set(vertices).size !== 3) continue;
      element.addFaces(new MeshFace(element, { vertices, texture: textures[material].uuid, uv: Object.fromEntries(vertices.map((vertex) => [vertex, [8, 8]])) }));
    }
    element.init();
    triangles.dispose();
    if (triangles !== geometry) geometry.dispose();
    parts.push({ element, color: palette[material], outline });
    return element;
  }

  function cylinder(name, position, radius, height, material, topRadius = radius, rotation = [0, 0, 0]) {
    return shape(name, new THREE.CylinderGeometry(topRadius, radius, height, 32), position, material, [1, 1, 1], rotation);
  }

  function roundedBox(name, position, size, material) {
    const radius = Math.min(3, ...size.map(value => value * 0.28));
    const geometry = new THREE.BoxGeometry(...size, 6, 6, 6);
    const positions = geometry.getAttribute("position");
    const inner = size.map(value => value / 2 - radius);
    for (let index = 0; index < positions.count; index++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      const center = new THREE.Vector3(...point.toArray().map((value, axis) => Math.max(-inner[axis], Math.min(inner[axis], value))));
      point.sub(center).normalize().multiplyScalar(radius).add(center);
      positions.setXYZ(index, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    return shape(name, geometry, position, material);
  }

  function surfaceGrain(position, width, depth, material = "grain") {
    const [x, y, z] = position;
    for (let row = 0; row < 5; row++) {
      const offset = (row / 4 - 0.5) * Math.max(1, depth - 8);
      const length = width * (0.28 + row % 3 * 0.09);
      const center = x + Math.sin(row * 2.1) * width * 0.17;
      for (let segment = 0; segment < 4; segment++) {
        const start = [center - length / 2 + length * segment / 4, y, z + offset + Math.sin(segment + row) * 0.6];
        const end = [center - length / 2 + length * (segment + 1) / 4, y, z + offset + Math.sin(segment + 1 + row) * 0.6];
        branch("Material grain", start, end, 0.22, material);
      }
    }
  }

  function ellipsoid(name, position, size, material, rotation = [0, 0, 0]) {
    return shape(name, new THREE.SphereGeometry(1, 12, 8), position, material, size, rotation);
  }

  function branch(name, from, to, radius, material) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius * 0.6, radius, delta.length(), 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    return shape(name, geometry, start.add(end).multiplyScalar(0.5).toArray(), material);
  }

  return { box, roundedBox, shape, cylinder, ellipsoid, branch, surfaceGrain, group, parts, textures, THREE };
}

module.exports = { createModelKit };
