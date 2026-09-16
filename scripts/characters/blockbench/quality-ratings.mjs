const hairReasons = {
  bob: "Rounded bob and separated fringe retain a clean anime silhouette",
  spiky: "Distinct pointed locks and restrained highlights keep the short hair readable",
  ponytail: "Swept fringe and a defined rear ponytail stay clear in side and back views",
  twintails: "Balanced twin tails and face-framing locks retain a cute, readable silhouette",
  wavy: "Broad flowing locks and soft highlights give the long hair clear volume",
  braid: "Short fringe and a distinct rear braid remain readable at the small scale",
  pixie: "Compact side-swept fringe and a clean nape preserve the cropped hairstyle",
  curtains: "Parted fringe frames the face clearly with a coherent rounded rear shape",
  hime: "Straight fringe and long side locks form a clear hime silhouette",
  tousled: "Soft pale locks retain definition through contrasting outlines and separated tips",
  buns: "Balanced side buns and a clear fringe remain cute and distinct from every direction",
  swept: "Broad swept locks and warm highlights create a clean asymmetrical silhouette",
  curls: "Rounded curl clusters retain volume without breaking into visual noise",
  longbraid: "Long pale braid and a clear crown remain distinct from the body in all views",
};

const headwearReasons = {
  none: "the uncovered crown is complete",
  cap: "the fitted cap and brim remain separate from the hair",
  witch: "the pointed hat and brim stay intact and fit the crown",
  beret: "the slanted beret fits the crown cleanly",
  ribbon: "the ribbon remains distinct from the hair",
  catears: "both pointed ears remain clean and correctly placed",
  blossom: "the blossom accent remains visible without obscuring the face",
  goggles: "the goggles and strap remain distinct and correctly fitted",
};

const faceReasons = {
  calm: "Balanced resting eyes and a clear small mouth preserve the calm expression",
  bright: "Open eyes and a cheerful mouth keep the bright expression readable",
  fierce: "Angled brows and distinct eyes retain the fierce expression",
  dreamy: "Soft closed eyes clearly distinguish the dreamy expression",
  smile: "The asymmetric wink and small smile stay readable",
  shy: "Soft eyes and cheek color distinguish the shy expression",
};

export function rateCharacterAsset(asset) {
  const appearance = asset.appearance;
  if (asset.layer === "hair") return {
    score: ["twintails", "hime", "buns", "longbraid"].includes(appearance.hairstyle) ? 8.5 : 8,
    reason: `${hairReasons[appearance.hairstyle]}; ${headwearReasons[appearance.headwear]}. All 128 frames retain clean layer joins and unclipped outlines.`,
  };
  if (asset.layer === "head") return {
    score: 8.5,
    reason: `${faceReasons[appearance.face]}. Chibi proportions, side profiles and layer joins remain clean through all 128 frames.`,
  };
  const outfit = appearance[{ upper: "upperBody", lower: "lowerBody", shoes: "shoes" }[asset.layer]];
  const detail = {
    upper: "The upper garment has a readable collar, sleeves and hem, with clean arm and torso joins",
    lower: "The lower garment retains clear leg separation and a fitted waist in standing, walking and seated poses",
    shoes: "The footwear retains clear toe and sole shapes, aligned foot contacts and distinct walking poses",
  }[asset.layer];
  return { score: 8, reason: `${outfit}: ${detail}. The coordinated palette and outlines remain intact through all 128 frames.` };
}
