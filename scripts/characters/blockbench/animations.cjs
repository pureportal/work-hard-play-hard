const characterClips = {
  idle: { length: 1.6, frames: 4, frameDuration: 400, anchor: "foot" },
  walk: { length: 0.8, frames: 8, frameDuration: 100, anchor: "foot" },
  sit: { length: 1.6, frames: 4, frameDuration: 400, anchor: "hip" },
  listen: { length: 1.6, frames: 8, frameDuration: 200, anchor: "foot" },
  "sit-listen": { length: 1.6, frames: 8, frameDuration: 200, anchor: "hip" },
};

function createCharacterAnimations(api, model, seatedPose = "chair") {
  const { bones } = model;
  const animations = {};
  function track(animation, name, channel, samples) {
    const animator = animation.getBoneAnimator(bones[name]);
    for (const [time, values] of samples) {
      animator.addKeyframe({
        channel, time, interpolation: "linear",
        data_points: [{ x: values[0], y: values[1], z: values[2] }],
      });
    }
  }
  function cycle(animation, name, channel, values) {
    track(animation, name, channel, [...values, values[0]].map((value, index) => [animation.length * index / values.length, value]));
  }
  for (const [name, clip] of Object.entries(characterClips)) {
    const animation = new api.Animation({ name, length: clip.length, loop: "loop", snapping: 20 }).add();
    animations[name] = animation;
    if (bones.scarf) {
      const sway = name === "walk" ? 12 : name.includes("listen") ? 9 : 4;
      cycle(animation, "scarf", "rotation", [[0, -sway, -3], [sway / 2, 0, 0], [0, sway, 3], [-sway / 2, 0, 0]]);
    }
    if (bones.hair_tail) {
      const sway = name === "walk" ? 7 : name.includes("listen") ? 5 : 2;
      cycle(animation, "hair_tail", "rotation", [[-2, 0, -sway], [2, 0, 0], [-2, 0, sway], [2, 0, 0]]);
    }
    track(animation, "headphones", "scale", [[0, name.includes("listen") ? [1, 1, 1] : [0, 0, 0]]]);
    if (name === "walk") {
      cycle(animation, "pelvis", "position", [[0, 0, 0], [0, 1.4, 0], [0, 0, 0], [0, 1.4, 0]]);
      cycle(animation, "torso", "rotation", [[0, -4, 0], [0, 0, 1], [0, 4, 0], [0, 0, -1]]);
      cycle(animation, "head", "rotation", [[0, 2, 0], [1, 0, 0], [0, -2, 0], [1, 0, 0]]);
      for (const [side, phase] of [["left", 0], ["right", 2]]) {
        const shifted = (values) => values.map((_, index) => values[(index + phase) % values.length]);
        cycle(animation, `${side}_thigh`, "rotation", shifted([[-24, 0, 0], [0, 0, 0], [24, 0, 0], [0, 0, 0]]));
        cycle(animation, `${side}_shin`, "rotation", shifted([[8, 0, 0], [4, 0, 0], [12, 0, 0], [42, 0, 0]]));
        cycle(animation, `${side}_foot`, "rotation", shifted([[12, 0, 0], [-4, 0, 0], [-15, 0, 0], [-12, 0, 0]]));
        cycle(animation, `${side}_arm`, "rotation", shifted([[18, 0, side === "left" ? -3 : 3], [0, 0, 0], [-18, 0, 0], [0, 0, 0]]));
        cycle(animation, `${side}_forearm`, "rotation", shifted([[-12, 0, 0], [-9, 0, 0], [-18, 0, 0], [-12, 0, 0]]));
      }
      cycle(animation, "hair", "rotation", [[-1, 0, -1], [1, 0, 0], [-1, 0, 1], [1, 0, 0]]);
    } else if (name === "sit" || name === "sit-listen") {
      track(animation, "root", "position", [[0, [0, -12, 0]]]);
      for (const side of ["left", "right"]) {
        track(animation, `${side}_thigh`, "rotation", [[0, [seatedPose === "floor" ? -85 : -90, side === "left" ? -12 : 12, 0]]]);
        track(animation, `${side}_shin`, "rotation", [[0, [seatedPose === "floor" ? 40 : 90, 0, 0]]]);
        if (seatedPose === "floor") track(animation, `${side}_foot`, "rotation", [[0, [45, 0, 0]]]);
        track(animation, `${side}_arm`, "rotation", [[0, [-14, 0, side === "left" ? 8 : -8]]]);
        track(animation, `${side}_forearm`, "rotation", [[0, [-62, 0, 0]]]);
      }
      cycle(animation, "torso", "rotation", [[2, 0, 0], [3, 0, 0], [2, 0, 0], [1, 0, 0]]);
      cycle(animation, "head", "rotation", name === "sit-listen" ? [[-6, -4, -4], [5, 0, 0], [-6, 4, 4], [5, 0, 0]] : [[-2, 0, 0], [-1, 1, 0], [-2, 0, 0], [-3, -1, 0]]);
    } else if (name === "listen") {
      cycle(animation, "pelvis", "rotation", [[0, 0, -2], [0, 0, 0], [0, 0, 2], [0, 0, 0]]);
      cycle(animation, "torso", "rotation", [[0, -3, -2], [2, 0, 0], [0, 3, 2], [2, 0, 0]]);
      cycle(animation, "head", "rotation", [[-6, -5, -5], [7, 0, -2], [-6, 5, 5], [7, 0, 2]]);
      cycle(animation, "hair", "rotation", [[3, 1, 2], [-3, 0, 0], [3, -1, -2], [-3, 0, 0]]);
      track(animation, "right_arm", "rotation", [[0, [0, 0, 140]]]);
      track(animation, "right_forearm", "rotation", [[0, [0, 0, 45]]]);
      track(animation, "right_hand", "rotation", [[0, [0, 0, -8]]]);
      cycle(animation, "left_arm", "rotation", [[8, 0, -6], [0, 0, -8], [-8, 0, -6], [0, 0, -4]]);
      cycle(animation, "left_forearm", "rotation", [[-12, 0, 0], [-16, 0, 0], [-12, 0, 0], [-8, 0, 0]]);
    } else {
      cycle(animation, "torso", "position", [[0, 0, 0], [0, 0.92, 0], [0, 0, 0], [0, -0.92, 0]]);
    }
  }
  const walking = animations.walk;
  for (const animation of Object.values(animations)) animation.playing = false;
  walking.select();
  walking.playing = true;
  const groundOffsets = [];
  const soles = model.parts.filter(({ element }) => element.name.endsWith("sneaker sole"));
  for (let frame = 0; frame < characterClips.walk.frames; frame++) {
    const time = frame * characterClips.walk.frameDuration / 1000;
    api.Timeline.time = time;
    api.Animator.preview();
    api.Canvas.scene.updateMatrixWorld(true);
    let bottom = Infinity;
    for (const { element } of soles) {
      const positions = element.mesh.geometry.getAttribute("position");
      for (let index = 0; index < positions.count; index++) {
        const point = new api.THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(element.mesh.matrixWorld);
        bottom = Math.min(bottom, point.y);
      }
    }
    groundOffsets.push([time, [0, -bottom, 0]]);
  }
  groundOffsets.push([walking.length, groundOffsets[0][1]]);
  track(walking, "root", "position", groundOffsets);
  for (const animation of Object.values(animations)) animation.playing = false;
  animations.idle.select();
  api.Timeline.time = 0;
  api.Animator.preview();
  api.Canvas.updateAll();
  return animations;
}

module.exports = { characterClips, createCharacterAnimations };
