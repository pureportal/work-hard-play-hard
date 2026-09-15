import { mkdir, readFile, access, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../../apps/server/package.json", import.meta.url))("sharp");
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) ?? "artifacts/category-expansion-2026-09-15";
const catalog = JSON.parse(await readFile("packages/shared/src/asset-catalog.json", "utf8"));
const artwork = JSON.parse(await readFile("apps/client/src/world-asset-artwork.json", "utf8"));
await mkdir(`${output}/sheets`, { recursive: true });
const reports = [];
for (const category of catalog.categories) {
  const assets = [];
  for (const asset of catalog.assets.filter(asset => asset.category === category.id)) {
    const first = catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants[0];
    try { await access(`${output}/gameplay/${asset.id}-${first.id}.png`); assets.push(asset); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (let start = 0; start < assets.length; start += 4) {
    const group = assets.slice(start, start + 4), composites = [];
    let top = 0;
    for (const asset of group) for (const variant of catalog.themeSets.find(theme => theme.id === asset.themeSetId).variants) {
      const views = artwork[asset.id].variants[variant.id].bounds;
      const offset = asset.placement.layer === "surface" ? artwork["table-workbench"].surfaceHeight / Math.SQRT2 * 0.78 : 0;
      const y = Math.max(0, Math.floor(112 * 0.78 + Math.min(...views.map(view => view.y)) * 0.78 - offset - 5));
      const bottom = asset.kind === "floor-tile" ? 248 : Math.min(250, Math.ceil(112 * 0.78 + Math.max(...views.map(view => view.y + view.height)) * 0.78 - offset + 5));
      const height = bottom - y;
      const label = `${asset.name} · ${variant.name} · 0 / 90 / 180 / 270°`;
      composites.push({ input: Buffer.from(`<svg width="798" height="20" xmlns="http://www.w3.org/2000/svg"><text x="8" y="15" font-family="Arial" font-size="12" fill="#514552">${label}</text></svg>`), left: 0, top });
      composites.push({ input: await sharp(await readFile(`${output}/gameplay/${asset.id}-${variant.id}.png`)).extract({ left: 0, top: y, width: 798, height }).png().toBuffer(), left: 0, top: top + 22 });
      top += height + 29;
    }
    const name = `${category.id}-${start / 4 + 1}.png`;
    await sharp({ create: { width: 798, height: top, channels: 4, background: "#eee8df" } }).composite(composites).png().toFile(`${output}/sheets/${name}`);
    reports.push({ sheet: name, assets: group.map(asset => asset.id) });
  }
}
await writeFile(`${output}/sheets/index.json`, JSON.stringify(reports, null, 2) + "\n");
console.log(`Created ${reports.length} sheets without resizing gameplay captures.`);
