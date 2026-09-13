import { createRequire } from "node:module";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
for (const file of process.argv.slice(2)) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaqueMagenta = 0;
  let transparent = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) transparent++;
    if (data[index + 3] > 0 && data[index] > 100 && data[index + 2] > 70 && data[index + 1] < Math.min(data[index], data[index + 2]) * 0.65) opaqueMagenta++;
  }
  console.log({ file, width: info.width, height: info.height, channels: info.channels, opaqueMagenta, transparent, first: Array.from(data.subarray(0, 4)) });
}
