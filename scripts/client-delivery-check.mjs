import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

assert.equal(process.argv.length, 3, "Usage: node scripts/client-delivery-check.mjs <client-url>");
const origin = new URL(process.argv[2]);
const images = JSON.parse(await readFile(new URL("../apps/client/src/optimized-images.json", import.meta.url), "utf8"));

async function request(path) {
  return fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

let index;
for (const path of ["/", "/index.html", "/client-delivery-check"]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/, path);
  assert.match(response.headers.get("cache-control") ?? "", /\bno-cache\b/, path);
  const html = await response.text();
  if (path === "/") index = html;
  else assert.equal(html, index, path);
}

const entry = index.match(/<script\b[^>]*\bsrc="([^"]+)"/)[1];
const image = `/optimized-images/${images["/characters/blockbench/upper/satin.png"][0]}.webp`;
for (const [path, type] of [[entry, /javascript/], [image, /image\/webp/]]) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") ?? "", type, path);
  assert.match(response.headers.get("cache-control") ?? "", /max-age=31536000, immutable/, path);
  await response.arrayBuffer();
}

for (const path of ["/assets/client-delivery-missing.js", "/optimized-images/client-delivery-missing.webp"]) {
  const response = await request(path);
  assert.equal(response.status, 404, path);
  assert.match(response.headers.get("cache-control") ?? "", /\bno-store\b/, path);
  assert.notEqual(await response.text(), index, path);
}

console.log("Verified HTML revalidation, immutable assets, and uncached missing-asset responses.");
