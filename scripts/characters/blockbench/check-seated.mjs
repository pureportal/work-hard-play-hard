import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sharp } from "../raster.mjs";
import { CHARACTER_ANIMATIONS, CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, getCharacterFrame } from "../../../packages/shared/src/character.ts";

const root = new URL("../../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", import.meta.url), "utf8"));
const designs = manifest.layers.filter(layer => ["lower", "shoes"].includes(layer.layer));
let frames = 0;
for (const design of designs) {
  const original = await sharp(await readFile(new URL(design.path, root))).ensureAlpha().raw().toBuffer();
  for (const pose of ["chair", "floor"]) {
    const path = `apps/client/public/characters/seated/${pose}/${design.layer}/${design.name}.png`;
    const { data, info } = await sharp(await readFile(new URL(path, root))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { atlasSize, atlasHeight } = manifest.settings;
    assert.deepEqual([info.width, info.height], [atlasSize, atlasHeight * 2], `${path}: dimensions`);
    for (const [motion, animation] of Object.entries(CHARACTER_ANIMATIONS)) for (const direction of CHARACTER_DIRECTIONS) {
      for (let frameIndex = 0; frameIndex < animation.frames; frameIndex++) {
        const frame = getCharacterFrame(motion, direction, frameIndex * animation.frameDuration);
        let visible = 0;
        for (let y = 0; y < frame.height; y++) {
          const start = ((frame.y + y) * atlasSize + frame.x) * 4;
          for (let plane = 0; plane < 2; plane++) {
            const offset = start + plane * atlasSize * atlasHeight * 4;
            if (!motion.startsWith("sit")) assert(data.subarray(offset, offset + frame.width * 4).equals(original.subarray(offset, offset + frame.width * 4)), `${path}/${motion}: original frame changed`);
          }
          for (let x = 0; x < frame.width; x++) {
            const offset = start + x * 4;
            if (!data[offset + 3]) continue;
            visible++;
            assert(data[offset + atlasSize * atlasHeight * 4 + 3], `${path}: missing depth`);
            assert(x >= 2 && y >= 2 && x < CHARACTER_CANVAS_SIZE - 2 && y < CHARACTER_CANVAS_SIZE - 2, `${path}/${motion}/${direction}: clipped frame`);
          }
        }
        assert(visible, `${path}/${motion}/${direction}: empty frame`);
        frames++;
      }
    }
    assert(!data.equals(original), `${path}: seated pose was not rendered`);
  }
}
console.log(`Verified ${designs.length * 2} seated layers and ${frames} frames; standing, walking and listening artwork is unchanged.`);
