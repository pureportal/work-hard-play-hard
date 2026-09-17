import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS } from "../../../packages/shared/src/character.ts";

const audit = JSON.parse(await readFile(new URL("style-audit.json", import.meta.url), "utf8"));
const categories = { face: CHARACTER_FACES, hairstyle: CHARACTER_HAIRSTYLES, upperBody: CHARACTER_OUTFITS, lowerBody: CHARACTER_OUTFITS, shoes: CHARACTER_OUTFITS, headwear: CHARACTER_HEADWEAR.filter(value => value !== "none") };
const report = [];
for (const [category, options] of Object.entries(categories)) {
  const entry = audit[category];
  const classified = [...entry.feminine, ...entry.masculine, ...entry.neutral];
  assert.deepEqual(classified.toSorted(), options.toSorted(), `${category}: classify each asset once`);
  assert.equal(entry.feminine.length, entry.masculine.length, `${category}: styling balance`);
  assert.equal(new Set([...entry.crazy, ...entry.sexy]).size, 6, `${category}: six distinct themed additions`);
  for (const theme of ["crazy", "sexy"]) {
    assert.equal(entry[theme].length, 3);
    assert(entry[theme].every(value => options.includes(value) && !entry.before.includes(value)), `${category}: new ${theme} options`);
  }
  const expectedAdditions = ["face", "hairstyle", "headwear"].includes(category) ? 16 : 6;
  assert.equal(options.length - entry.before.length, expectedAdditions);
  assert(entry.before.every(value => options.includes(value)));
  const counts = values => Object.fromEntries(["feminine", "masculine", "neutral"].map(style => [style, entry[style].filter(value => values.includes(value)).length]));
  report.push({ category, before: counts(entry.before), after: counts(options), added: expectedAdditions, total: options.length });
}
console.log(JSON.stringify({ basis: "Subjective presentation audit, not gender eligibility. None is excluded. Categories describe this artwork only; all choices can be combined by everyone.", categories: report }, null, 2));
