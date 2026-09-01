import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../src-tauri/gen/android/app/src/main/AndroidManifest.xml", import.meta.url),
);
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
if (missingPermissions.length > 0) {
  const configuredManifest = manifest.replace(
    internetPermission,
    [internetPermission, ...missingPermissions].join("\n    "),
  );
  await writeFile(manifestPath, configuredManifest);
}
