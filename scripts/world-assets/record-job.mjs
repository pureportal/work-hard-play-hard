import { readFile, writeFile } from "node:fs/promises";

const file = new URL("./generations.json", import.meta.url);
const manifest = JSON.parse(await readFile(file, "utf8"));
const updates = JSON.parse(Buffer.from(process.argv[2], "base64").toString("utf8"));
for (const update of updates) {
  const index = manifest.generations.findIndex((entry) => entry.jobId === update.jobId);
  if (index < 0) manifest.generations.push(update);
  else manifest.generations[index] = { ...manifest.generations[index], ...update };
}
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Recorded ${updates.length} PixelLab jobs`);
