import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createUpdaterManifest(assetDirectory, version, repository) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`Invalid repository: ${repository}`);
  }

  const assets = readdirSync(assetDirectory);
  const platforms = {};
  for (const [target, match] of [
    ["linux-x86_64-deb", (name) => name.endsWith("_amd64.deb")],
    ["linux-x86_64-appimage", (name) => name.endsWith("_amd64.AppImage")],
    ["windows-x86_64-nsis", (name) => name.endsWith("_x64-setup.exe")],
  ]) {
    const matches = assets.filter(match);
    if (matches.length !== 1) {
      throw new Error(`Expected one ${target} updater package, found ${matches.length}`);
    }
    const name = matches[0];
    if (!name.startsWith(`Northstar_${version}_`)) {
      throw new Error(`${name} does not match release ${version}`);
    }
    const signature = readFileSync(join(assetDirectory, `${name}.sig`), "utf8").trim();
    if (!signature) {
      throw new Error(`Updater signature is empty: ${name}.sig`);
    }
    platforms[target] = {
      url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`,
      signature,
    };
  }
  const macArchives = assets.filter((name) => /_(aarch64|x86_64)\.app\.tar\.gz$/.test(name));
  if (macArchives.length !== 1) {
    throw new Error(`Expected one macOS updater package, found ${macArchives.length}`);
  }
  const macName = macArchives[0];
  if (!macName.startsWith(`Northstar_${version}_`)) {
    throw new Error(`${macName} does not match release ${version}`);
  }
  const macSignature = readFileSync(join(assetDirectory, `${macName}.sig`), "utf8").trim();
  if (!macSignature) {
    throw new Error(`Updater signature is empty: ${macName}.sig`);
  }
  const macArch = macName.match(/_(aarch64|x86_64)\.app\.tar\.gz$/)[1];
  platforms[`darwin-${macArch}-app`] = {
    url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(macName)}`,
    signature: macSignature,
  };
  return { version, platforms };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [directory, version, repository] = process.argv.slice(2);
  if (!directory || !version || !repository) {
    throw new Error("Usage: node scripts/create-updater-manifest.mjs ASSET_DIRECTORY VERSION REPOSITORY");
  }
  const manifest = createUpdaterManifest(directory, version, repository);
  writeFileSync(join(directory, "updater.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Created ${basename(directory)}/updater.json for v${version}`);
}
