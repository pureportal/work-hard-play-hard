import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeHash, sharp } from "./sources.mjs";

test("PNG-to-WebP recipes ignore platform-specific AV1 codecs", () => {
  const versions = sharp.versions;
  try {
    sharp.versions = { ...versions, aom: "3.14.1" };
    const windowsRecipe = recipeHash({});
    sharp.versions = { ...versions, aom: "3.15.0" };
    assert.equal(recipeHash({}), windowsRecipe);
  } finally {
    sharp.versions = versions;
  }
});

test("image processing upgrades invalidate delivery recipes", () => {
  const versions = sharp.versions;
  const recipe = recipeHash({});
  try {
    for (const library of ["sharp", "vips", "png", "webp"]) {
      sharp.versions = { ...versions, [library]: "99.0.0" };
      assert.notEqual(recipeHash({}), recipe, library);
    }
  } finally {
    sharp.versions = versions;
  }
});

test("changed preview crops invalidate delivery recipes", () => {
  const frame = { x: 0, y: 0, width: 64, height: 64 };
  const recipe = recipeHash({ frames: [frame] });
  assert.notEqual(recipeHash({ frames: [{ ...frame, x: 64 }] }), recipe);
  assert.notEqual(recipeHash({}), recipe);
});
