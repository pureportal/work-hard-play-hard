import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { initialWorldRatings } from "./quality-ratings.mjs";
import { finalWorldRatings, floorRatings } from "./quality-final-ratings.mjs";
import { rateCharacterAsset } from "../../characters/blockbench/quality-ratings.mjs";
import { writeQualityIndex } from "./quality-report.mjs";

const root = resolve("artifacts/asset-quality-2026-09-15");
const json = async path => JSON.parse(await readFile(`${root}/${path}`, "utf8"));
const initial = await json("inventory.json");
const current = await json("after/inventory.json");
const beforeWorld = await json("before/world-coverage.json");
const intermediateWorld = await json("botanical-rebuild/world-coverage.json");
const afterWorld = await json("after/live-world/coverage.json");
const characterFrames = await json("before/characters/coverage.json");
const liveCharacters = await json("after/live-characters/coverage.json");
const floors = await json("after/live-floors/coverage.json");
const animations = await json("after/animations/coverage.json");
const served = await json("after/live-inventory/inventory-report.json");
const assetIds = [...new Set(current.assets.filter(asset => asset.family === "world").map(asset => asset.assetId))];
assert.deepEqual(Object.keys(initialWorldRatings).sort(), assetIds.toSorted());
assert.deepEqual(Object.keys(finalWorldRatings).sort(), assetIds.toSorted());
assert.deepEqual(initial.assets.map(asset => asset.id), current.assets.map(asset => asset.id));
assert.deepEqual(initial.customization, current.customization);
assert.equal(afterWorld.views.length, 1044);
assert.equal(liveCharacters.views.length, 560);
assert.equal(floors.coverage.length, 48);
assert.equal(served.atlases.length, 436);
for (const report of [beforeWorld, afterWorld, characterFrames, liveCharacters, floors, animations, served]) assert.deepEqual(report.errors, []);
const pathInReport = path => relative(root, resolve(path)).replaceAll("\\", "/");
const intermediateRatings = {
  "outdoor-garden-bed": [6.5, "The first replacement still arranged flowers too regularly; rebuilt with irregular clusters and varied heights."],
  "plant-bonsai": [7, "The first replacement still hid the trunk in stacked foliage; rebuilt with radial leaf clouds and a curved trunk."],
  "plant-monstera": [7, "The first replacement still tangled its leaf lobes; rebuilt with broader heart-shaped split leaves."],
  "outdoor-topiary": [7.5, "The first replacement still read as stacked shapes; rebuilt as continuous spiral foliage."],
};
const assets = [];
for (const [index, asset] of current.assets.entries()) {
  const original = initial.assets[index];
  assert.equal(createHash("sha256").update(await readFile(asset.path)).digest("hex"), asset.sha256, `${asset.id}: artwork changed after verification`);
  if (asset.model) assert.equal(createHash("sha256").update(await readFile(asset.model)).digest("hex"), asset.modelSha256, `${asset.id}: model changed after verification`);
  const entry = { ...asset, initialSha256: original.sha256, initialModelSha256: original.modelSha256, initialScore: null, initialReason: "", changes: [], intermediateReviews: [], finalScore: null, finalReason: "", evidence: [], validated: false };
  const evidence = (label, path) => entry.evidence.push({ label, path });
  if (asset.family === "world") {
    [entry.initialScore, entry.initialReason] = initialWorldRatings[asset.assetId];
    [entry.finalScore, entry.finalReason] = finalWorldRatings[asset.assetId];
    if (asset.assetId === "floor-tile") {
      const rating = floorRatings[asset.variantId];
      Object.assign(entry, { initialScore: rating.initial, initialReason: rating.initialReason, finalScore: rating.final, finalReason: rating.finalReason });
    }
    if (entry.initialScore < 8) {
      assert.notEqual(asset.modelSha256, original.modelSha256, `${asset.id}: required native recreation missing`);
      entry.changes.push(`Recreated native Blockbench geometry and materials. ${entry.finalReason}`);
    } else {
      assert.equal(asset.modelSha256, original.modelSha256, `${asset.id}: passing native artwork was unexpectedly changed`);
      entry.changes.push("Retained passing native artwork; repacked its atlas and enabled mipmapped minification.");
    }
    if (intermediateRatings[asset.assetId]) {
      const [score, reason] = intermediateRatings[asset.assetId];
      const review = intermediateWorld.views.find(view => view.id === asset.id);
      assert(review, `${asset.id}: missing intermediate evidence`);
      entry.intermediateReviews.push({ score, reason, evidence: pathInReport(review.evidence) });
    }
    if (asset.assetId === "light-arc") entry.changes.push("Adjusted the recreated foot radius after the footprint validator detected an uncovered solid cell; the final native export passes calibration.");
    const before = beforeWorld.views.filter(view => view.id === asset.id);
    const after = afterWorld.views.filter(view => view.id === asset.id);
    assert.deepEqual(before.map(view => view.rotation).sort((a, b) => a - b), asset.directions);
    assert.deepEqual(after.map(view => view.rotation).sort((a, b) => a - b), asset.directions);
    evidence("Initial directions", pathInReport(before[0].evidence));
    evidence("Final gameplay directions", `after/live-world/gameplay-${String(Math.floor(index / 9) + 1).padStart(2, "0")}.png`);
    for (const view of after) evidence(`Gameplay ${view.rotation} degrees`, pathInReport(view.evidence));
    evidence("Full game scene", pathInReport(after[0].scene));
    if (asset.placement.layer === "ground") {
      assert.deepEqual(floors.coverage.filter(view => view.id === asset.id).map(view => view.rotation), asset.directions);
      evidence("Initial repeated field", `before/floor-${asset.assetId}-${asset.variantId}.png`);
      evidence("Final repeated game field", `after/live-floors/${asset.assetId}-${asset.variantId}.png`);
      entry.changes.push("Rebuilt the ground pattern, removed transparent crop edges and added copied texture gutters to preserve adjacent edges during minification.");
    }
    const animation = animations.assets.find(animation => animation.id === asset.assetId);
    if (asset.animation) {
      assert(animation);
      assert(animation.playback.uniqueFrames.every(count => count === asset.animation.frames));
    }
    if (animation) for (const [index, path] of animation.evidence.entries()) evidence(`Animation frames ${index + 1}`, pathInReport(path));
  } else if (asset.family === "character") {
    const rating = rateCharacterAsset(asset);
    Object.assign(entry, { initialScore: rating.score, finalScore: rating.score, initialReason: rating.reason, finalReason: rating.reason });
    assert.equal(asset.sha256, original.sha256);
    assert.equal(asset.modelSha256, original.modelSha256);
    entry.changes.push("Retained the passing native model and atlas; validated the unchanged file in the running game.");
    const path = asset.path.replace("apps/client/public", "");
    const sample = characterFrames.samples.find(sample => sample.layers.includes(path));
    assert(sample?.frames === 128 && sample.directions.length === 4 && sample.animations.length === 5);
    const views = liveCharacters.views.filter(view => view.id === sample.id);
    assert.deepEqual(views.map(view => view.direction), asset.directions);
    evidence("All 128 frames at gameplay size", pathInReport(sample.evidence));
    const sampleIndex = characterFrames.samples.indexOf(sample);
    evidence("Final gameplay directions", `after/live-characters/characters-${String(Math.floor(sampleIndex / 20) + 1).padStart(2, "0")}.png`);
    for (const view of views) evidence(`Gameplay ${view.direction}`, pathInReport(view.evidence));
  } else if (asset.family === "architecture") {
    const scores = { wall: [7, 8.5], door: [8, 8], window: [8.5, 8.5] }[asset.assetId];
    [entry.initialScore, entry.finalScore] = scores;
    entry.initialReason = { wall: "Visible joins interrupt the otherwise clear plaster wall strip.", door: "Clear framed threshold and intact trim fit the established top-down architecture.", window: "Colored glass and fitted trim distinguish the window clearly in all stored directions." }[asset.assetId];
    entry.finalReason = { wall: "Continuous plaster, cap and moldings meet cleanly across connected wall segments in both themes.", door: "Clear threshold and fitted trim remain intact in connected layouts and both themes.", window: "Glass, trim and adjoining wall edges remain clear and correctly aligned in both themes." }[asset.assetId];
    entry.changes.push(asset.assetId === "wall" ? "Recreated the native wall backing and extended cap/moldings past the crop; copied edge gutters remove joins." : "Retained passing native artwork and repacked the atlas with edge gutters.");
    if (asset.assetId === "wall") assert.notEqual(asset.modelSha256, original.modelSha256);
    evidence("Initial directions and joins", "before/architecture/architecture-directions-and-joins.png");
    evidence("Final directions and joins", "after/architecture/architecture-directions-and-joins.png");
    evidence("Horizontal game layout", "after/interactions/architecture-horizontal.png");
    evidence("Vertical game layout", "after/interactions/architecture-vertical.png");
    evidence("Dark game layout", "after/interactions/architecture-horizontal-dark.png");
  } else {
    Object.assign(entry, { initialScore: 7, finalScore: 8.5, initialReason: "The office scene repeats the old flat furniture and visibly unfinished arcade housing.", finalReason: "The updated room composition uses the rebuilt furniture, coherent floor pattern and complete arcade; characters remain clear at its displayed size." });
    entry.changes.push("Regenerated the office illustration from the current Blockbench atlases and inspected it on the actual sign-in page.");
    evidence("Initial sign-in illustration", "before/live/auth-after.png");
    evidence("Final sign-in illustration", "after/live-inventory/auth-after.png");
  }
  assert(Number.isFinite(entry.initialScore) && entry.initialScore >= 0 && entry.initialScore <= 10);
  assert(entry.finalScore >= 8 && entry.finalScore <= 10 && entry.finalReason && !entry.finalReason.includes("undefined"));
  for (const item of [...entry.evidence, ...entry.intermediateReviews.map(review => ({ path: review.evidence }))]) assert((await stat(resolve(root, item.path))).isFile(), `${entry.id}: missing evidence ${item.path}`);
  entry.validated = true;
  assets.push(entry);
}
const report = { reviewedAt: new Date().toISOString(), criteria: initial.criteria, passingScore: 8, scale: initial.scale, counts: current.counts, customization: current.customization, nativeModelsRecreated: assets.filter(asset => asset.modelSha256 !== asset.initialModelSha256).length, unvalidated: [], assets };
await writeFile(`${root}/scorecard.json`, JSON.stringify(report, null, 2) + "\n");
const columns = ["id", "family", "initialScore", "initialReason", "changes", "finalScore", "finalReason", "directions", "frames", "model", "path", "initialSha256", "sha256", "evidence"];
const csv = [columns, ...assets.map(asset => columns.map(column => typeof asset[column] === "object" ? JSON.stringify(asset[column]) : asset[column] ?? ""))].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
await writeFile(`${root}/scorecard.csv`, csv + "\n");
await writeQualityIndex(root, report);
console.log(JSON.stringify({ validated: assets.length, minimumScore: Math.min(...assets.map(asset => asset.finalScore)), nativeModelsRecreated: report.nativeModelsRecreated, unvalidated: report.unvalidated }, null, 2));
