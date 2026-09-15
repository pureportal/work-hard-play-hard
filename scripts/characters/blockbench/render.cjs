async function renderCharacterLayer(api, model, animations, settings, layer) {
  const { THREE } = api;
  const size = settings.frameSize;
  const pixelsPerUnit = 1.1;
  const elevation = 10 * Math.PI / 180;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const gradientMap = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.LuminanceFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const light = new THREE.DirectionalLight(0xfff4e6, 0.9);
  light.position.set(-70, 140, 150);
  scene.add(new THREE.AmbientLight(0xe7e8ff, 0.45), light);
  const extent = size / pixelsPerUnit / 2;
  const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 400);
  camera.position.set(0, Math.sin(elevation) * 200, Math.cos(elevation) * 200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const atlas = api.document.createElement("canvas");
  atlas.width = settings.atlasSize;
  atlas.height = settings.atlasHeight * 2;
  const atlasContext = atlas.getContext("2d");
  const frameCanvas = api.document.createElement("canvas");
  frameCanvas.width = frameCanvas.height = size;
  const context = frameCanvas.getContext("2d", { willReadFrequently: true });
  const depthMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: "varying float depthValue; void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); depthValue = (-view.z - 100.0) / 200.0; gl_Position = projectionMatrix * view; }",
    fragmentShader: "varying float depthValue; void main() { float value = floor(clamp(depthValue, 0.0, 1.0) * 65534.0); gl_FragColor = vec4(floor(value / 256.0) / 255.0, mod(value, 256.0) / 255.0, 0.0, 1.0); }",
  });
  const parts = [];
  const disposables = [gradientMap, depthMaterial];
  for (const { element, color, outline } of model.parts.filter(part => part.layer === layer)) {
    const geometry = element.mesh.geometry.clone();
    geometry.computeVertexNormals();
    const options = { color: new THREE.Color(color).convertSRGBToLinear(), side: THREE.DoubleSide };
    const material = outline ? new THREE.MeshToonMaterial({ ...options, gradientMap }) : new THREE.MeshBasicMaterial(options);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    parts.push({ element, mesh });
    disposables.push(geometry, material);
  }

  function pose(motion, time, direction) {
    for (const animation of Object.values(animations)) animation.playing = false;
    animations[motion].select();
    animations[motion].playing = true;
    api.Timeline.time = time;
    api.Animator.preview();
    api.Canvas.scene.updateMatrixWorld(true);
    for (const { element, mesh } of parts) mesh.matrix.copy(element.mesh.matrixWorld);
    root.position.set(0, 0, 0);
    root.rotation.y = { down: 0, left: -Math.PI / 3, right: Math.PI / 3, up: Math.PI }[direction];
    root.updateMatrixWorld(true);
    const seated = motion.startsWith("sit");
    const point = seated ? new THREE.Vector3().setFromMatrixPosition(model.bones.pelvis.mesh.matrixWorld) : new THREE.Vector3(0, 0, 0);
    point.applyMatrix4(root.matrixWorld).project(camera);
    const anchor = seated ? settings.anchors.hip : settings.anchors.foot;
    const shiftX = (anchor.x - (point.x + 1) * size / 2) / pixelsPerUnit;
    const shiftY = ((1 - point.y) * size / 2 - anchor.y) / pixelsPerUnit;
    root.position.set(shiftX, Math.cos(elevation) * shiftY, -Math.sin(elevation) * shiftY);
    scene.overrideMaterial = null;
    renderer.render(scene, camera);
    context.clearRect(0, 0, size, size);
    context.drawImage(renderer.domElement, 0, 0);
    const color = context.getImageData(0, 0, size, size);
    scene.overrideMaterial = depthMaterial;
    renderer.render(scene, camera);
    context.clearRect(0, 0, size, size);
    context.drawImage(renderer.domElement, 0, 0);
    const depth = context.getImageData(0, 0, size, size);
    const outlined = new Uint8ClampedArray(color.data);
    const ink = model.palette.ink.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16));
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const index = (y * size + x) * 4;
      if (color.data[index + 3]) continue;
      const neighbors = [index - 4, index + 4, index - size * 4, index + size * 4].filter(offset => color.data[offset + 3] === 255);
      if (!neighbors.length) continue;
      const nearest = Math.min(...neighbors.map(offset => depth.data[offset] * 256 + depth.data[offset + 1])) + 24;
      outlined.set([...ink, 255], index);
      depth.data.set([nearest >> 8, nearest & 255, 0, 255], index);
    }
    color.data.set(outlined);
    let visible = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!color.data[(y * size + x) * 4 + 3]) continue;
      visible++;
      if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) throw new Error(`Clipped ${layer}/${motion}/${direction}: ${x},${y}`);
    }
    if (!visible) throw new Error(`Empty ${layer}/${motion}/${direction}`);
    return { color, depth };
  }

  let frames = 0;
  try {
    for (const [motion, clip] of Object.entries(settings.atlasClips)) {
      for (const [directionIndex, direction] of settings.directions.entries()) {
        const first = pose(motion, 0, direction);
        const end = pose(motion, characterClips[motion].length, direction);
        if (first.color.data.some((value, index) => value !== end.color.data[index]) || first.depth.data.some((value, index) => value !== end.depth.data[index])) throw new Error(`Open loop ${layer}/${motion}/${direction}`);
        for (let frame = 0; frame < clip.frames; frame++) {
          const { color, depth } = frame === 0 ? first : pose(motion, frame * clip.frameDuration / 1000, direction);
          const x = (clip.column + frame) * size;
          const y = (clip.row + directionIndex) * size;
          atlasContext.putImageData(color, x, y);
          atlasContext.putImageData(depth, x, y + settings.atlasHeight);
          frames++;
        }
      }
    }
    return { png: atlas.toDataURL("image/png").split(",")[1], frames };
  } finally {
    for (const disposable of disposables) disposable.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

module.exports = { renderCharacterLayer };
