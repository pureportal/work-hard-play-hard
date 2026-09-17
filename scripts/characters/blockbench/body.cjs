function createCharacterBody(geometry, appearance) {
  const { ellipsoid, loft } = geometry;
  const top = appearance.upperBody;
  const bareTorso = ["velvet", "starlight", "sunset", "lace", "harness"].includes(top);
  const bareArms = bareTorso || top === "biker";
  const bareLegs = ["frog", "velvet", "starlight", "sunset", "jellyfish", "phoenix", "lace", "harness"].includes(appearance.lowerBody);
  const torsoMaterial = bareTorso ? "skin" : "jacket";
  const armMaterial = bareArms ? "skin" : "jacket";
  const legMaterial = bareLegs ? "skin" : "trousers";

  loft("Trousers waist", "pelvis", [[24.5, 0, 0], [25, 7.2, 4.3], [29.5, 7, 4], [29.7, 0, 0]], "trousers");
  loft("Torso", "torso", bareTorso
    ? [[28, 0, 0], [28.2, 7.1, 4.1], [32, 6.6, 4], [38, 7.7, 4.6], [43, 7.4, 4], [45, 4.7, 3], [45.2, 0, 0]]
    : [[28, 0, 0], [28.2, 7.4, 4.3], [31, 8.4, 4.8], [38, 8.8, 5.1], [43, 8.2, 4.2], [45, 5.1, 3.2], [45.2, 0, 0]], torsoMaterial);
  if (!bareTorso) loft("Jacket waistband", "torso", [[28.1, 7.5, 4.45], [30, 7.8, 4.55]], "jacketDark");
  if (["street", "ranger", "arcane", "sailor", "cardigan", "traveler", "festival"].includes(top)) {
    loft("Ivory shirt", "torso", [[29.6, 0, 0, 0, 5], [30, 3.1, 0.7, 0, 5.05], [39, 3.3, 0.7, 0, 5], [43.5, 2.7, 0.4, 0, 4.3], [44, 0, 0, 0, 4.3]], "shirt");
  }
  ellipsoid("Neck", "torso", [0, 45.6, 0], [2.7, 3.2, 2.5], "skin");

  for (const side of [-1, 1]) {
    const prefix = side < 0 ? "left" : "right";
    const armX = side * 10.1;
    const legX = side * 4;
    ellipsoid(`${prefix} shoulder`, `${prefix}_arm`, [armX, 42, 0], bareArms ? [2.65, 2.8, 2.65] : [3.7, 3.5, 3.5], armMaterial);
    loft(`${prefix} upper arm`, `${prefix}_arm`, bareArms
      ? [[34.8, 2.1, 2.15, side * 10.9], [38, 2.4, 2.4, side * 10.6], [42.5, 2.6, 2.6, armX], [44, 0, 0, armX]]
      : [[34.8, 2.9, 2.9, side * 10.9], [38, 3.4, 3.5, side * 10.6], [42.5, 3.5, 3.4, armX], [44, 0, 0, armX]], armMaterial);
    ellipsoid(`${prefix} elbow`, `${prefix}_forearm`, [side * 10.9, 35.5, 0], bareArms ? [2.1, 2.1, 2.15] : [2.9, 2.8, 2.9], armMaterial);
    loft(`${prefix} forearm`, `${prefix}_forearm`, bareArms
      ? [[27.5, 1.65, 1.8, side * 11], [30, 1.95, 2, side * 11.1], [35.5, 2.1, 2.15, side * 10.9]]
      : [[28, 2.4, 2.4, side * 11], [30, 2.9, 2.9, side * 11.1], [35.5, 2.95, 2.9, side * 10.9]], armMaterial);
    if (!bareArms) loft(`${prefix} cuff`, `${prefix}_forearm`, [[27.2, 2.4, 2.5, side * 11], [29.6, 2.65, 2.65, side * 11]], "jacketLight");
    ellipsoid(`${prefix} hand`, `${prefix}_hand`, [side * 11, 25.5, 0.3], [1.95, 2.3, 1.85], "skin");
    loft(`${prefix} thigh`, `${prefix}_thigh`, [[14.5, 2.6, 2.7, legX], [20, 3.2, 3.3, legX], [27.1, 3.5, 3.8, legX]], appearance.lowerBody === "jester" && side > 0 ? "trouserLight" : legMaterial);
    ellipsoid(`${prefix} knee`, `${prefix}_shin`, [legX, 15, 0], [2.6, 2.6, 2.7], legMaterial);
    loft(`${prefix} shin`, `${prefix}_shin`, [[4.4, 2.1, 2.15, legX], [9, 2.2, 2.3, legX], [15, 2.6, 2.7, legX]], appearance.lowerBody === "jester" && side > 0 ? "trouserLight" : legMaterial);
    if (!bareLegs) ellipsoid(`${prefix} trouser highlight`, `${prefix}_thigh`, [legX - 0.7, 21, 3.15], [0.65, 3.9, 0.25], "trouserLight", false);
  }
}

module.exports = { createCharacterBody };
