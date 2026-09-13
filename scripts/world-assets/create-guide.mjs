import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const asset = catalog.assets.find((entry) => entry.id === process.argv[2]);
if (!asset) throw new Error("Unknown guide asset");
const cells = new Map();
for (const part of asset.footprint) {
  const points = part.cells ?? Array.from({ length: part.range.width * part.range.height }, (_, index) => ({
    x: part.range.x + index % part.range.width,
    y: part.range.y + Math.floor(index / part.range.width),
  }));
  for (const point of points) cells.set(`${point.x}:${point.y}`, point);
}
const width = Math.max(...Array.from(cells.values(), (cell) => cell.x)) + 1;
const height = Math.max(...Array.from(cells.values(), (cell) => cell.y)) + 1;
const scale = Math.floor(208 / Math.max(width, height));
const theme = catalog.themeSets.find((entry) => entry.id === asset.themeSetId).variants[0];
const panels = [0, 1, 2, 3].map((index) => {
  const rotatedWidth = index % 2 ? height : width;
  const rotatedHeight = index % 2 ? width : height;
  const offsetX = index % 2 * 256 + (256 - rotatedWidth * scale) / 2;
  const offsetY = Math.floor(index / 2) * 256 + (256 - rotatedHeight * scale) / 2;
  return Array.from(cells.values(), ({ x, y }) => {
    const points = [[x, y], [height - 1 - y, x], [width - 1 - x, height - 1 - y], [y, width - 1 - x]];
    const point = points[index];
    return `<rect x="${offsetX + point[0] * scale}" y="${offsetY + point[1] * scale}" width="${scale}" height="${scale}" fill="${theme.color}"/>`;
  }).join("");
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ff00ff"/>${panels}</svg>`;
process.stdout.write((await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64"));
