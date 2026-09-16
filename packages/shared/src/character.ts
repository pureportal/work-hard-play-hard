export const CHARACTER_FACES = ["calm", "bright", "fierce", "dreamy", "smile", "shy"] as const;
export const CHARACTER_HAIRSTYLES = ["bob", "spiky", "ponytail", "twintails", "wavy", "braid", "pixie", "curtains", "hime", "tousled", "buns", "swept", "curls", "longbraid"] as const;
export const CHARACTER_OUTFITS = [
  "street", "ranger", "arcane", "sailor", "cardigan", "kimono", "traveler", "festival",
  "cyber", "pirate", "astronaut", "dragon", "jester", "frog", "biker", "velvet", "starlight", "sunset",
] as const;
export const CHARACTER_HEADWEAR = ["none", "cap", "witch", "beret", "ribbon", "catears", "blossom", "goggles"] as const;

export interface CharacterAppearance {
  face: typeof CHARACTER_FACES[number];
  hairstyle: typeof CHARACTER_HAIRSTYLES[number];
  upperBody: typeof CHARACTER_OUTFITS[number];
  lowerBody: typeof CHARACTER_OUTFITS[number];
  shoes: typeof CHARACTER_OUTFITS[number];
  headwear: typeof CHARACTER_HEADWEAR[number];
}

export const DEFAULT_CHARACTER_APPEARANCE: Readonly<CharacterAppearance> = {
  face: "calm",
  hairstyle: "bob",
  upperBody: "street",
  lowerBody: "street",
  shoes: "street",
  headwear: "none",
};

export const CHARACTER_CANVAS_SIZE = 120;
export const CHARACTER_WORLD_SIZE = 80;
export const CHARACTER_WALK_SPEED = 350;
export const CHARACTER_DIRECTIONS = ["down", "left", "right", "up"] as const;
export type CharacterDirection = typeof CHARACTER_DIRECTIONS[number];
export type CharacterMotion = "idle" | "walk" | "sit" | "listen" | "sit-listen";
export const CHARACTER_ANIMATIONS = {
  idle: { frames: 4, frameDuration: 400, row: 0, column: 0 },
  walk: { frames: 8, frameDuration: 100, row: 4, column: 0 },
  sit: { frames: 4, frameDuration: 400, row: 0, column: 4 },
  listen: { frames: 8, frameDuration: 200, row: 8, column: 0 },
  "sit-listen": { frames: 8, frameDuration: 200, row: 12, column: 0 },
} as const;
export const CHARACTER_ATLAS_SIZE = CHARACTER_CANVAS_SIZE * 8;
export const CHARACTER_ATLAS_HEIGHT = CHARACTER_CANVAS_SIZE * 16;
export const CHARACTER_FOOT_ANCHOR = { x: 60, y: 114 } as const;
export const CHARACTER_SEAT_ANCHOR = { x: 60, y: 78 } as const;
export const CHARACTER_SEATED_FOOT_Y = 108;

export function getCharacterMotion(seated: boolean, moving: boolean, listening: boolean): CharacterMotion {
  if (seated) return listening ? "sit-listen" : "sit";
  if (moving) return "walk";
  return listening ? "listen" : "idle";
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

export function getCharacterLayerPaths(appearance: CharacterAppearance): string[] {
  return [
    `head/${appearance.face}`,
    `lower/${appearance.lowerBody}`,
    `shoes/${appearance.shoes}`,
    `upper/${appearance.upperBody}`,
    `hair/${appearance.hairstyle}${appearance.headwear === "none" ? "" : `-${appearance.headwear}`}`,
  ].map((layer) => `/characters/blockbench/${layer}.png`);
}

export function randomCharacterAppearance(): CharacterAppearance {
  const pick = <T>(options: readonly T[]): T => options[Math.floor(Math.random() * options.length)]!;
  return {
    face: pick(CHARACTER_FACES),
    hairstyle: pick(CHARACTER_HAIRSTYLES),
    upperBody: pick(CHARACTER_OUTFITS),
    lowerBody: pick(CHARACTER_OUTFITS),
    shoes: pick(CHARACTER_OUTFITS),
    headwear: pick(CHARACTER_HEADWEAR),
  };
}

export function characterAppearanceKey(appearance: CharacterAppearance): string {
  return [appearance.face, appearance.hairstyle,
    appearance.upperBody, appearance.lowerBody, appearance.shoes, appearance.headwear].join(":");
}
