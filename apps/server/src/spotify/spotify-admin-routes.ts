import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WorkspaceStore } from "../store.js";
import type { SpotifyService } from "./spotify-service.js";

export const spotifyAppSettingsSchema = z.object({
  clientId: z.string().trim().max(128).regex(/^[a-zA-Z0-9]*$/),
  redirectUri: z.string().trim().max(2048),
}).strict().refine(({ clientId, redirectUri }) => {
  if (!clientId) return redirectUri === "";
  try {
    const url = new URL(redirectUri);
    return (url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/v1/spotify/callback";
  } catch { return false; }
});

export function registerSpotifyAdminRoutes(app: FastifyInstance, options: {
  store: WorkspaceStore; spotify: SpotifyService; encryptionKey: Buffer | undefined;
  authenticate: (request: FastifyRequest) => string | undefined; persist: () => Promise<void>;
}): void {
  const view = () => ({ ...(options.store.getSpotifyAppSettings() ?? { clientId: "", redirectUri: "" }), encryptionReady: Boolean(options.encryptionKey) });
  let updating = false;
  let appliedSettings = JSON.stringify(options.store.getSpotifyAppSettings());
  app.register(async (routes) => {
    routes.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store");
      const userId = options.authenticate(request);
      if (!userId) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
      if (!options.store.canManageGlobalSettings(userId)) return reply.code(403).send({ code: "FORBIDDEN", message: "Server administrator access is required." });
    });
    routes.get("/v1/admin/spotify", async () => view());
    routes.put("/v1/admin/spotify", async (request, reply) => {
      const parsed = spotifyAppSettingsSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: "SPOTIFY_SETTINGS_INVALID", message: "Enter a Client ID and an HTTPS redirect URI ending in /v1/spotify/callback." });
      if (updating) return reply.code(409).send({ code: "SETTINGS_BUSY", message: "Settings are being saved. Try again." });
      updating = true;
      const previous = options.store.getSpotifyAppSettings();
      try {
        if (appliedSettings === JSON.stringify(parsed.data)) return view();
        options.store.updateSpotifyAppSettings(parsed.data);
        try { await options.persist(); }
        catch (error) { options.store.updateSpotifyAppSettings(previous); throw error; }
        try {
          await options.spotify.configure(parsed.data.clientId && options.encryptionKey ? { ...parsed.data, encryptionKey: options.encryptionKey } : undefined);
          appliedSettings = JSON.stringify(parsed.data);
        } catch (error) {
          request.log.error(error, "Spotify configuration could not be applied");
          return reply.code(503).send({ code: "SPOTIFY_RESTART_FAILED", message: "Settings were saved, but Spotify could not restart. Save again to retry." });
        }
        return view();
      } finally { updating = false; }
    });
  });
}
