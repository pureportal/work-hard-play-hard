import { readFile, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distribution = fileURLToPath(new URL("../dist-native/", import.meta.url));
const images = JSON.parse(await readFile(new URL("../src/optimized-images.json", import.meta.url), "utf8"));
const sources = Object.keys(images).map(source => {
  const path = resolve(distribution, `.${source}`);
  const relativePath = relative(distribution, path);
  if (!source.startsWith("/") || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Image source is outside the native build: ${source}`);
  }
  return path;
});

await Promise.all(sources.map(source => unlink(source)));
console.log(`Excluded ${sources.length} original images from the native bundle; optimized images are retained.`);
