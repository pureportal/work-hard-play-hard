import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, process.argv[2] ?? "artifacts/performance-investigation-2026-09-17");
await mkdir(output, { recursive: true });
const dist = resolve(output, "client");
const manifest = JSON.parse(await readFile(resolve(dist, ".vite/manifest.json"), "utf8"));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  initial.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit(entry);
const chunks = [];
for (const key of Object.keys(manifest)) {
  if (!manifest[key].file.endsWith(".js")) continue;
  const bytes = await readFile(resolve(dist, manifest[key].file));
  chunks.push({ name: key, file: manifest[key].file, initial: initial.has(key), bytes: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length });
}
const imageManifest = JSON.parse(await readFile(resolve(root, "scripts/images/manifest.json"), "utf8"));
const groups = {};
for (const record of Object.values(imageManifest)) {
  const group = groups[record.group] ??= { count: 0, originalBytes: 0, deliveryBytes: 0, previewBytes: 0, decodedDeliveryBytes: 0 };
  group.count++;
  group.originalBytes += record.originalBytes;
  group.deliveryBytes += record.image.bytes;
  group.previewBytes += (record.previews ?? []).reduce((sum, image) => sum + image.bytes, 0);
  group.decodedDeliveryBytes += record.image.width * record.image.height * 4;
}
const sourceHashes = {};
async function hashDirectory(directory, imagesOnly = false) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, file.name);
    if (file.isDirectory()) await hashDirectory(path, imagesOnly);
    else if (!imagesOnly || /\.(png|webp|jpg|jpeg)$/.test(file.name)) sourceHashes[relative(root, path).replaceAll("\\", "/")] = createHash("sha256").update(await readFile(path)).digest("hex");
  }
}
for (const directory of ["apps/client/src", "apps/server/src", "packages/shared/src"]) await hashDirectory(resolve(root, directory));
await hashDirectory(resolve(root, "apps/client/public"), true);
const versions = {};
for (const [scope, names] of Object.entries({ client: ["react", "react-dom", "pixi.js", "vite"], server: ["fastify", "@fastify/websocket", "ws", "sharp", "@mikro-orm/core", "zod"] })) {
  const require = createRequire(resolve(root, `apps/${scope}/package.json`));
  for (const name of names) {
    const path = resolve(root, `apps/${scope}/node_modules/${name}/package.json`);
    versions[name] = JSON.parse(await readFile(path, "utf8")).version;
    require.resolve(name);
  }
}
const result = { collectedAt: new Date().toISOString(), node: process.version, versions,
  gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceMovementSpeed: (await readFile(resolve(root, "packages/shared/src/character.ts"), "utf8")).match(/CHARACTER_WALK_SPEED = (\d+)/)?.[1],
  initialJavaScript: chunks.filter(chunk => chunk.initial).reduce((total, chunk) => ({ bytes: total.bytes + chunk.bytes, gzip: total.gzip + chunk.gzip, brotli: total.brotli + chunk.brotli }), { bytes: 0, gzip: 0, brotli: 0 }),
  chunks: chunks.sort((a, b) => b.bytes - a.bytes), images: groups,
  imageManifestBytes: (await stat(resolve(root, "apps/client/src/optimized-images.json"))).size };
await writeFile(resolve(output, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
await writeFile(resolve(output, "source-hashes.json"), JSON.stringify(sourceHashes, null, 2) + "\n");
console.log(JSON.stringify({ ...result, chunks: result.chunks.filter(chunk => chunk.initial || chunk.bytes > 300000) }, null, 2));
