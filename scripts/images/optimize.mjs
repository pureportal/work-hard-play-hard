import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import {
  sharp, publicRoot, generatedRoot, manifestFile, runtimeFile, characterRuntimeFile, worldRuntimeFile, webpOptions, previewOptions,
  digest, recipeHash, readImageSources, assertSamePixels,
} from "./sources.mjs";

sharp.concurrency(1);
const check = process.argv.includes("--check");
assert(process.argv.slice(2).every(argument => argument === "--check"), "Usage: node scripts/images/optimize.mjs [--check]");
const sources = await readImageSources();
let previous = {};
try { previous = JSON.parse(await readFile(manifestFile, "utf8")); }
catch (error) { if (check || error.code !== "ENOENT") throw error; }
if (!check) await mkdir(generatedRoot, { recursive: true });
const manifest = {}, runtime = {};
let generated = 0, completed = 0;

async function saveImage(pipeline) {
  const { data, info } = await pipeline.webp(webpOptions).toBuffer({ resolveWithObject: true });
  const hash = digest(data);
  const id = hash.slice(0, 24);
  await writeFile(new URL(`${id}.webp`, generatedRoot), data);
  return { id, sha256: hash, bytes: data.length, width: info.width, height: info.height };
}

async function checkImage(image) {
  assert(/^[a-f0-9]{24}$/.test(image.id), "Invalid optimized image ID");
  const buffer = await readFile(new URL(`${image.id}.webp`, generatedRoot));
  assert.equal(digest(buffer), image.sha256, `Optimized image changed: ${image.id}`);
  assert.equal(image.id, image.sha256.slice(0, 24));
  assert.equal(buffer.length, image.bytes);
  return buffer;
}

async function processSource(source) {
  const input = await readFile(new URL(source.path.slice(1), publicRoot));
  const sourceHash = digest(input), recipe = recipeHash(source);
  let record = previous[source.path];
  if (record?.sourceHash === sourceHash && record.recipe === recipe) {
    try { await Promise.all([record.image, ...record.previews ?? []].map(checkImage)); }
    catch (error) {
      if (check) throw error;
      console.log(`Regenerating invalid delivery copy: ${source.path}`);
      record = undefined;
    }
  } else record = undefined;
  assert(!check || record, `Missing or stale optimized image: ${source.path}. Run pnpm assets:optimize.`);
  if (!record) {
    const image = await saveImage(sharp(input));
    const previews = [];
    for (const frame of source.frames ?? []) {
      previews.push(await saveImage(sharp(input).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).resize(previewOptions)));
    }
    record = { group: source.group, sourceHash, recipe, originalBytes: input.length, image, ...(previews.length ? { previews } : {}) };
    generated++;
  }
  assert.equal(record.image.width, source.width, `${source.path}: width changed`);
  assert.equal(record.image.height, source.height, `${source.path}: height changed`);
  assert.equal(record.previews?.length ?? 0, source.frames?.length ?? 0, `${source.path}: previews missing`);
  if (check || record !== previous[source.path]) {
    const [original, optimized] = await Promise.all([
      sharp(input).ensureAlpha().raw().toBuffer(),
      sharp(await checkImage(record.image)).ensureAlpha().raw().toBuffer(),
    ]);
    assertSamePixels(original, optimized, source.path);
    for (const [index, preview] of (record.previews ?? []).entries()) {
      const frame = source.frames[index];
      const resized = await sharp(input).extract({ left: frame.x, top: frame.y, width: frame.width, height: frame.height }).resize(previewOptions).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(preview.width, resized.info.width);
      assert.equal(preview.height, resized.info.height);
      assertSamePixels(resized.data, await sharp(await checkImage(preview)).ensureAlpha().raw().toBuffer(), `${source.path}/${index}`);
    }
  }
  manifest[source.path] = record;
  runtime[source.path] = [record.image.id, ...(record.previews ?? []).map(image => image.id)];
  completed++;
  if (completed % 50 === 0 || completed === sources.length) console.log(`${check ? "Checked" : "Optimized"} ${completed}/${sources.length} originals`);
}

let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < sources.length) await processSource(sources[next++]);
}));
const sortedManifest = Object.fromEntries(sources.map(source => [source.path, { ...manifest[source.path], layoutHash: digest(JSON.stringify(source.frames ?? null)) }]));
const sortedRuntime = Object.fromEntries(sources.map(source => [source.path, runtime[source.path]]));
const characterRuntime = Object.fromEntries(sources.filter(source => source.group === "characters").map(source => [source.path, runtime[source.path]]));
const worldRuntime = Object.fromEntries(sources.filter(source => source.group !== "characters").map(source => [source.path, runtime[source.path]]));
if (check) {
  assert.deepEqual(Object.keys(previous).sort(), sources.map(source => source.path).sort(), "Optimized inventory differs from source inventory");
  assert.deepEqual(previous, sortedManifest, "Optimized source metadata is stale");
  assert.deepEqual(JSON.parse(await readFile(runtimeFile, "utf8")), sortedRuntime, "Runtime image manifest is stale");
  assert.deepEqual(JSON.parse(await readFile(characterRuntimeFile, "utf8")), characterRuntime, "Character image manifest is stale");
  assert.deepEqual(JSON.parse(await readFile(worldRuntimeFile, "utf8")), worldRuntime, "World image manifest is stale");
} else {
  await writeFile(manifestFile, JSON.stringify(sortedManifest, null, 2) + "\n");
  await writeFile(runtimeFile, JSON.stringify(sortedRuntime) + "\n");
  await writeFile(characterRuntimeFile, JSON.stringify(characterRuntime) + "\n");
  await writeFile(worldRuntimeFile, JSON.stringify(worldRuntime) + "\n");
  const retained = new Set(Object.values(runtime).flat());
  const obsolete = new Set(Object.values(previous).flatMap(record => [record.image, ...record.previews ?? []]).map(image => image.id).filter(id => !retained.has(id)));
  for (const id of obsolete) {
    assert(/^[a-f0-9]{24}$/.test(id), "Invalid obsolete image ID");
    await unlink(new URL(`${id}.webp`, generatedRoot));
  }
}
for (const group of ["world", "architecture", "characters"]) {
  const records = Object.values(manifest).filter(record => record.group === group);
  const originalBytes = records.reduce((sum, record) => sum + record.originalBytes, 0);
  const optimizedBytes = records.reduce((sum, record) => sum + record.image.bytes, 0);
  const previewBytes = records.reduce((sum, record) => sum + (record.previews ?? []).reduce((total, preview) => total + preview.bytes, 0), 0);
  console.log(JSON.stringify({ group, images: records.length, originalBytes, optimizedBytes, previewBytes, savingPercent: +(100 * (1 - optimizedBytes / originalBytes)).toFixed(2) }));
}
console.log(`${check ? "Verified" : "Generated"} lossless delivery images; ${generated} originals converted. Original files retained.`);
