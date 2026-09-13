import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function pixelLabImagePath(url) {
  if (typeof url !== "string" || !/^https:\/\/(api|backblaze)\.pixellab\.ai\//.test(url)) throw new Error("Expected a PixelLab source URL");
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return fileURLToPath(new URL(`./raw/${hash}.png`, import.meta.url));
}

export async function cachePixelLabImage(url) {
  const file = pixelLabImagePath(url);
  try {
    await readFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PixelLab download failed: ${response.status}`);
    await mkdir(new URL("./raw/", import.meta.url), { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
}
