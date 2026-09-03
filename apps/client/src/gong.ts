import type { GongRing } from "@workhard/shared";

export const GONG_EFFECT_DURATION_MS = 3_200;

export interface DisplayGongRing extends GongRing {
  startedAt: number;
  expiresAt: number;
}
