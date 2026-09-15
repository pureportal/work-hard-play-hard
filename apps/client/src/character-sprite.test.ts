import { CHARACTER_ATLAS_HEIGHT, CHARACTER_ATLAS_SIZE } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { CharacterSprite } from "./character-sprite";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillRect: vi.fn(), getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })) })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe("character texture ownership", () => {
  it("keeps identical appearances alive when another player leaves", () => {
    const atlas = document.createElement("canvas");
    atlas.width = CHARACTER_ATLAS_SIZE;
    atlas.height = CHARACTER_ATLAS_HEIGHT;
    const first = new CharacterSprite(atlas);
    const second = new CharacterSprite(atlas);
    const source = first.sprite.texture.source;
    expect(source).toBe(second.sprite.texture.source);
    expect(first.sprite.texture).toBe(second.sprite.texture);
    first.sprite.destroy();
    expect(source.destroyed).toBe(false);
    expect(second.sprite.texture.destroyed).toBe(false);
    second.update(1000, "sit-listen", "up");
    expect(second.sprite.texture.source.resource).toBe(atlas);
    second.sprite.destroy();
    expect(source.destroyed).toBe(true);
    const returning = new CharacterSprite(atlas);
    expect(returning.sprite.texture.source).not.toBe(source);
    expect(returning.sprite.texture.destroyed).toBe(false);
    returning.sprite.destroy();
  });

  it("keeps each player's animation independent while sharing frame textures", () => {
    const atlas = document.createElement("canvas");
    const first = new CharacterSprite(atlas);
    const second = new CharacterSprite(atlas);
    first.update(0, "walk", "left");
    second.update(0, "sit", "up");
    expect(first.sprite.texture).not.toBe(second.sprite.texture);
    expect(first.sprite.texture.source).toBe(second.sprite.texture.source);
    const seated = second.sprite.texture;
    first.update(250, "walk", "left");
    expect(second.sprite.texture).toBe(seated);
    first.sprite.destroy();
    second.sprite.destroy();
  });

  it("keeps different atlases independent", () => {
    const first = new CharacterSprite(document.createElement("canvas"));
    const second = new CharacterSprite(document.createElement("canvas"));
    expect(first.sprite.texture.source).not.toBe(second.sprite.texture.source);
    first.sprite.destroy();
    expect(second.sprite.texture.destroyed).toBe(false);
    second.sprite.destroy();
  });
});
