import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
const originals = new URL("../../apps/landing/artwork/", import.meta.url);
const output = new URL("../../apps/landing/src/media/", import.meta.url);
const fullOutput = new URL("../../apps/landing/public/screenshots/", import.meta.url);
const crops = JSON.parse(await readFile(new URL("crops.json", originals), "utf8"));
const check = process.argv.includes("--check");
assert(process.argv.slice(2).every(argument => argument === "--check"));
const manifest = {};
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
if (!check) await Promise.all([mkdir(output, { recursive: true }), mkdir(fullOutput, { recursive: true })]);

async function convert(name, pipeline, source, original) {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const destination = new URL(name, name.endsWith("-full.webp") ? fullOutput : output);
  if (check) assert.equal(hash(await readFile(destination)), hash(data), `Stale landing image: ${name}`);
  else await writeFile(destination, data);
  manifest[name] = { source, sourceHash: hash(original), sha256: hash(data), width: info.width, height: info.height, bytes: data.length };
}

for (const scene of ["office", "build", "avatar", "whiteboard", "chess"]) {
  const source = `${scene}.png`;
  const original = await readFile(new URL(source, originals));
  await convert(`${scene}-full.webp`, sharp(original).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 86, effort: 6 }), source, original);
  if (scene === "avatar") continue;
  for (const width of [640, 1280]) {
    const pipeline = sharp(original);
    if (crops[scene]) pipeline.extract(crops[scene]);
    const availableWidth = crops[scene]?.width ?? (await sharp(original).metadata()).width;
    assert(availableWidth >= width, `${scene}: preview would upscale the original`);
    await convert(`${scene}-${width}.webp`, pipeline.resize({ width }).webp({ quality: 84, effort: 6 }), source, original);
  }
}

for (const outfit of ["frog", "sunset", "starlight"]) {
  const source = `character-${outfit}.png`;
  const original = await readFile(new URL(source, originals));
  await convert(`character-${outfit}.webp`, sharp(original).webp({ lossless: true, effort: 6 }), source, original);
}

const illustration = await readFile(new URL("office-illustration.png", originals));
for (const width of [768, 1536]) {
  await convert(`office-illustration-${width}.webp`, sharp(illustration).resize({ width }).webp({ quality: 85, effort: 6 }), "office-illustration.png", illustration);
}

for (const game of ["falling-blocks", "tic-tac-toe"]) {
  const source = `${game}.png`;
  const original = await readFile(new URL(source, originals));
  await convert(`${game}-full.webp`, sharp(original).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 86, effort: 6 }), source, original);
  await convert(`${game}-640.webp`, sharp(original).resize({ width: 640 }).webp({ quality: 86, effort: 6 }), source, original);
}

for (const [name, path, direction] of [
  ["arcade", "equipment-arcade/violet.png", 1],
  ["plant", "plant-monstera/sage.png", 0],
  ["coffee", "decor-coffee/coral.png", 0],
]) {
  const source = `../../client/public/world-assets/${path}`;
  const original = await readFile(new URL(source, originals));
  const pipeline = sharp(original);
  const metadata = await pipeline.metadata();
  const frameWidth = metadata.width / 4;
  const frame = await pipeline.extract({ left: frameWidth * direction, top: 0, width: frameWidth, height: metadata.height }).toBuffer();
  await convert(`prop-${name}.webp`, sharp(frame).trim().resize({ height: name === "arcade" ? 420 : 240, withoutEnlargement: true }).webp({ lossless: true, effort: 6 }), source, original);
}

const manifestPath = new URL("media-manifest.json", originals);
if (check) assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
else await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${check ? "Verified" : "Optimized"} ${Object.keys(manifest).length} landing images: ${Math.round(Object.values(manifest).reduce((sum, image) => sum + image.bytes, 0) / 1024)} KiB. Originals preserved.`);
