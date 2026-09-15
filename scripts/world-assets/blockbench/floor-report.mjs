import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const output = new URL("artifacts/floor-types-2026-09-15/", root);
const readJson = async url => JSON.parse(await readFile(url, "utf8"));
const [catalog, artwork, sources, manifest, materials, coverage, roundtrip, interactions, live, beforeCatalog, beforeArtwork, beforeSources, beforeManifest] = await Promise.all([
  readJson(new URL("packages/shared/src/asset-catalog.json", root)),
  readJson(new URL("apps/client/src/world-asset-artwork.json", root)),
  readJson(new URL("scripts/world-assets/artwork-sources.json", root)),
  readJson(new URL("scripts/world-assets/blockbench/renders/manifest.json", root)),
  readJson(new URL("materials.json", output)),
  readJson(new URL("gameplay/coverage.json", output)),
  readJson(new URL("native-roundtrip.json", output)),
  readJson(new URL("interactions/checks.json", output)),
  readJson(new URL("live-server/live-placement-report.json", output)),
  readJson(new URL("before/catalog.json", output)),
  readJson(new URL("before/artwork.json", output)),
  readJson(new URL("before/sources.json", output)),
  readJson(new URL("before/manifest.json", output)),
]);
const floors = catalog.assets.filter(asset => asset.kind === "floor-tile");
assert.equal(floors.length, 24);
assert.equal(materials.length, floors.length);
assert.equal(coverage.coverage.length, 288);
assert.equal(roundtrip.reviewed.length, 72);
assert.equal(interactions.checks.length, 26);
for (const result of [coverage, interactions, live]) assert.deepEqual(result.errors, []);
assert(live.verified.some(check => check.reloadedPlacement));
assert(live.verified.some(check => check.testObjectRemoved && check.originalObjectsPreserved));
for (const rotation of [0, 90, 180, 270]) assert(live.verified.some(check => check.rotation === rotation && check.gridAligned));
assert(!catalog.assets.some(asset => asset.id === "floor-tile"));
assert(!artwork["floor-tile"] && !sources["floor-tile"]);

const nonFloorAssets = beforeCatalog.assets.filter(asset => asset.id !== "floor-tile");
for (const asset of nonFloorAssets) {
  assert.deepEqual(catalog.assets.find(candidate => candidate.id === asset.id), asset);
  assert.deepEqual(artwork[asset.id], beforeArtwork[asset.id]);
  assert.deepEqual(sources[asset.id], beforeSources[asset.id]);
  assert.deepEqual(manifest.results.find(result => result.assetId === asset.id), beforeManifest.results.find(result => result.assetId === asset.id));
}
assert.deepEqual(catalog.categories, beforeCatalog.categories);
for (const theme of beforeCatalog.themeSets.filter(theme => theme.id !== "surfaces")) {
  assert.deepEqual(catalog.themeSets.find(candidate => candidate.id === theme.id), theme);
}

const designs = [];
for (const floor of floors) {
  const material = materials.find(material => material.id === floor.id);
  const variants = catalog.themeSets.find(theme => theme.id === floor.themeSetId).variants;
  assert.deepEqual(material.designs, variants.map(({ id, name }) => ({ id, name })));
  assert.equal(variants.length, 3);
  const interaction = interactions.checks.find(check => check.assetId === floor.id);
  assert.deepEqual(interaction.selectedDesigns, variants.map(variant => variant.id));
  assert(interaction.rotated && interaction.moved && interaction.removed);
  await readFile(new URL(`gameplay/${floor.id}.png`, output));
  await readFile(new URL(`first-pass/${floor.id}.png`, output));
  for (const variant of variants) {
    const source = sources[floor.id][variant.id];
    const modelBytes = await readFile(new URL(source.model, root));
    const model = JSON.parse(modelBytes.toString("utf8"));
    const opened = roundtrip.reviewed.find(row => row.assetId === floor.id && row.variantId === variant.id);
    assert.equal(opened.elements, model.elements.length);
    assert.equal(opened.textures, model.textures.length);
    const fields = [];
    for (const rotation of [0, 90, 180, 270]) {
      const entries = coverage.coverage.filter(row => row.assetId === floor.id && row.variantId === variant.id && row.rotation === rotation);
      assert.equal(entries.length, 1);
      const bytes = await readFile(new URL(`gameplay/${entries[0].evidence}`, output));
      fields.push({ rotation, path: `gameplay/${entries[0].evidence}`, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    const scene = `gameplay/scenes/${floor.id}-${variant.id}.png`;
    await readFile(new URL(scene, output));
    designs.push({ assetId: floor.id, variantId: variant.id, model: source.model, modelSha256: createHash("sha256").update(modelBytes).digest("hex"), scene, fields });
  }
}

await writeFile(new URL("verification.json", output), JSON.stringify({
  materials: floors.length,
  designs: designs.length,
  capturedGameplayViews: coverage.coverage.length,
  blockbenchVersion: roundtrip.blockbenchVersion,
  roundTrippedModels: roundtrip.reviewed.length,
  unchangedOtherCatalogAssets: nonFloorAssets.length,
  interfaceChecks: interactions.checks.length,
  liveServer: live,
  designsWithEvidence: designs,
}, null, 2));

const escapeHtml = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const options = materials.map(material => `<option value="${material.id}">${escapeHtml(material.name)}</option>`).join("");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Floor materials review</title>
<style>
:root{font:15px system-ui,sans-serif;color:#302c33;background:#f5f1eb;color-scheme:light}
body{max-width:960px;margin:0 auto;padding:24px}h1{font-size:26px;margin:0 0 10px}p{margin:10px 0 18px}
a{color:#5c4b84;text-underline-offset:3px}nav,.controls,#scenes{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}
label{display:grid;gap:6px;font-size:13px}select{font:inherit;padding:9px 12px;background:#fff;border:1px solid #bbb0bd;border-radius:6px}
.sheet{overflow-x:auto;border:1px solid #ddd3cf;border-radius:8px;width:fit-content;max-width:100%}
#sheet{display:block;width:716px;height:666px}h2{font-size:18px;margin-top:24px}.evidence{display:flex;gap:16px;flex-wrap:wrap}
@media(max-width:500px){body{padding:16px}select{max-width:calc(100vw - 32px)}}
</style></head><body>
<h1>Floor materials</h1><p>24 materials · 72 designs · Four rotations</p>
<nav><a href="../../docs/floor-types-2026-09-15.md">Review report</a><a href="verification.json">Verification</a><a href="native-roundtrip.json">Blockbench models</a></nav>
<div class="controls"><label>Material<select id="material">${options}</select></label><label>Review<select id="pass"><option value="gameplay">Final</option><option value="first-pass">First pass</option></select></label></div>
<div class="sheet"><img id="sheet" src="gameplay/${materials[0].id}.png" width="716" height="666" alt="${escapeHtml(materials[0].name)}: three designs in four rotations"></div>
<h2>Final game views</h2><div id="scenes"></div>
<h2>Build and Shop</h2><div class="evidence"><a href="interactions/build-designs.png">Build</a><a href="interactions/shop.png">Shop</a><a href="interactions/build-mobile.png">Mobile</a><a href="interactions/rug-layering.png">Rug layering</a><a href="live-server/live-placement-reloaded.png">Live placement after reload</a></div>
<script>
const materials=${JSON.stringify(materials).replaceAll("<", "\\u003c")};
const material=document.querySelector('#material'),pass=document.querySelector('#pass'),sheet=document.querySelector('#sheet'),scenes=document.querySelector('#scenes');
function show(){const selected=materials.find(item=>item.id===material.value);sheet.src=pass.value+'/'+selected.id+'.png';sheet.alt=selected.name+': three designs in four rotations';scenes.replaceChildren(...selected.designs.map(design=>{const link=document.createElement('a');link.href='gameplay/scenes/'+selected.id+'-'+design.id+'.png';link.textContent=design.name;return link;}));}
material.addEventListener('change',show);pass.addEventListener('change',show);show();
</script></body></html>`;
await writeFile(new URL("index.html", output), html);
console.log(`Verified ${designs.length} models and ${coverage.coverage.length} gameplay captures. Gallery: ${fileURLToPath(new URL("index.html", output))}`);
