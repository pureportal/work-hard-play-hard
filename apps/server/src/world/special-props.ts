import { randomInt, randomUUID } from "node:crypto";
import { SPECIAL_PROPS, SPECIAL_PROP_COOLDOWN_MS, type SpecialPropUse, type WorldObject } from "@workhard/shared";

const fortunes = [
  "Your next bug will be a missing semicolon. Probably.",
  "A snack break is in your very near future.",
  "The rubber duck believes in you.",
  "Today, the tests pass on the first try. Dream big.",
  "An excellent idea will arrive just after you close your laptop.",
  "You will find the answer on the tab you already closed.",
  "Your coffee-to-idea ratio is looking promising.",
  "A tiny victory is still a victory. Celebrate it.",
];

const breaks = ["Stretch break", "Tea break", "Water break", "Look out the window", "Take a short walk", "Share a terrible pun", "Give someone a high five", "Rest your eyes"];

export class SpecialPropInteractions {
  private readonly cooldowns = new Map<string, number>();

  use(object: WorldObject, userId: string, now = Date.now()): SpecialPropUse {
    const prop = SPECIAL_PROPS[object.assetId];
    if (!prop) throw new Error("PROP_NOT_FOUND");
    for (const [id, until] of this.cooldowns) if (until <= now) this.cooldowns.delete(id);
    if ((this.cooldowns.get(object.id) ?? 0) > now) throw new Error("PROP_COOLDOWN");
    const cooldownUntil = now + SPECIAL_PROP_COOLDOWN_MS;
    this.cooldowns.set(object.id, cooldownUntil);
    const outcomes = prop.effect === "fortune" ? fortunes : prop.effect === "wheel" ? breaks : undefined;
    return { id: randomUUID(), objectId: object.id, assetId: object.assetId, userId, floorId: object.floorId, usedAt: now, cooldownUntil,
      ...(outcomes ? { result: outcomes[randomInt(outcomes.length)]! } : {}) };
  }

  clear(): void {
    this.cooldowns.clear();
  }
}
