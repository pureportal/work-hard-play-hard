import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const [assetId, jobId] = process.argv.slice(2);
const referenceSize = Number(process.argv[4] ?? 256);
if (![168, 256].includes(referenceSize)) throw new Error("Invalid reference size");
if (!/^[a-z0-9-]+$/.test(assetId) || !/^[a-f0-9-]+$/.test(jobId)) throw new Error("Invalid asset or job ID");
const response = await fetch(`https://api.pixellab.ai/mcp/images/${jobId}/download`);
if (!response.ok) throw new Error(`PixelLab download failed: ${response.status}`);
const input = Buffer.from(await response.arrayBuffer());
const directory = new URL("./sources/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL(`${assetId}-original.png`, directory), input);
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const crop = manifest.generations.find((entry) => entry.jobId === jobId)?.crop;
for (let index = 0; index < data.length; index += 4) {
  const x = index / 4 % info.width;
  const y = Math.floor(index / 4 / info.width);
  if (crop && (x < crop.x || y < crop.y || x >= crop.x + crop.width || y >= crop.y + crop.height)) data[index + 3] = 0;
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  if (red > 150 && blue > 140 && green < Math.min(red, blue) * 0.55) data[index + 3] = 0;
}
const source = sharp(data, { raw: info });
await source.clone().png().toFile(fileURLToPath(new URL(`${assetId}.png`, directory)));
const reference = await source.resize(referenceSize, referenceSize, { kernel: "nearest" }).png().toBuffer();
await writeFile(new URL(`${assetId}-reference-${referenceSize}.png`, directory), reference);
process.stdout.write(reference.toString("base64"));
