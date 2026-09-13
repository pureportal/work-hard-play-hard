export const CHARACTER_GENDERS = ["female", "male"] as const;
export const CHARACTER_BREAST_SIZES = ["none", "flat", "medium", "big"] as const;
export const CHARACTER_FACES = ["calm", "bright", "fierce"] as const;
export const CHARACTER_HAIRSTYLES = ["bob", "spiky", "ponytail"] as const;
export const CHARACTER_OUTFITS = ["street", "ranger", "arcane"] as const;
export const CHARACTER_HEADWEAR = ["none", "cap", "witch"] as const;

export interface CharacterAppearance {
  gender: typeof CHARACTER_GENDERS[number];
  breastSize: typeof CHARACTER_BREAST_SIZES[number];
  face: typeof CHARACTER_FACES[number];
  hairstyle: typeof CHARACTER_HAIRSTYLES[number];
  upperBody: typeof CHARACTER_OUTFITS[number];
  lowerBody: typeof CHARACTER_OUTFITS[number];
  shoes: typeof CHARACTER_OUTFITS[number];
  headwear: typeof CHARACTER_HEADWEAR[number];
}

export const DEFAULT_CHARACTER_APPEARANCE: Readonly<CharacterAppearance> = {
  gender: "female",
  breastSize: "medium",
  face: "calm",
  hairstyle: "bob",
  upperBody: "street",
  lowerBody: "street",
  shoes: "street",
  headwear: "none",
};

export const CHARACTER_CANVAS_SIZE = 180;
export const CHARACTER_PORTRAIT_SCALE = 4;
export const CHARACTER_PORTRAIT_SIZE = CHARACTER_CANVAS_SIZE * CHARACTER_PORTRAIT_SCALE;
export const CHARACTER_WORLD_SIZE = 80;
export const CHARACTER_WALK_SPEED = 96;
export const CHARACTER_DIRECTIONS = ["down", "left", "right", "up"] as const;
export type CharacterDirection = typeof CHARACTER_DIRECTIONS[number];
export type CharacterMotion = "idle" | "walk" | "sit";
export const CHARACTER_ANIMATIONS = {
  idle: { frames: 4, frameDuration: 400, row: 0, column: 0 },
  walk: { frames: 8, frameDuration: 100, row: 4, column: 0 },
  sit: { frames: 4, frameDuration: 400, row: 0, column: 4 },
} as const;
export const CHARACTER_ATLAS_SIZE = CHARACTER_CANVAS_SIZE * 8;
export const CHARACTER_FOOT_ANCHOR = { x: 90, y: 172 } as const;
export const CHARACTER_SEAT_ANCHOR = { x: 90, y: 96 } as const;
export const CHARACTER_SEATED_FOOT_Y = 156;

export function getCharacterIdleTransform(frame: number, anchorY: number = CHARACTER_FOOT_ANCHOR.y) {
  const offset = [0, 0.65, 0, -0.65][frame]!;
  const scaleY = 1 - offset / 160;
  return { scaleY, translateY: anchorY * (1 - scaleY) };
}

export function getCharacterFrame(motion: CharacterMotion, direction: CharacterDirection, elapsed: number) {
  const animation = CHARACTER_ANIMATIONS[motion];
  const frame = Math.floor(Math.max(0, elapsed) / animation.frameDuration) % animation.frames;
  return {
    x: (animation.column + frame) * CHARACTER_CANVAS_SIZE,
    y: (animation.row + CHARACTER_DIRECTIONS.indexOf(direction)) * CHARACTER_CANVAS_SIZE,
    width: CHARACTER_CANVAS_SIZE,
    height: CHARACTER_CANVAS_SIZE,
  };
}

export function getCharacterLayerPaths(appearance: CharacterAppearance, artwork: "animation" | "portrait" = "animation"): string[] {
  return [
    `head/${appearance.gender}-${appearance.face}`,
    `lower/${appearance.gender}-${appearance.lowerBody}`,
    `shoes/${appearance.gender}-${appearance.shoes}`,
    `upper/${appearance.gender}-${appearance.upperBody}-${appearance.breastSize}`,
    `hair/${appearance.hairstyle}${appearance.headwear === "none" ? "" : `-${appearance.headwear}`}`,
  ].map((layer) => `/characters/anime/${artwork === "portrait" ? "portraits/" : ""}${layer}.png`);
}

export function randomCharacterAppearance(): CharacterAppearance {
  const pick = <T>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)]!;
  return {
    gender: pick(CHARACTER_GENDERS),
    breastSize: pick(CHARACTER_BREAST_SIZES),
    face: pick(CHARACTER_FACES),
    hairstyle: pick(CHARACTER_HAIRSTYLES),
    upperBody: pick(CHARACTER_OUTFITS),
    lowerBody: pick(CHARACTER_OUTFITS),
    shoes: pick(CHARACTER_OUTFITS),
    headwear: pick(CHARACTER_HEADWEAR),
  };
}

export function characterAppearanceKey(appearance: CharacterAppearance): string {
  return [appearance.gender, appearance.breastSize, appearance.face, appearance.hairstyle,
    appearance.upperBody, appearance.lowerBody, appearance.shoes, appearance.headwear].join(":");
}
