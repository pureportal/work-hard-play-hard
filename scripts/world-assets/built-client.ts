import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

export async function installBuiltAssetClient(context: BrowserContext, distribution?: string): Promise<void> {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const dist = resolve(root, distribution ?? "apps/client/dist");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
  await context.route(url => url.origin === "http://127.0.0.1:5173" && !url.pathname.startsWith("/v1/"), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/src/world-asset-artwork.json") {
      await route.fulfill({ contentType: "text/javascript", body: `export default ${await readFile(resolve(root, "apps/client/src/world-asset-artwork.json"), "utf8")};` });
      return;
    }
    const file = resolve(dist, url.pathname === "/" ? "index.html" : `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(dist + sep)) throw new Error("Asset review path is outside the client build");
    await route.fulfill({ body: await readFile(file), contentType: types[extname(file)] ?? "application/octet-stream" });
  });
}
