const fs = require("node:fs/promises");
const path = require("node:path");
const { worldAssetSourceFiles } = require("./source-files.cjs");

async function generateNativeAssets(api, requested) {
  const workspace = path.resolve(__dirname, "../../..");
  const output = "scripts/world-assets/blockbench";
  const catalog = JSON.parse(await fs.readFile(path.join(workspace, "packages/shared/src/asset-catalog.json"), "utf8"));
  const manifestPath = path.join(__dirname, "renders/manifest.json");
  const source = (await Promise.all(worldAssetSourceFiles.map(async file => (await fs.readFile(path.join(__dirname, file), "utf8"))
    .replace(/^const \{.*\} = require\("\.\/.*"\);\r?\n/gm, "")
    .replace(/^module\.exports = .*;\r?\n?/gm, "")))).join("\n");
  const render = new Function("api", "catalog", "requested", "output", `${source}\nreturn renderWorldAssets(api, catalog, requested, output);`);
  const writeFile = async (relative, data, encoding) => {
    const target = path.resolve(workspace, relative);
    if (!target.startsWith(path.resolve(__dirname) + path.sep)) throw new Error("Blockbench output is outside the asset directory");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, encoding === "base64" ? Buffer.from(data, "base64") : data);
  };
  const results = [];
  for (const assetId of requested) {
    const previous = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const result = await render({ ...api, get Project() { return api.Project; }, writeFile }, catalog, [assetId], output);
    const generated = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    generated.results = [...previous.results.filter(entry => entry.assetId !== assetId && catalog.assets.some(asset => asset.id === entry.assetId)), ...generated.results];
    await fs.writeFile(manifestPath, JSON.stringify(generated, null, 2) + "\n");
    results.push({ assetId, ...result });
    await fs.writeFile(path.join(__dirname, "renders/native-generation.json"), JSON.stringify({ status: "running", requested, results }, null, 2) + "\n");
  }
  const report = { status: "complete", requested, results };
  await fs.writeFile(path.join(__dirname, "renders/native-generation.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

module.exports = { generateNativeAssets };
