import { describe, expect, it } from "vitest";
import { CHARACTER_CANVAS_SIZE, getCharacterFrame, getCharacterMotion } from "@workhard/shared";
import { CharacterAnimation } from "./character-animation";

describe("character animation playback", () => {
  it("keeps walking and seating consistent when music starts or stops", () => {
    expect(getCharacterMotion(false, false, true)).toBe("listen");
    expect(getCharacterMotion(false, true, true)).toBe("walk");
    expect(getCharacterMotion(true, false, true)).toBe("sit-listen");
    expect(getCharacterMotion(true, false, false)).toBe("sit");
    expect(getCharacterMotion(false, false, false)).toBe("idle");
  });
  it("starts walking on movement, loops, and returns to idle when movement ends", () => {
    const animation = new CharacterAnimation();
    expect(animation.frame(1000, "idle", "down")).toEqual(getCharacterFrame("idle", "down", 0));
    expect(animation.frame(1400, "idle", "down").x).toBe(CHARACTER_CANVAS_SIZE);
    expect(animation.frame(1500, "walk", "left")).toEqual(getCharacterFrame("walk", "left", 0));
    expect(animation.frame(1800, "walk", "left").x).toBe(CHARACTER_CANVAS_SIZE * 3);
    expect(animation.frame(2300, "walk", "left").x).toBe(0);
    expect(animation.frame(2350, "idle", "left")).toEqual(getCharacterFrame("idle", "left", 0));
  });

  it("preserves the walking phase when turning and uses elapsed time rather than render count", () => {
    const animation = new CharacterAnimation();
    animation.frame(0, "walk", "down");
    const right = animation.frame(450, "walk", "right");
    expect(right).toEqual(getCharacterFrame("walk", "right", 450));
    expect(animation.frame(450, "walk", "right")).toEqual(right);
    expect(animation.frame(550, "walk", "up")).toEqual(getCharacterFrame("walk", "up", 550));
  });

  it("enters and leaves a seated loop without reusing a walking frame", () => {
    const animation = new CharacterAnimation();
    animation.frame(0, "walk", "left");
    expect(animation.frame(700, "sit", "left")).toEqual(getCharacterFrame("sit", "left", 0));
    expect(animation.frame(1100, "sit", "up")).toEqual(getCharacterFrame("sit", "up", 400));
    expect(animation.frame(2300, "sit", "up")).toEqual(getCharacterFrame("sit", "up", 0));
    expect(animation.frame(2400, "idle", "up")).toEqual(getCharacterFrame("idle", "up", 0));
    expect(animation.frame(2500, "walk", "right")).toEqual(getCharacterFrame("walk", "right", 0));
  });
});
