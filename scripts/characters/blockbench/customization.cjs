const outfitMaterials = {
  street: ["#bd6985", "#edb0b4", "#76435f", "#393d55", "#747f97", "#f3e4cf"],
  ranger: ["#76947a", "#bfd0a1", "#415d52", "#645247", "#a89878", "#7c5747"],
  arcane: ["#606f9d", "#c3cee4", "#363f69", "#42415f", "#8a8cae", "#adb7cf"],
  sailor: ["#eee1cb", "#fff4dc", "#3b547b", "#3d557d", "#8ba5c8", "#464e70"],
  cardigan: ["#cd9b61", "#f0d19a", "#95654e", "#624a61", "#a78c9f", "#ddbf8f"],
  kimono: ["#7e88b6", "#c8cde9", "#414d80", "#93728e", "#c8a4be", "#8a526d"],
  traveler: ["#4f8185", "#a0cbc1", "#30525f", "#504b5e", "#9991a3", "#805b48"],
  festival: ["#c47668", "#f4c6a4", "#693e53", "#444e75", "#99a7cd", "#9a7452"],
  cyber: ["#303852", "#60eadc", "#191d35", "#292d49", "#50daca", "#6e5aa0"],
  pirate: ["#913e57", "#e8b56e", "#4d293e", "#534452", "#aa8b8a", "#583938"],
  astronaut: ["#e4d8c5", "#f8efdb", "#c57246", "#c2c6c9", "#edf0e7", "#e2d7c5"],
  dragon: ["#388779", "#9acdad", "#22514d", "#386465", "#79a99a", "#41786b"],
  jester: ["#8a5295", "#f2c164", "#4e326c", "#8c4d82", "#ebbc67", "#954e87"],
  frog: ["#7eaf6c", "#d7e4a2", "#497959", "#648d66", "#b5d299", "#8abc72"],
  biker: ["#3e3549", "#9792a5", "#241f32", "#363442", "#757184", "#3c344a"],
  velvet: ["#9a365b", "#e27b94", "#522139", "#7a2e50", "#c75e80", "#922e53"],
  starlight: ["#929acb", "#e4e7ff", "#555d95", "#747fae", "#d0dcf4", "#b3bad9"],
  sunset: ["#ed946e", "#fff0bf", "#bd5d59", "#709cab", "#b5d6da", "#d59463"],
};

function characterMaterials(appearance) {
  const top = outfitMaterials[appearance.upperBody];
  const bottom = outfitMaterials[appearance.lowerBody];
  const shoes = outfitMaterials[appearance.shoes];
  const hair = {
    bob: ["#785567", "#493442", "#af7b8f", "#e5acb8"],
    spiky: ["#35455f", "#252a40", "#627b94", "#a1b9c9"],
    ponytail: ["#8b7aa9", "#51466c", "#b7a1cb", "#e4cce8"],
    twintails: ["#b66f8a", "#79435f", "#dfa0b2", "#f8d0d9"],
    wavy: ["#ac8350", "#6b4c39", "#d6b073", "#f7dca1"],
    braid: ["#608681", "#39585d", "#95bbae", "#cde3c9"],
    pixie: ["#757d83", "#454654", "#aab5b7", "#dee2d4"],
    curtains: ["#78533d", "#432e2e", "#b58358", "#e9bc82"],
    hime: ["#35364e", "#242132", "#686080", "#a69ab9"],
    tousled: ["#bec6d1", "#6c748d", "#e6e7e6", "#fff4dc"],
    buns: ["#cd927d", "#86575b", "#f0c2a3", "#ffe0b9"],
    swept: ["#a3573e", "#613539", "#d38c5c", "#edba7e"],
    curls: ["#654540", "#382b37", "#a77b65", "#e1b691"],
    longbraid: ["#c2b4c9", "#8e7b99", "#e7dce9", "#fff1df"],
  }[appearance.hairstyle];
  return {
    jacket: top[0], jacketLight: top[1], jacketDark: top[2], trousers: bottom[3], trouserLight: bottom[4], shoe: shoes[5],
    shoeTrim: shoes[1], shoeDark: shoes[2],
    hair: hair[0], hairDark: hair[1], hairLight: hair[2], hairShine: hair[3],
    leather: "#614349", ribbon: "#ab526b",
    teal: appearance.face === "shy" ? "#c49bcf" : appearance.face === "fierce" ? "#d9a05b" : "#7bc9b7",
    tealDark: appearance.face === "shy" ? "#725181" : appearance.face === "fierce" ? "#80502e" : "#386e7f",
  };
}

function customizeCharacter(geometry, appearance) {
  for (const { element, layer } of geometry.parts) {
    for (const vertex of Object.values(element.vertices)) {
      if (layer === "upper" && vertex[1] > 30 && vertex[1] < 43 && vertex[2] > 0) vertex[2] += 0.35 * Math.sin((vertex[1] - 30) / 13 * Math.PI);
      if (layer === "lower" && ["sailor", "kimono", "festival"].includes(appearance.lowerBody) && element.parent.name !== "pelvis") {
        const center = Math.sign(vertex[0]) * 4;
        vertex[0] = center + (vertex[0] - center) * (appearance.lowerBody === "sailor" ? 1.12 : 1.25);
      }
      if (layer === "shoes" && element.name.endsWith("sneaker")) vertex[0] = Math.sign(vertex[0]) * 4 + (vertex[0] - Math.sign(vertex[0]) * 4) * 1.08;
    }
  }
}

module.exports = { characterMaterials, customizeCharacter };
