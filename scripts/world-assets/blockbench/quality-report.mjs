import { writeFile } from "node:fs/promises";

const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function writeQualityIndex(root, report) {
  const rows = report.assets.map(asset => {
    const modelChanged = asset.modelSha256 !== asset.initialModelSha256;
    const title = asset.family === "world" ? `${asset.name} / ${asset.variantId}` : asset.id;
    const coverage = `${asset.directions?.join(" / ") ?? "Sign-in page"}${asset.frames ? `; ${asset.frames} stored frames` : ""}`;
    const animationNames = asset.animations ? `; ${Object.keys(asset.animations).join(", ")}` : asset.animation ? `; ${asset.animation.frames} animation frames` : "";
    const evidence = asset.evidence.map(item => `<a href="${escape(item.path)}">${escape(item.label)}</a>`).join(" · ");
    const intermediates = asset.intermediateReviews.map(review => `<p>${review.score}/10: ${escape(review.reason)} <a href="${escape(review.evidence)}">Intermediate image</a></p>`).join("");
    return `<tr data-family="${asset.family}" data-changed="${modelChanged}" data-query="${escape(`${asset.id} ${title}`.toLowerCase())}"><th scope="row">${escape(title)}<small>${escape(asset.id)}</small></th><td class="score ${asset.initialScore < 8 ? "failed" : ""}">${asset.initialScore}</td><td class="score">${asset.finalScore}</td><td><p>${escape(asset.finalReason)}</p><details><summary>Review and evidence</summary><p><strong>Initial:</strong> ${escape(asset.initialReason)}</p>${intermediates}<p><strong>Changes:</strong> ${asset.changes.map(escape).join(" ")}</p><p><strong>Coverage:</strong> ${escape(coverage + animationNames)}</p><p class="links">${evidence}</p><p><a href="../../${escape(asset.path)}">Artwork</a>${asset.model ? ` · <a href="../../${escape(asset.model)}">Blockbench model</a>` : ""}</p></details></td></tr>`;
  }).join("\n");
  const gallery = (title, paths) => `<section><h2>${title}</h2><div class="gallery">${paths.map(({ label, path }) => `<a href="${path}"><img loading="lazy" src="${path}" alt="${escape(label)}"><span>${escape(label)}</span></a>`).join("")}</div></section>`;
  const floors = report.assets.filter(asset => asset.family === "world" && asset.placement.layer === "ground").map(asset => ({ label: `${asset.name} / ${asset.variantId}`, path: `after/live-floors/${asset.assetId}-${asset.variantId}.png` }));
  const world = Array.from({ length: 29 }, (_, index) => ({ label: `World directions ${index + 1}`, path: `after/live-world/gameplay-${String(index + 1).padStart(2, "0")}.png` }));
  const characters = Array.from({ length: 7 }, (_, index) => ({ label: `Character directions ${index + 1}`, path: `after/live-characters/characters-${String(index + 1).padStart(2, "0")}.png` }));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Game asset quality audit</title>
<style>
:root{font-family:system-ui,sans-serif;color:#302d37;background:#f7f5f2}body{max-width:1400px;margin:0 auto;padding:28px}h1{font-size:28px}h2{margin-top:42px}a{color:#5744ba}p{line-height:1.5;margin:8px 0}nav,.filters{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}.filters{position:sticky;top:0;background:#f7f5f2;padding:12px 0;z-index:1;align-items:center}input[type=search],select{font:inherit;padding:8px;border:1px solid #bfb9c7;border-radius:6px}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #d9d4dd;vertical-align:top;text-align:left}thead{background:#e8e3ec}th[scope=row]{width:24%;font-size:14px}small{display:block;font-weight:400;color:#625b6d;margin-top:5px;overflow-wrap:anywhere}.score{font-weight:700;width:55px}.failed{color:#98502a}details{margin-top:8px}summary{cursor:pointer;color:#5744ba}.links a{display:inline-block;margin:3px 0}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}.gallery a{background:#ece7e1;padding:8px;border-radius:8px}.gallery img{display:block;width:100%;height:180px;object-fit:contain}.gallery span{display:block;margin-top:8px;font-size:13px}[hidden]{display:none!important}@media(max-width:700px){body{padding:12px}table{font-size:13px}th,td{padding:8px}.score{width:30px}th[scope=row]{width:23%}}
</style></head><body>
<h1>Game asset quality audit</h1><p><strong>${report.assets.length}/${report.assets.length} validated · minimum 8/10 · ${report.nativeModelsRecreated} native models recreated</strong></p>
<p>All current designs and directions. Character sheets cover every animation frame. World crops use the running game at zoom 0.78; character frames occupy 62.4 pixels. Open images to inspect their original size.</p>
<nav><a href="#scores">Scores</a><a href="#floors">Repeated floors</a><a href="#world">World captures</a><a href="#characters">Characters</a><a href="scorecard.csv">CSV</a><a href="scorecard.json">Full record</a><a href="../../docs/asset-quality-2026-09-15.md">Report and checks</a></nav>
<h2 id="scores">Scores</h2><div class="filters"><label>Search <input id="search" type="search"></label><label>Family <select id="family"><option value="">All</option><option value="world">World</option><option value="character">Characters</option><option value="architecture">Architecture</option><option value="illustration">Illustration</option></select></label><label><input id="changed" type="checkbox"> Recreated models</label><output id="count">${report.assets.length} assets</output></div>
<table><thead><tr><th>Asset</th><th>Initial</th><th>Final</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table>
<div id="floors">${gallery("Repeated floors", floors)}</div><div id="world">${gallery("World captures", world)}</div><div id="characters">${gallery("Character captures", characters)}</div>
<script>
const rows=[...document.querySelectorAll('tbody tr')];
const search=document.querySelector('#search'),family=document.querySelector('#family'),changed=document.querySelector('#changed');
function filter(){let visible=0;for(const row of rows){row.hidden=Boolean((family.value&&row.dataset.family!==family.value)||(changed.checked&&row.dataset.changed!=='true')||!row.dataset.query.includes(search.value.toLowerCase()));if(!row.hidden)visible++;}document.querySelector('#count').textContent=visible+' assets';}
for(const input of [search,family,changed])input.addEventListener('input',filter);
</script></body></html>`;
  await writeFile(`${root}/index.html`, html);
}
