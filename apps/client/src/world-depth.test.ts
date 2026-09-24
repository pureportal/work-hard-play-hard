import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { WorldDepth } from "./world-depth";

describe("world depth", () => {
  it("only changes child order when depth order changes", () => {
    const depth = new WorldDepth();
    const front = new Container({ label: "front" });
    const back = new Container({ label: "back" });
    depth.setPosition(back, 0, 10);
    depth.setPosition(front, 0, 20);
    depth.sort();
    const sortChildren = vi.spyOn(depth.container, "sortChildren");

    depth.setPosition(back, 1, 11);
    depth.sort();
    expect(sortChildren).not.toHaveBeenCalled();
    expect(back.zIndex).toBeLessThan(front.zIndex);

    depth.setPosition(back, 1, 30);
    depth.sort();
    expect(sortChildren).toHaveBeenCalledOnce();
    expect(back.zIndex).toBeGreaterThan(front.zIndex);
  });

  it("keeps attached views beside their support", () => {
    const depth = new WorldDepth();
    const support = new Container({ label: "support" });
    const behind = new Container({ label: "behind" });
    const ahead = new Container({ label: "ahead" });
    for (const container of [support, behind, ahead]) depth.setPosition(container, 0, 10);
    depth.attach(behind, support, true);
    depth.attach(ahead, support);
    depth.sort();
    expect(behind.zIndex).toBeLessThan(support.zIndex);
    expect(ahead.zIndex).toBeGreaterThan(support.zIndex);
  });
});
