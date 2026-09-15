function createCharacter(api, createGeometry, createHead, appearance) {
  api.newProject(api.Formats.free);
  api.Project.name = "Sakura chibi character";
  const palette = {
    skin: "#f8d6ba", skinLight: "#ffead3", blush: "#eaa0a0", lip: "#97596b", gold: "#e3bb75", ink: "#30283c", hair: "#665078",
    hairDark: "#493851", hairLight: "#a783ae", hairShine: "#d6afd0",
    jacket: "#ce7297", jacketLight: "#efaabe", jacketDark: "#984b78",
    shirt: "#fff0d9", trousers: "#393951", trouserLight: "#62617c",
    sole: "#63536d", shoe: "#fff0dc", teal: "#72d3be", tealDark: "#3d8b94", white: "#fff9ef",
  };
  Object.assign(palette, characterMaterials(appearance));
  const bones = {};
  const geometry = createGeometry(api, bones, palette);
  const { ellipsoid, loft } = geometry;

  function bone(name, origin, parent) {
    const group = new api.Group({ name, origin });
    if (parent) group.addTo(bones[parent]);
    bones[name] = group.init();
  }

  bone("root", [0, 0, 0]);
  bone("pelvis", [0, 28, 0], "root");
  bone("torso", [0, 29, 0], "pelvis");
  bone("head", [0, 46, 0], "torso");
  bone("hair", [0, 70, 0], "head");
  bone("headphones", [0, 62, 0], "head");
  bone("eyes", [0, 59, 9], "head");
  if (appearance.hairstyle === "longbraid") bone("hair_tail", [0, 56, -11], "hair");
  if (appearance.upperBody === "traveler") bone("scarf", [-5, 44, -4], "torso");

  loft("Trousers waist", "pelvis", [[24.5, 0, 0], [25, 7.2, 4.3], [29.5, 7, 4], [29.7, 0, 0]], "trousers");
  loft("Bomber jacket", "torso", [[28, 0, 0], [28.2, 7.4, 4.3], [31, 8.4, 4.8], [38, 8.8, 5.1], [43, 8.2, 4.2], [45, 5.1, 3.2], [45.2, 0, 0]], "jacket");
  loft("Jacket waistband", "torso", [[28.1, 7.5, 4.45], [30, 7.8, 4.55]], "jacketDark");
  if (appearance.upperBody !== "kimono") loft("Ivory shirt", "torso", [[29.6, 0, 0, 0, 5], [30, 3.1, 0.7, 0, 5.05], [39, 3.3, 0.7, 0, 5], [43.5, 2.7, 0.4, 0, 4.3], [44, 0, 0, 0, 4.3]], "shirt");
  ellipsoid("Neck", "torso", [0, 45.6, 0], [2.7, 3.2, 2.5], "skin");

  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const armX = side * 10.1;
    const legX = side * 4;
    bone(`${prefix}_arm`, [armX, 43.5, 0], "torso");
    bone(`${prefix}_forearm`, [side * 10.9, 35.5, 0], `${prefix}_arm`);
    bone(`${prefix}_hand`, [side * 11, 27, 0], `${prefix}_forearm`);
    bone(`${prefix}_thigh`, [legX, 27, 0], "pelvis");
    bone(`${prefix}_shin`, [legX, 15, 0], `${prefix}_thigh`);
    bone(`${prefix}_foot`, [legX, 4.8, 0], `${prefix}_shin`);
    ellipsoid(`${prefix} shoulder`, `${prefix}_arm`, [armX, 42, 0], [3.7, 3.5, 3.5], "jacket");
    loft(`${prefix} upper sleeve`, `${prefix}_arm`, [[34.8, 2.9, 2.9, side * 10.9], [38, 3.4, 3.5, side * 10.6], [42.5, 3.5, 3.4, armX], [44, 0, 0, armX]], "jacket");
    ellipsoid(`${prefix} elbow`, `${prefix}_forearm`, [side * 10.9, 35.5, 0], [2.9, 2.8, 2.9], "jacket");
    loft(`${prefix} lower sleeve`, `${prefix}_forearm`, [[28, 2.4, 2.4, side * 11], [30, 2.9, 2.9, side * 11.1], [35.5, 2.95, 2.9, side * 10.9]], "jacket");
    loft(`${prefix} cuff`, `${prefix}_forearm`, [[27.2, 2.4, 2.5, side * 11], [29.6, 2.65, 2.65, side * 11]], "jacketLight");
    ellipsoid(`${prefix} hand`, `${prefix}_hand`, [side * 11, 25.5, 0.3], [1.95, 2.3, 1.85], "skin");
    loft(`${prefix} trouser thigh`, `${prefix}_thigh`, [[14.5, 2.6, 2.7, legX], [20, 3.2, 3.3, legX], [27.1, 3.5, 3.8, legX]], "trousers");
    ellipsoid(`${prefix} knee`, `${prefix}_shin`, [legX, 15, 0], [2.6, 2.6, 2.7], "trousers");
    loft(`${prefix} trouser shin`, `${prefix}_shin`, [[4.4, 2.1, 2.15, legX], [9, 2.2, 2.3, legX], [15, 2.6, 2.7, legX]], "trousers");
    ellipsoid(`${prefix} trouser highlight`, `${prefix}_thigh`, [legX - 0.7, 21, 3.15], [0.65, 3.9, 0.25], "trouserLight", false);
    ellipsoid(`${prefix} sneaker sole`, `${prefix}_foot`, [legX, 1.1, 1.4], [2.9, 1, 4.5], "sole");
    if (appearance.shoes === "festival") {
      ellipsoid(`${prefix} tabi foot`, `${prefix}_foot`, [legX, 2.5, 1], [2.5, 1.5, 3.8], "shirt");
      loft(`${prefix} tabi sock`, `${prefix}_foot`, [[3, 2.1, 2.1, legX], [6.5, 2.1, 2.1, legX]], "shirt");
      ellipsoid(`${prefix} sandal strap`, `${prefix}_foot`, [legX, 3.6, 2.7], [2.6, 0.6, 0.9], "shoe");
    } else {
      ellipsoid(`${prefix} sneaker`, `${prefix}_foot`, [legX, 2.4, 1.3], [2.85, 1.8, 4.3], "shoe");
      ellipsoid(`${prefix} sneaker tongue`, `${prefix}_foot`, [legX, 4, 0.9], [2, 1.4, 2], "jacketLight");
      ellipsoid(`${prefix} shoelace`, `${prefix}_foot`, [legX, 3.8, 2.5], [1.8, 0.35, 0.35], "white", false);
    }
  }
  createHead(api, geometry, appearance);
  createCharacterClothing(geometry, appearance);
  createCharacterWardrobe(geometry, appearance);
  customizeCharacter(geometry, appearance);
  createCharacterHair(api, geometry, appearance);
  createCharacterHeadwear(api, geometry, appearance);
  api.Canvas.updateAll();
  return { bones, parts: geometry.parts, palette };
}

module.exports = { createCharacter };
