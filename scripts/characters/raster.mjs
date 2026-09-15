import { createRequire } from "node:module";

export const sharp = createRequire(new URL("../../apps/server/package.json", import.meta.url))("sharp");
