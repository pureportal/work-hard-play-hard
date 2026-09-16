import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp");
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9);
assert(output, "Pass --output=<collection review directory>");
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const [selection, catalog, artwork, before, capture, sheets] = await Promise.all([
  readJson(`${output}/selection.json`), readJson("packages/shared/src/asset-catalog.json"),
  readJson("apps/client/src/world-asset-artwork.json"), readJson(`${output}/before/artwork.json`),
  readJson(`${output}/gameplay/coverage.json`), readJson(`${output}/sheets/index.json`),
]);
assert.deepEqual(capture.errors, []);
for (const id of selection.review) {
  const asset = catalog.assets.find(asset => asset.id === id);
  const variants = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants;
  for (const variant of variants) {
    const evidence = capture.coverage.filter(row => row.assetId === id && row.variantId === variant.id);
    assert.equal(evidence.length, 1, `${id}/${variant.id}: missing or duplicate capture`);
    assert.deepEqual(evidence[0].rotations, [0, 90, 180, 270]);
  }
}
await mkdir(`${output}/comparisons`, { recursive: true });
for (const id of selection.recreated) {
  const asset = catalog.assets.find(asset => asset.id === id);
  const variantId = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants[0].id;
  const scale = 2;
  const oldDesign = before[id].variants[variantId], newDesign = artwork[id].variants[variantId];
  const top = Math.min(...[...oldDesign.bounds, ...newDesign.bounds].map(bounds => bounds.y));
  const bottom = Math.max(...[...oldDesign.bounds, ...newDesign.bounds].map(bounds => bounds.y + bounds.height));
  const height = Math.ceil((bottom - top) * scale) + 42;
  const layers = [];
  for (const [row, design] of [oldDesign, newDesign].entries()) {
    const file = row === 0 ? `${output}/before/${id}/${variantId}.png` : `apps/client/public${design.path}`;
    for (const [direction, frame] of design.frames.entries()) {
      const bounds = design.bounds[direction];
      const png = await sharp(file).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height })
        .resize({ width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) }).png().toBuffer();
      layers.push({ input: png, left: direction * 220 + Math.round((220 - bounds.width * scale) / 2), top: row * height + 30 + Math.round((bounds.y - top) * scale) });
    }
    layers.push({ input: Buffer.from(`<svg width="880" height="25"><text x="8" y="18" font-family="Arial" font-size="14" fill="#514552">${asset.name} · ${row ? "After" : "Before"} · 2× world scale</text></svg>`), left: 0, top: row * height });
  }
  await sharp({ create: { width: 880, height: height * 2, channels: 4, background: "#e9eee4" } }).composite(layers).png().toFile(`${output}/comparisons/${id}.png`);
}
const names = ids => ids.map(id => catalog.assets.find(asset => asset.id === id).name).join(", ");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plants and food review</title>
<style>body{max-width:1080px;margin:32px auto;padding:0 20px;background:#eee8df;color:#393740;font:16px/1.5 system-ui}h1,h2{line-height:1.2}img{display:block;max-width:100%;height:auto;margin:16px 0 36px}a{color:#355b68}summary{cursor:pointer;padding:12px 0}p{max-width:80ch}</style>
<h1>Plants and food</h1><p>${selection.additions.length} additions · ${selection.recreated.length} rebuilt assets · ${selection.review.length} assets reviewed</p>
<h2>New plants</h2><p>${names(selection.additions.filter(id => !id.startsWith("food-")))}</p>
<h2>New dishes</h2><p>${names(selection.additions.filter(id => id.startsWith("food-")))}</p>
<h2>Game size</h2><p>${capture.coverage.length} designs · ${capture.coverage.length * 4} directional views · 0.78 game zoom</p>
${sheets.map(sheet => `<a href="sheets/${sheet.sheet}"><img loading="lazy" src="sheets/${sheet.sheet}" alt="${names(sheet.assets)}"></a>`).join("\n")}
<h2>Rebuilt artwork</h2>${selection.recreated.map(id => `<details><summary>${catalog.assets.find(asset => asset.id === id).name}</summary><img loading="lazy" src="comparisons/${id}.png" alt="Before and after, all four directions"></details>`).join("\n")}
<p><a href="gameplay/index.html">Game captures</a> · <a href="gameplay/coverage.json">Coverage</a> · <a href="shop/checks.json">Shop checks</a></p></html>`;
await writeFile(`${output}/index.html`, html);
console.log(`Built gallery: ${selection.review.length} assets, ${capture.coverage.length * 4} captured views, ${selection.recreated.length} comparisons.`);
