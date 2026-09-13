import { getCharacterFrame, type CharacterDirection, type CharacterMotion } from "@workhard/shared";

export class CharacterAnimation {
  private motion: CharacterMotion = "idle";
  private startedAt: number | undefined;

  frame(now: number, motion: CharacterMotion, direction: CharacterDirection) {
    if (this.startedAt === undefined || this.motion !== motion) {
      this.motion = motion;
      this.startedAt = now;
    }
    return getCharacterFrame(motion, direction, now - this.startedAt);
  }
}
