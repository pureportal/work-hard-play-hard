import {
  CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS,
  DEFAULT_CHARACTER_APPEARANCE, getCharacterLayerPaths,
} from "@workhard/shared";
import { expect, it } from "vitest";
import { getOptimizedImagePath } from "./optimized-images";

it("includes optimized artwork for every selectable character style and seated pose", () => {
  const appearances = [
    ...CHARACTER_FACES.map(face => ({ ...DEFAULT_CHARACTER_APPEARANCE, face })),
    ...CHARACTER_OUTFITS.map(outfit => ({ ...DEFAULT_CHARACTER_APPEARANCE, upperBody: outfit, lowerBody: outfit, shoes: outfit })),
    ...CHARACTER_HAIRSTYLES.flatMap(hairstyle => CHARACTER_HEADWEAR.map(headwear => ({ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle, headwear }))),
  ];
  const paths = new Set(appearances.flatMap(appearance => (["chair", "floor"] as const).flatMap(pose => getCharacterLayerPaths(appearance, pose))));
  for (const path of paths) {
    expect(getOptimizedImagePath(path), path).toMatch(/^\/optimized-images\/[a-f0-9]{24}\.webp$/);
  }
});
