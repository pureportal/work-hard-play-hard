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
  }
  createCharacterBody(geometry, appearance);
  createCharacterFootwear(geometry, appearance);
  createHead(api, geometry, appearance);
  createCharacterClothing(geometry, appearance);
  createCharacterWardrobe(geometry, appearance);
  statementTops[appearance.upperBody]?.(geometry);
  runwayTops[appearance.upperBody]?.(geometry);
  createStatementBottoms(geometry, appearance);
  createRunwayBottoms(geometry, appearance);
  customizeCharacter(geometry, appearance);
  const firstHairPart = geometry.parts.length;
  createCharacterHair(api, geometry, appearance);
  fitHairToHeadwear(geometry, firstHairPart, appearance.headwear);
  createCharacterHeadwear(api, geometry, appearance);
  api.Canvas.updateAll();
  return { bones, parts: geometry.parts, palette };
}

module.exports = { createCharacter };
