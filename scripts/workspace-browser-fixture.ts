import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "../apps/server/src/app.js";
import { MemoryDatabase } from "../apps/server/src/persistence/memory-database.js";

export async function startWorkspaceBrowserFixture(database = new MemoryDatabase()) {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_ADDRESS_MISSING");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const application = await createApplication({ database, clientUrl: origin, clientOrigins: [origin], exposeMagicLinks: true, exposeInvitationLinks: true });
  const directory = resolve(process.env.CLIENT_DIST ?? fileURLToPath(new URL("../apps/client/dist", import.meta.url)));
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".wasm": "application/wasm" };
  application.app.get("/*", async (request, reply) => {
    const pathname = new URL(request.url, origin).pathname;
    const path = resolve(directory, pathname === "/" ? "index.html" : `.${decodeURIComponent(pathname)}`);
    if (!path.startsWith(directory + sep)) return reply.code(404).send();
    try {
      return reply.type(types[extname(path)] ?? "application/octet-stream").send(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return reply.code(404).send();
      throw error;
    }
  });
  try {
    await application.app.listen({ host: "127.0.0.1", port });
    return { origin, application, close: () => application.app.close() };
  } catch (error) {
    await application.app.close();
    throw error;
  }
}
