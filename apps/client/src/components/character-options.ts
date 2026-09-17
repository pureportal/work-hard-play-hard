import { CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS, type CharacterAppearance } from "@workhard/shared";

const faces = {
  calm: "Calm", bright: "Bright", fierce: "Fierce", dreamy: "Dreamy", smile: "Wink", shy: "Shy",
  freckles: "Freckles", doe: "Doe eyes", catliner: "Cat liner", rosy: "Rosy", gloss: "Gloss",
  square: "Strong jaw", stubble: "Stubble", moustache: "Moustache", goatee: "Goatee", grin: "Grin",
  starry: "Star eyes", lightning: "Lightning paint", mime: "Mime", smoky: "Smoky eyes", smolder: "Smolder", playful: "Playful wink",
} satisfies Record<CharacterAppearance["face"], string>;

const hair = {
  bob: "Rose bob", spiky: "Midnight spikes", ponytail: "Lavender ponytail", twintails: "Pink twintails", wavy: "Honey waves", braid: "Mint braid",
  pixie: "Ash pixie", curtains: "Chestnut curtains", hime: "Ink hime cut", tousled: "Silver tousle", buns: "Peach buns", swept: "Copper side sweep", curls: "Cocoa curls", longbraid: "Pearl braid",
  buzz: "Walnut buzz cut", fade: "Midnight fade", quiff: "Chestnut quiff", pompadour: "Auburn pompadour", mohawk: "Teal mohawk", locs: "Ebony locs", topknot: "Ink topknot",
  afropuff: "Cocoa puff", sidepony: "Cherry side pony", waterfall: "Golden waterfall", flame: "Flame crest", nebula: "Nebula puffs", tentacles: "Tentacle locks",
  hollywood: "Hollywood waves", slickback: "Midnight slickback", wetlook: "Silver wet look",
} satisfies Record<CharacterAppearance["hairstyle"], string>;

const outfits = {
  street: ["Bomber jacket", "Denim trousers", "Sneakers"],
  ranger: ["Ranger jacket", "Ranger breeches", "Leather boots"],
  arcane: ["Moon armor", "Moon breeches", "Moon boots"],
  sailor: ["Sailor blouse", "Sailor trousers", "Navy shoes"],
  cardigan: ["Honey cardigan", "Plum trousers", "Honey shoes"],
  kimono: ["Lilac kimono", "Petal hakama", "Rose shoes"],
  traveler: ["Traveler jacket", "Travel breeches", "Travel boots"],
  festival: ["Festival haori", "Indigo hakama", "Tabi sandals"],
  cyber: ["Neon runner", "Circuit cargos", "Neon high-tops"],
  pirate: ["Corsair coat", "Corsair trousers", "Corsair boots"],
  astronaut: ["Orbital suit", "Orbital trousers", "Moonwalk boots"],
  dragon: ["Dragon armor", "Dragon greaves", "Dragon claws"],
  jester: ["Harlequin tunic", "Harlequin trousers", "Jester slippers"],
  frog: ["Froggy hoodie", "Lily-pad shorts", "Frog slippers"],
  biker: ["Biker vest", "Ripped black jeans", "Studded boots"],
  velvet: ["Velvet corset", "Velvet slit skirt", "Velvet heels"],
  starlight: ["Starlight halter", "Starlight mini", "Silver platforms"],
  sunset: ["Sunset crop top", "Sunset shorts", "Sunset sandals"],
  jellyfish: ["Jellyfish cape", "Jellyfish skirt", "Jelly slippers"],
  phoenix: ["Phoenix wings", "Phoenix feather skirt", "Phoenix boots"],
  disco: ["Mirrorball jacket", "Disco flares", "Mirror platforms"],
  lace: ["Lace bustier", "Lace slit skirt", "Lace-up heels"],
  satin: ["Satin open collar", "Satin trousers", "Patent loafers"],
  harness: ["Harness tank", "Belted leather shorts", "Buckle sandals"],
} satisfies Record<CharacterAppearance["upperBody"], [string, string, string]>;

const headwear = {
  none: "None", cap: "Star cap", witch: "Moon hat", beret: "Beret", ribbon: "Ribbon", catears: "Cat ears", blossom: "Blossom clip", goggles: "Goggles",
  beanie: "Ribbed beanie", fedora: "Fedora", tricorn: "Tricorn", flatcap: "Tweed cap", bandana: "Bandana", tiara: "Crystal tiara", sunhat: "Straw sunhat", roseband: "Rose crown", pearlcomb: "Pearl comb", halo: "Halo",
  ufo: "Flying saucer", antlers: "Crystal antlers", octopus: "Octopus hat", fascinator: "Veiled fascinator", leathercap: "Leather cap", masquerade: "Masquerade mask",
} satisfies Record<CharacterAppearance["headwear"], string>;

export const characterCategories = [
  { id: "face", label: "Face", crop: "face", options: CHARACTER_FACES.map(value => ({ value, label: faces[value] })) },
  { id: "hairstyle", label: "Hair", crop: "hair", options: CHARACTER_HAIRSTYLES.map(value => ({ value, label: hair[value] })) },
  { id: "upperBody", label: "Tops", crop: "upper", options: CHARACTER_OUTFITS.map(value => ({ value, label: outfits[value][0] })) },
  { id: "lowerBody", label: "Bottoms", crop: "lower", options: CHARACTER_OUTFITS.map(value => ({ value, label: outfits[value][1] })) },
  { id: "shoes", label: "Shoes", crop: "shoes", options: CHARACTER_OUTFITS.map(value => ({ value, label: outfits[value][2] })) },
  { id: "headwear", label: "Headwear", crop: "headwear", options: CHARACTER_HEADWEAR.map(value => ({ value, label: headwear[value] })) },
] as const;
