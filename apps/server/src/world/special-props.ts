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
  "The meeting will end early. Try not to look surprised.",
  "Someone will ask a quick question. Clear your afternoon.",
  "Your inbox will be quiet for seven beautiful minutes.",
  "A carefully named file will save you from yourself.",
  "The printer will behave while someone is watching.",
  "You will close one tab and feel strangely accomplished.",
  "An old note will make perfect sense to past you.",
  "Your next shortcut will save four seconds a week.",
  "The missing cable is in the drawer you already checked.",
  "The good pen has not left the building.",
  "Someone will bring pastries. Protect that meeting.",
  "The answer will come while you are washing a spoon.",
  "You will remember why you opened that tab. Briefly.",
  "A typo will improve the sentence. Keep it.",
  "The plant on your desk considers you a promising amateur.",
  "An unread message will turn out to be a receipt.",
  "Your umbrella will finally make its case.",
  "Your chair will find the only squeaky floorboard.",
  "A task will take less time than choosing a playlist.",
  "Future you appreciates the label. Future you has questions.",
  "The thing you put somewhere safe is still there.",
  "You will win an argument with a jar lid.",
  "A plan will improve when someone cancels.",
  "Your next walk will include an exceptionally good dog.",
  "You will arrive early and spend the time finding the entrance.",
  "The correct answer will be the one you nearly said aloud.",
  "Your mug will be exactly where you left it, for once.",
  "A queue will move just after you stop watching it.",
  "Your desk will stay tidy until the next idea.",
  "The recipe's five minutes are open to interpretation.",
  "Your next search will end on page one. Enjoy the rarity.",
  "Someone will ask for a small favor and actually mean small.",
  "You will have just enough battery to finish the story.",
  "A document named final will have other plans.",
  "The mystery noise is probably the fridge.",
  "One button will do exactly what its label says.",
  "Your tea will steep until you remember it exists.",
  "The password hint will reveal what past you found obvious.",
  "You will hear 'circle back' and see it happen.",
  "A spare minute will turn into an entire cup of coffee.",
  "Your next idea will arrive at an inconveniently good time.",
  "The tiny screwdriver will finally have its moment.",
  "A forgotten bookmark will be worth keeping.",
  "Your handwriting will be legible when it matters least.",
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
