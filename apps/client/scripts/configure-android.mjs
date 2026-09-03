import { cp, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../src-tauri/gen/android/app/src/main/AndroidManifest.xml", import.meta.url),
);
const iconSourcePath = fileURLToPath(new URL("../src-tauri/icons/android", import.meta.url));
const resourcePath = fileURLToPath(new URL("../src-tauri/gen/android/app/src/main/res", import.meta.url));
const internetPermission = '<uses-permission android:name="android.permission.INTERNET" />';
const requiredPermissions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
];
const manifest = await readFile(manifestPath, "utf8");

if (!manifest.includes(internetPermission)) {
  throw new Error("Generated Android manifest does not contain the expected INTERNET permission.");
}

const missingPermissions = requiredPermissions.filter((permission) => !manifest.includes(permission));
let configuredManifest = manifest.replace(
  /\s*<uses-feature android:name="android\.software\.leanback" android:required="false" \/>/,
  "",
).replace(
  /\s*<category android:name="android\.intent\.category\.LEANBACK_LAUNCHER" \/>/,
  "",
);
if (missingPermissions.length > 0) {
  configuredManifest = configuredManifest.replace(
    internetPermission,
    [internetPermission, ...missingPermissions].join("\n    "),
  );
}
if (!configuredManifest.includes('android:roundIcon="@mipmap/ic_launcher_round"')) {
  configuredManifest = configuredManifest.replace(
    'android:icon="@mipmap/ic_launcher"',
    'android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round"',
  );
}
if (configuredManifest.includes("leanback")) {
  throw new Error("Generated Android manifest still declares Android TV support.");
}
await writeFile(manifestPath, configuredManifest);
await cp(iconSourcePath, resourcePath, { recursive: true, force: true });
