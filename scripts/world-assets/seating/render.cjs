async function renderSeatOcclusion(api, source, seats, settings) {
  const { THREE } = api;
  api.newProject(api.Formats.free);
  api.Codecs.project.parse(source);
  api.Canvas.updateAll();
  api.Canvas.scene.updateMatrixWorld(true);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0, 0);
  renderer.setSize(settings.size, settings.size);
  const scene = new THREE.Scene();
  const projection = new THREE.Group();
  projection.scale.z = Math.SQRT2;
  const root = new THREE.Group();
  projection.add(root);
  scene.add(projection);
  const uniforms = { seatDepth: { value: 0 }, seatHeight: { value: settings.seatHeight + 3 } };
  const materialOptions = {
    uniforms,
    vertexShader: `varying vec3 worldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `varying vec3 worldPosition;
      uniform float seatDepth;
      uniform float seatHeight;
      uniform float occludingPart;
      void main() {
        float foreground = occludingPart * step(seatDepth + 0.01, worldPosition.z) * step(seatHeight, worldPosition.y);
        gl_FragColor = vec4(vec3(1.0), foreground);
      }`,
  };
  const materials = [0, 1].map(occludingPart => [THREE.DoubleSide, THREE.BackSide].map(side => new THREE.ShaderMaterial({
    ...materialOptions, uniforms: { ...uniforms, occludingPart: { value: occludingPart } }, side,
  })));
  const geometries = [];
  const parts = [];
  for (const element of api.Project.elements) {
    if (!element.mesh?.geometry) continue;
    const occludingPart = /back|arm|bolster|spindle|sling|top rail|weave|bowl|basket rib|tuft|quilting|futon channel/i.test(element.name);
    const [solid, outline] = materials[Number(occludingPart)];
    const geometry = element.mesh.geometry.clone();
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(element.mesh.matrixWorld);
    const mesh = new THREE.Mesh(geometry, solid);
    mesh.matrix.copy(element.mesh.matrixWorld);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    const silhouetteGeometry = geometry.clone();
    const positions = silhouetteGeometry.getAttribute("position");
    const normals = silhouetteGeometry.getAttribute("normal");
    for (let index = 0; index < positions.count; index++) {
      positions.setXYZ(index, positions.getX(index) + normals.getX(index) * 0.4,
        positions.getY(index) + normals.getY(index) * 0.4, positions.getZ(index) + normals.getZ(index) * 0.4);
    }
    const silhouette = new THREE.Mesh(silhouetteGeometry, outline);
    silhouette.matrix.copy(mesh.matrix);
    silhouette.matrixAutoUpdate = false;
    root.add(silhouette);
    parts.push({ mesh, silhouette, center, occludingPart,
      back: /back|spindle|sling|top rail|weave|tuft|quilting|futon channel/i.test(element.name) && !/cheek/i.test(element.name) });
    geometries.push(geometry, silhouetteGeometry);
  }
  const extent = settings.size / settings.pixelsPerUnit / 2;
  const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 1000);
  camera.position.set(0, 156, 120);
  camera.lookAt(0, 36, 0);
  const results = [];
  try {
    for (let direction = 0; direction < 4; direction++) {
      const angle = direction * Math.PI / 2;
      root.rotation.y = -angle;
      for (const seat of seats) {
        uniforms.seatDepth.value = (Math.sin(angle) * seat.x + Math.cos(angle) * seat.z) * Math.SQRT2;
        for (const part of parts) {
          const depth = (Math.sin(angle) * part.center.x + Math.cos(angle) * part.center.z) * Math.SQRT2;
          const foreground = part.occludingPart && (!part.back || depth > uniforms.seatDepth.value + 0.01);
          [part.mesh.material, part.silhouette.material] = materials[Number(foreground)];
        }
        renderer.render(scene, camera);
        results.push({ seat: seat.id, direction, png: renderer.domElement.toDataURL("image/png").split(",")[1] });
      }
    }
    return results;
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials.flat()) material.dispose();
    renderer.dispose();
    api.Project.saved = true;
    await api.Project.close();
  }
}

module.exports = { renderSeatOcclusion };
