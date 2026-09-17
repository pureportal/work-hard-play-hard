import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sharp } from "./raster.mjs";

const directory = resolve(process.argv[2] ?? "artifacts/seating");
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const groups = {
  seats: catalog.assets.filter(asset => asset.interactions?.length).flatMap(asset =>
    [...asset.interactions.map(seat => `${asset.id}-{rotation}-${seat.id}`), ...(asset.interactions.length > 1 ? [`${asset.id}-{rotation}-occupied`] : [])]),
  walking: catalog.assets.filter(asset => asset.interactions?.length).flatMap(asset =>
    ["behind", "front"].map(state => `${asset.id}-{rotation}-${state}`)),
};
await mkdir(`${directory}/review`, { recursive: true });
for (const [group, rows] of Object.entries(groups)) {
  for (let start = 0; start < rows.length; start += 5) {
    const tiles = [];
    for (const [row, name] of rows.slice(start, start + 5).entries()) for (const [column, rotation] of [0, 90, 180, 270].entries()) {
      const label = name.replace("{rotation}", rotation);
      tiles.push({ input: await readFile(`${directory}/${label}.png`), left: column * 280, top: row * 264 });
      tiles.push({ input: Buffer.from(`<svg width="280" height="24"><text x="140" y="16" text-anchor="middle" font-family="Arial" font-size="11">${label}</text></svg>`), left: column * 280, top: row * 264 + 240 });
    }
    await sharp({ create: { width: 1120, height: Math.min(5, rows.length - start) * 264, channels: 4, background: "#eee9e2" } })
      .composite(tiles).png().toFile(`${directory}/review/${group}-${start / 5 + 1}.png`);
  }
}
