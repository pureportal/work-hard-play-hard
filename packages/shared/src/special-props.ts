export const SPECIAL_PROP_RANGE = 72;
export const SPECIAL_PROP_COOLDOWN_MS = 6_000;
export const SPECIAL_PROP_EFFECT_MS = 3_200;

export type SpecialPropEffect = "confetti" | "bubbles" | "fortune" | "wheel";

export const SPECIAL_PROPS: Record<string, { action: string; effect: SpecialPropEffect }> = {
  "special-confetti": { action: "Launch confetti", effect: "confetti" },
  "special-bubbles": { action: "Blow bubbles", effect: "bubbles" },
  "special-fortune": { action: "Get fortune", effect: "fortune" },
  "special-break-wheel": { action: "Spin wheel", effect: "wheel" },
};

export interface SpecialPropUse {
  id: string;
  objectId: string;
  assetId: string;
  userId: string;
  floorId: string;
  usedAt: number;
  cooldownUntil: number;
  result?: string;
}
