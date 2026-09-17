const faceStyles = {
  calm: { height: 1.05, tilt: 0, brow: 0.15 },
  bright: { height: 1.2, tilt: 0, brow: 0.15, smile: true },
  fierce: { height: 1.05, tilt: 0.12, brow: 0.7 },
  dreamy: { height: 0.65, tilt: 0, brow: 0.15 },
  smile: { height: 1.05, tilt: 0, brow: 0.15, smile: true, wink: true },
  shy: { height: 1.05, tilt: 0, brow: -0.55, blush: 2.25 },
  freckles: { height: 1.12, tilt: 0, brow: -0.1, smile: true },
  doe: { height: 1.3, tilt: -0.05, brow: -0.3, lashes: true, blush: 1.9 },
  catliner: { height: 0.8, tilt: 0.2, brow: 0.65, lashes: true, lipstick: true },
  rosy: { height: 1, tilt: -0.07, brow: -0.4, blush: 2.6, lashes: true, smile: true },
  gloss: { height: 0.95, tilt: 0.05, brow: 0.4, lipstick: true, lashes: true },
  square: { height: 0.82, tilt: 0.06, brow: 0.5, heavyBrow: true, jaw: true },
  stubble: { height: 0.9, tilt: 0.04, brow: 0.3, heavyBrow: true, jaw: true },
  moustache: { height: 1, tilt: 0, brow: 0.2, heavyBrow: true, smile: true },
  goatee: { height: 0.83, tilt: 0.1, brow: 0.7, heavyBrow: true, jaw: true },
  grin: { height: 0.65, tilt: 0, brow: -0.25, smile: true },
  starry: { height: 1.3, tilt: 0, brow: -0.25, smile: true },
  lightning: { height: 0.9, tilt: 0.15, brow: 0.7 },
  mime: { height: 1.15, tilt: 0, brow: -0.6, lipstick: true },
  smoky: { height: 0.65, tilt: 0.18, brow: 0.65, lashes: true, lipstick: true },
  smolder: { height: 0.8, tilt: 0.05, brow: 0.8, heavyBrow: true, jaw: true },
  playful: { height: 0.8, tilt: 0.07, brow: 0.45, wink: true, smile: true },
};

function createFaceDetails({ patch, ellipsoid }, appearance, profile) {
  const style = appearance.face;
  if (profile.lipstick) {
    patch("Cupid lip", "head", [[-1.8, 51.7, 8], [-0.7, 52.25, 8.1], [0, 51.95, 8.13], [0.7, 52.25, 8.1], [1.8, 51.7, 8], [0.8, 50.9, 7.8], [-0.8, 50.9, 7.8]], "lip");
    patch("Lip gloss", "head", [[-0.8, 51.2, 7.94], [0.6, 51.2, 7.94], [0.3, 51.5, 8.06], [-0.6, 51.5, 8.06]], "skinLight");
  }
  if (style === "grin") {
    patch("Wide grin", "head", [[-2.8, 52.5, 8.2], [2.8, 52.5, 8.2], [2, 50.3, 7.5], [-2, 50.3, 7.5]], "lip");
    patch("Grin teeth", "head", [[-2.4, 52.3, 8.33], [2.4, 52.3, 8.33], [1.8, 51.4, 8.01], [-1.8, 51.4, 8.01]], "white");
  }
  for (const side of [-1, 1]) {
    if (profile.lashes) patch("Winged liner", "eyes", [[side * 7.5, 60.4, 9.9], [side * 11.3, 61.7, 9.3], [side * 9, 59.2, 9.6]], "ink");
    if (style === "smoky") patch("Smoky shadow", "head", [[side * 3, 61.6, 10.05], [side * 5, 63, 9.85], [side * 8.5, 62.6, 9.5], [side * 10, 60.8, 9.15], [side * 7.5, 61.2, 9.65]], "eyeShadow");
    if (style === "freckles") for (const [x, y] of [[7.4, 55.1], [9.6, 55.5], [10.5, 53.7], [8.2, 53.3]]) ellipsoid("Freckle", "head", [side * x, y, 8.55 - (x - 7) * 0.1], [0.5, 0.48, 0.2], "freckle", false);
    if (["stubble", "smolder"].includes(style)) for (const [x, y, z] of [[3.4, 49.7, 4.9], [5.4, 50.5, 5.4], [7.4, 51.5, 5.9], [9, 52.6, 6.1]]) patch("Jaw stubble", "head", [[side * x, y, z], [side * (x + 0.5), y + 1.2, z + 0.65], [side * (x + 0.95), y + 1, z + 0.6], [side * (x + 0.45), y - 0.1, z]], "facialHair");
    if (style === "moustache") patch("Curled moustache", "head", [[0, 53, 8.8], [side * 1.5, 53.7, 8.7], [side * 3.2, 53, 8.45], [side * 4.2, 53.8, 8.1], [side * 3.6, 51.9, 8.1], [side * 1.5, 52, 8.6]], "facialHair");
    if (style === "mime") patch("Mime tear", "head", [[side * 6, 55.3, 9.1], [side * 7.2, 53.6, 8.45], [side * 6, 52.8, 8.5], [side * 4.9, 53.6, 8.7]], "ink");
    if (style === "starry") {
      const points = Array.from({ length: 10 }, (_, index) => {
        const angle = Math.PI / 2 + index * Math.PI / 5;
        const radius = index % 2 ? 1 : 2.2;
        return [side * 6 + Math.cos(angle) * radius, 58.6 + Math.sin(angle) * radius, 10.25];
      });
      patch("Star pupil", "eyes", points, "gold");
    }
  }
  if (style === "goatee") patch("Pointed goatee", "head", [[-2.5, 50.8, 7.5], [0, 50.1, 7.45], [2.5, 50.8, 7.5], [2, 48.9, 4.8], [0, 48, 3.7], [-2, 48.9, 4.8]], "facialHair");
  if (style === "lightning") patch("Lightning face paint", "head", [[9.3, 64, 8.7], [4.3, 59.8, 10.45], [7.5, 59.5, 10.35], [4.9, 53, 9], [11, 59, 9.3], [7.8, 59.4, 10.35]], "electric");
  if (style === "playful") ellipsoid("Beauty mark", "head", [-4.1, 52.4, 7.9], [0.45, 0.45, 0.2], "ink", false);
}

module.exports = { faceStyles, createFaceDetails };
