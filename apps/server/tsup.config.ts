import { readdirSync } from "node:fs";
import { parse } from "node:path";
import { defineConfig } from "tsup";

const migrationEntries = Object.fromEntries(
  readdirSync("src/migrations")
    .filter((fileName) => /^Migration.+\.ts$/.test(fileName))
    .map((fileName) => [`migrations/${parse(fileName).name}`, `src/migrations/${fileName}`]),
);

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "avatar-image-worker": "src/avatar/avatar-image-worker.ts",
    ...migrationEntries,
  },
  format: ["esm"],
  platform: "node",
  target: "node24",
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ["@workhard/shared"],
});
