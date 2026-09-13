import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("./generations.json", import.meta.url), "utf8"));
const catalog = JSON.parse(await readFile(new URL("../../packages/shared/src/asset-catalog.json", import.meta.url), "utf8"));
const artworkSources = JSON.parse(await readFile(new URL("./artwork-sources.json", import.meta.url), "utf8"));
if (process.argv.includes("--summary")) {
  const finished = Object.keys(artworkSources);
  const unfinished = catalog.assets.filter((asset) => !finished.includes(asset.id)).map((asset) => asset.id);
  const rotating = manifest.generations.filter((job) => job.stage === "rotations" && job.sourceCrop && job.status === "processing").map((job) => ({ assetId: job.assetId, objectId: job.objectId, ready: Boolean(job.directions) }));
  const sourceJobs = manifest.generations.filter((job) => ["source-sheet", "direction-sheet", "direction-repair"].includes(job.stage) && job.status === "processing").map((job) => ({ assetIds: job.assets?.map((asset) => asset.assetId) ?? [job.assetId], variantId: job.variantId, jobId: job.jobId }));
  console.log(JSON.stringify({ finished: finished.length, total: catalog.assets.length, unfinished, rotating, sourceJobs }));
  process.exit(0);
}
console.log(JSON.stringify({
  assets: catalog.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    variantId: catalog.themeSets.find((entry) => entry.id === asset.themeSetId).variants[0].id,
    sourceJobId: manifest.generations.findLast((entry) => entry.assetId === asset.id && entry.stage === "source" && entry.status === "accepted")?.jobId,
  })),
  jobs: manifest.generations.filter((entry) => entry.stage === "direction-sheet").map(({ assetId, jobId, variantId, status }) => ({ assetId, jobId, variantId, status })),
  sources: manifest.generations.filter((entry) => entry.stage === "source-sheet").flatMap((entry) => entry.assets.map((asset) => ({ ...asset, jobId: entry.jobId, status: asset.status ?? entry.status }))),
  rotations: manifest.generations.filter((entry) => entry.stage === "rotations" && entry.sourceCrop).map(({ assetId, jobId, objectId, status }) => ({ assetId, jobId, objectId, status })),
}));
