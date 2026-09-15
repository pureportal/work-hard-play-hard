const { models } = require("./lounge-models.cjs");

async function renderWorldAssets(api, catalog, requested = [], output = "scripts/world-assets/blockbench") {
  const { THREE } = api;
  const pixelsPerUnit = 6;
  const directions = ["south", "west", "north", "east"];
  const results = [];
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0, 0);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const gradientMap = new THREE.DataTexture(new Uint8Array([130, 194, 255]), 3, 1, THREE.LuminanceFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;

  try {
    for (const asset of catalog.assets.filter(asset => !requested.length || requested.includes(asset.id))) {
      const assetId = asset.id;
      const footprint = getCatalogFootprint(asset, catalog.rasterSize);
      const size = Math.ceil((Math.max(footprint.width, footprint.depth, 150) * pixelsPerUnit + 512) / 128) * 128;
      renderer.setSize(size, size);
      const rendered = { assetId, pixelsPerUnit, variants: {} };
      const variants = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants;
      for (const variant of variants) {
        const variantId = variant.id;
        const model = await createCatalogModel(api, asset, variant, catalog.rasterSize);
        const directory = `${output}/renders/${assetId}/${variantId}`;
        const compiled = api.Codecs.project.compile();
        const modelFile = `${output}/models/${assetId}-${variantId}.bbmodel`;
        await api.writeFile(modelFile, typeof compiled === "string" ? compiled : JSON.stringify(compiled, null, 2));
        api.Project.saved = true;
        api.Canvas.scene.updateMatrixWorld(true);

        const scene = new THREE.Scene();
        const floorProjection = new THREE.Group();
        floorProjection.scale.z = Math.SQRT2;
        const root = new THREE.Group();
        floorProjection.add(root);
        scene.add(floorProjection);
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        const light = new THREE.DirectionalLight(0xfff4e4, 0.65);
        light.position.set(-90, 160, 130);
        scene.add(ambient, light);
        const disposables = [];
        const posedParts = [];
        for (const { element, color, outline } of model.parts) {
          const geometry = element.mesh.geometry.clone();
          const material = new THREE.MeshToonMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), gradientMap, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.matrix.copy(element.mesh.matrixWorld);
          mesh.matrixAutoUpdate = false;
          root.add(mesh);
          posedParts.push({ element, mesh });
          disposables.push(geometry, material);
          const silhouetteGeometry = geometry.clone();
          const outlineWidth = models[assetId] ? 0.14 : 0.4;
          const positions = silhouetteGeometry.getAttribute("position");
          const normals = silhouetteGeometry.getAttribute("normal");
          for (let index = 0; index < positions.count; index++) {
            positions.setXYZ(index, positions.getX(index) + normals.getX(index) * outlineWidth, positions.getY(index) + normals.getY(index) * outlineWidth, positions.getZ(index) + normals.getZ(index) * outlineWidth);
          }
          const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(model.palette.edge).convertSRGBToLinear(), side: THREE.BackSide });
          const silhouette = new THREE.Mesh(silhouetteGeometry, silhouetteMaterial);
          silhouette.matrix.copy(mesh.matrix);
          silhouette.matrixAutoUpdate = false;
          posedParts.push({ element, mesh: silhouette });
          if (asset.placement.layer !== "ground") root.add(silhouette);
          disposables.push(silhouetteGeometry, silhouetteMaterial);
          if (outline) {
            const edges = new THREE.EdgesGeometry(geometry, 35);
            const ink = new THREE.LineBasicMaterial({ color: model.palette.edge, transparent: true, opacity: 0.48 });
            const lines = new THREE.LineSegments(edges, ink);
            lines.matrix.copy(mesh.matrix);
            lines.matrixAutoUpdate = false;
            root.add(lines);
            posedParts.push({ element, mesh: lines });
            disposables.push(edges, ink);
          }
        }
        const extent = size / pixelsPerUnit / 2;
        const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 1000);
        camera.position.set(0, 156, 120);
        camera.lookAt(0, 36, 0);
        camera.updateMatrixWorld(true);
        const frames = [];
        const frameCount = model.animation?.frames ?? 1;
        if (model.animation) {
          model.animation.clip.select();
          model.animation.clip.playing = true;
        }
        for (let sample = 0; sample < frameCount; sample++) for (const [index, direction] of directions.entries()) {
          if (model.animation) {
            api.Timeline.time = sample * model.animation.frameDuration / 1000;
            api.Animator.preview();
            api.Canvas.scene.updateMatrixWorld(true);
            for (const { element, mesh } of posedParts) mesh.matrix.copy(element.mesh.matrixWorld);
          }
          root.rotation.y = -index * Math.PI / 2;
          renderer.render(scene, camera);
          const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => {
            const point = new THREE.Vector3(x * model.width / 2, 0, z * model.depth / 2).applyMatrix4(root.matrixWorld).project(camera);
            return { x: (point.x + 1) * size / 2, y: (1 - point.y) * size / 2 };
          }));
          const groundFootprint = {
            x: Math.min(...corners.map((point) => point.x)),
            y: Math.min(...corners.map((point) => point.y)),
            width: Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
            height: Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
          };
          const file = `${directory}/${direction}${model.animation ? `-${sample}` : ""}.png`;
          await api.writeFile(file, renderer.domElement.toDataURL("image/png").split(",")[1], "base64");
          frames.push({ path: file, direction, groundFootprint, width: size, height: size });
        }
        rendered.variants[variantId] = {
          model: modelFile,
          parts: model.parts.length,
          footprint: { width: model.width, height: model.depth },
          seatHeight: model.seatHeight,
          seatHasBack: model.seatHasBack,
          surfaceHeight: model.surfaceHeight,
          animation: model.animation && { frames: model.animation.frames, frameDuration: model.animation.frameDuration },
          frames,
        };
        for (const disposable of disposables) disposable.dispose();
        await api.Project.close();
      }
      results.push(rendered);
      console.log(`Rendered ${assetId}: ${variants.length} materials, ${Object.values(rendered.variants)[0].frames.length} frames each`);
    }
    const report = { blockbenchVersion: api.Blockbench.version, projection: "orthographic", elevationDegrees: 45, floorDepthScale: Math.SQRT2, results };
    await api.writeFile(`${output}/renders/manifest.json`, `${JSON.stringify(report, null, 2)}\n`);
    return { blockbenchVersion: report.blockbenchVersion, assets: results.length, frames: results.reduce((sum, result) => sum + Object.values(result.variants).reduce((count, variant) => count + variant.frames.length, 0), 0) };
  } finally {
    gradientMap.dispose();
    renderer.dispose();
  }
}

module.exports = { renderWorldAssets };
