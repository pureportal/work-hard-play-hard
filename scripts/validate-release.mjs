import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson("package.json");
const clientPackage = readJson("apps/client/package.json");
const clientCargo = readFile("apps/client/src-tauri/Cargo.toml");
const clientCargoLock = readFile("apps/client/src-tauri/Cargo.lock");
const tauriConfig = readJson("apps/client/src-tauri/tauri.conf.json");
const clientScripts = clientPackage.scripts ?? {};
const versions = new Map([
  ["package.json", rootPackage.version],
  ["apps/client/package.json", clientPackage.version],
  ["apps/landing/package.json", readJson("apps/landing/package.json").version],
  ["apps/server/package.json", readJson("apps/server/package.json").version],
  ["packages/shared/package.json", readJson("packages/shared/package.json").version],
  ["apps/client/src-tauri/Cargo.toml", cargoPackageValue(clientCargo, "version")],
  [
    "apps/client/src-tauri/Cargo.lock#northstar-client",
    cargoLockPackageVersion(clientCargoLock, "northstar-client"),
  ],
  ["apps/client/src-tauri/tauri.conf.json", tauriConfig.version],
]);

if (new Set(versions.values()).size !== 1) {
  throw new Error(
    `Release versions must match:\n${[...versions].map(([path, version]) => `- ${path}: ${version}`).join("\n")}`,
  );
}

const version = rootPackage.version;
const parsedVersion = parseSemver(version);
expectEqual(tauriConfig.productName, "Northstar", "Tauri product name");
expectEqual(tauriConfig.mainBinaryName, "Northstar", "Tauri main binary name");
expectEqual(tauriConfig.identifier, "io.pureportal.northstar", "Tauri application identifier");
expectEqual(tauriConfig.bundle?.android?.minSdkVersion, 24, "Android minimum SDK");

for (const target of ["aarch64", "armv7", "x86_64"]) {
  if (!clientScripts["android:build"]?.includes(target)) {
    throw new Error(`Android release build is missing the ${target} target`);
  }
}
for (const option of ["--apk", "--ci"]) {
  if (!clientScripts["android:build"]?.includes(option)) {
    throw new Error(`Android release build is missing ${option}`);
  }
}
if (clientScripts["android:build"]?.includes("i686")) {
  throw new Error("Android release build includes the redundant i686 target");
}
if (!clientScripts["android:init"]?.includes("configure-android.mjs")) {
  throw new Error("Android initialization must configure the generated project");
}
if (!clientScripts["android:sign"]?.includes("sign-android-apk.mjs")) {
  throw new Error("Android signing must use the verified signing script");
}
if (!clientScripts["android:release"]?.includes("android:sign")) {
  throw new Error("Android release build must sign the APK");
}
for (const relativePath of [
  ".dockerignore",
  ".env.example",
  "apps/client/Dockerfile",
  "apps/client/nginx.conf",
  "apps/client/scripts/configure-android.mjs",
  "apps/client/scripts/sign-android-apk.mjs",
  "apps/landing/Dockerfile",
  "apps/server/Dockerfile",
  "compose.yaml",
  ".github/workflows/ci.yml",
  ".github/workflows/client-packaging.yml",
  ".github/workflows/release.yml",
]) {
  if (!existsSync(join(repoRoot, relativePath))) {
    throw new Error(`Release file is missing: ${relativePath}`);
  }
}

const trackedAndroidFiles = git(["ls-files", "--", "apps/client/src-tauri/gen"]);
if (trackedAndroidFiles) {
  throw new Error("Generated Tauri mobile files must not be tracked by Git");
}

const baseSha = argumentValue("--base");
const headSha = git(["rev-parse", "HEAD"]);
const tag = `v${version}`;
const tagCommit = optionalGit(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
let previousVersion = null;
let versionChanged = false;

if (baseSha && !/^0{40}$/.test(baseSha)) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha)) {
    throw new Error(`Release base must be a full commit SHA: ${baseSha}`);
  }
  previousVersion = JSON.parse(git(["show", `${baseSha}:package.json`])).version;
  const comparison = compareSemver(parsedVersion, parseSemver(previousVersion));
  versionChanged = version !== previousVersion;
  if (versionChanged && comparison <= 0) {
    throw new Error(`Project version must increase from ${previousVersion}; received ${version}`);
  }
}

const release = baseSha !== null && (versionChanged || tagCommit === null);
if (release && tagCommit && tagCommit !== headSha) {
  throw new Error(`Tag ${tag} already points to ${tagCommit}, not ${headSha}`);
}

writeOutputs({
  prerelease: String(parsedVersion.prerelease.length > 0),
  release: String(release),
  sha: headSha,
  tag,
  version,
});

if (previousVersion === null) {
  console.log(`Release configuration is valid for ${tag}`);
} else if (release && versionChanged) {
  console.log(`Release ${tag} detected from v${previousVersion}`);
} else if (release) {
  console.log(`Release ${tag} has not been published yet`);
} else {
  console.log(`Project version remains ${tag}; publishing is skipped`);
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1]?.trim();
  if (!value) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function readFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function cargoPackageValue(manifest, name) {
  const packageHeader = manifest.match(/^\[package\]\s*$/m);
  if (packageHeader?.index === undefined) {
    throw new Error("Cargo package section is missing");
  }
  const packageContent = manifest.slice(packageHeader.index + packageHeader[0].length);
  const nextSectionOffset = packageContent.search(/^\[/m);
  const packageSection = packageContent.slice(
    0,
    nextSectionOffset === -1 ? packageContent.length : nextSectionOffset,
  );
  const value = packageSection.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"))?.[1];
  if (!value) {
    throw new Error(`Cargo package field is missing: ${name}`);
  }
  return value;
}

function cargoLockPackageVersion(lockFile, packageName) {
  const packageSection = lockFile
    .split(/^\[\[package\]\]\s*$/m)
    .find((section) => section.match(/^name\s*=\s*"([^"]+)"/m)?.[1] === packageName);
  if (!packageSection) {
    throw new Error(`Cargo lock package is missing: ${packageName}`);
  }
  const packageVersion = packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (!packageVersion) {
    throw new Error(`Cargo lock package version is missing: ${packageName}`);
  }
  return packageVersion;
}

function parseSemver(value) {
  if (typeof value !== "string" || value.includes("+")) {
    throw new Error(`Release version is not valid semantic versioning: ${value}`);
  }
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  );
  if (!match) {
    throw new Error(`Release version is not valid semantic versioning: ${value}`);
  }
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0"))) {
    throw new Error(`Numeric prerelease identifiers cannot contain leading zeroes: ${value}`);
  }
  return {
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease,
  };
}

function compareSemver(left, right) {
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] > right[field]) {
      return 1;
    }
    if (left[field] < right[field]) {
      return -1;
    }
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) {
    return 1;
  }
  if (left.prerelease.length > 0 && right.prerelease.length === 0) {
    return -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function optionalGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0) {
    return result.stdout.trim();
  }
  if (result.status === 128) {
    return null;
  }
  throw new Error(result.stderr.trim() || `git exited with status ${result.status}`);
}

function writeOutputs(outputs) {
  const githubOutput = process.env.GITHUB_OUTPUT?.trim();
  if (!githubOutput) {
    return;
  }
  appendFileSync(
    githubOutput,
    Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n") + "\n",
  );
}
