import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const [assetId] = process.argv.slice(2);
const input = await readFile(new URL(`./sources/${assetId}/rotation-source.png`, import.meta.url));
const frames = [];
for (const [index, angle] of [0, 90, 180, 270].entries()) {
  frames.push({ input: await sharp(input).rotate(angle).png().toBuffer(), left: index % 2 * 256, top: Math.floor(index / 2) * 256 });
}
const guide = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ff00ff" } }).composite(frames).png().toBuffer();
await writeFile(new URL(`./sources/${assetId}/turn-guide.png`, import.meta.url), guide);
process.stdout.write(guide.toString("base64"));
