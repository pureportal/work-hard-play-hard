import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createUpdaterManifest } from "./create-updater-manifest.mjs";

test("maps signed installers to their package-specific update targets", () => {
  const directory = mkdtempSync(join(tmpdir(), "northstar-updater-"));
  try {
    for (const name of [
      "Northstar_12.0.0_amd64.deb",
      "Northstar_12.0.0_amd64.AppImage",
      "Northstar_12.0.0_x64-setup.exe",
      "Northstar_12.0.0_aarch64.app.tar.gz",
    ]) {
      writeFileSync(join(directory, name), "package");
      writeFileSync(join(directory, `${name}.sig`), `signed-${name}`);
    }
    const manifest = createUpdaterManifest(directory, "12.0.0", "pureportal/work-hard-play-hard");
    assert.equal(manifest.version, "12.0.0");
    assert.deepEqual(Object.keys(manifest.platforms), [
      "linux-x86_64-deb", "linux-x86_64-appimage", "windows-x86_64-nsis", "darwin-aarch64-app",
    ]);
    assert.equal(manifest.platforms["linux-x86_64-deb"].url,
      "https://github.com/pureportal/work-hard-play-hard/releases/download/v12.0.0/Northstar_12.0.0_amd64.deb");
    unlinkSync(join(directory, "Northstar_12.0.0_amd64.deb.sig"));
    assert.throws(() => createUpdaterManifest(directory, "12.0.0", "pureportal/work-hard-play-hard"));
    renameSync(join(directory, "Northstar_12.0.0_amd64.deb"), join(directory, "Northstar_112.0.0_amd64.deb"));
    writeFileSync(join(directory, "Northstar_112.0.0_amd64.deb.sig"), "signed-wrong-version");
    assert.throws(() => createUpdaterManifest(directory, "12.0.0", "pureportal/work-hard-play-hard"), /does not match release/);
  } finally {
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});
