function createCharacterGeometry(api, bones, palette) {
  const { THREE, Mesh, MeshFace, Texture, document } = api;
  const textures = {};
  const parts = [];
  for (const [name, color] of Object.entries(palette)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 16, 16);
    textures[name] = new Texture({ name: `${name}.png` }).fromDataURL(canvas.toDataURL()).add(false);
  }

  function mesh(name, parent, geometry, material, outline = true) {
    const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
    const positions = triangles.getAttribute("position");
    const element = new Mesh({ name, vertices: {} }).addTo(bones[parent]);
    const ids = new Map();
    for (let index = 0; index < positions.count; index += 3) {
      const vertices = [];
      for (let corner = 0; corner < 3; corner++) {
        const point = [positions.getX(index + corner), positions.getY(index + corner), positions.getZ(index + corner)]
          .map((value) => Math.round(value * 100000) / 100000);
        const key = point.join(",");
        if (!ids.has(key)) ids.set(key, element.addVertices(point)[0]);
        vertices.push(ids.get(key));
      }
      if (new Set(vertices).size !== 3) continue;
      element.addFaces(new MeshFace(element, {
        vertices, texture: textures[material].uuid,
        uv: Object.fromEntries(vertices.map((vertex) => [vertex, [8, 8]])),
      }));
    }
    element.init();
    triangles.dispose();
    if (triangles !== geometry) geometry.dispose();
    const layer = ["head", "eyes"].includes(parent) ? "head" : ["hair", "hair_tail", "headphones"].includes(parent) ? "hair" : parent.endsWith("_foot") ? "shoes" : parent === "pelvis" || parent.endsWith("_thigh") || parent.endsWith("_shin") ? "lower" : "upper";
    parts.push({ element, color: palette[material], material, outline, layer });
    return element;
  }

  function ellipsoid(name, parent, position, radii, material, outline = true) {
    const geometry = new THREE.SphereGeometry(1, 16, 12);
    geometry.scale(...radii).translate(...position);
    return mesh(name, parent, geometry, material, outline);
  }

  function loft(name, parent, rings, material, start = 0, arc = Math.PI * 2) {
    const positions = [];
    const indices = [];
    const segments = 20;
    for (const [y, radiusX, radiusZ, centerX = 0, centerZ = 0] of rings) {
      for (let segment = 0; segment <= segments; segment++) {
        const angle = start + arc * segment / segments;
        positions.push(centerX + Math.sin(angle) * radiusX, y, centerZ + Math.cos(angle) * radiusZ);
      }
    }
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = ring * (segments + 1) + segment;
        const b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return mesh(name, parent, geometry, material);
  }

  function patch(name, parent, points, material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex(Array.from({ length: points.length - 2 }, (_, index) => [0, index + 1, index + 2]).flat());
    geometry.computeVertexNormals();
    return mesh(name, parent, geometry, material, false);
  }

  return { parts, mesh, ellipsoid, loft, patch };
}

module.exports = { createCharacterGeometry };
