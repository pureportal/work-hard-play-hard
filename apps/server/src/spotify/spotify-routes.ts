import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthRateLimiter } from "../auth/rate-limiter.js";
import { SpotifyError } from "./spotify-client.js";
import type { SpotifyService } from "./spotify-service.js";

const callbackSchema = z.object({ state: z.string().min(1).max(128), code: z.string().max(2048).optional(), error: z.string().max(128).optional() });
const sharingSchema = z.object({ sharing: z.boolean() }).strict();
const jamSchema = z.object({ url: z.string().trim().min(1).max(1024).nullable() }).strict();
const playSchema = z.object({ targetUserId: z.string().min(1).max(255), trackId: z.string().regex(/^[a-zA-Z0-9]{22}$/) }).strict();
const COOKIE = "whph_spotify_state";

export async function registerSpotifyRoutes(app: FastifyInstance, options: {
  service: SpotifyService;
  clientUrl: string;
  authenticate: (request: FastifyRequest) => { userId: string; sessionToken: string } | undefined;
}): Promise<void> {
  await app.register(async (routes) => {
    const limiter = new AuthRateLimiter();
    routes.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
      const session = options.authenticate(request);
      if (!session) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in and connect Spotify again." });
      if (request.method !== "GET") {
        if (request.method !== "DELETE" && request.headers["content-type"]?.split(";")[0] !== "application/json") {
          return reply.code(415).send({ code: "JSON_REQUIRED", message: "Send a JSON request." });
        }
        const retryAfter = limiter.consume("spotify", session.userId, 20, 60_000);
        if (retryAfter) return reply.code(429).header("retry-after", String(retryAfter)).send({ code: "RATE_LIMITED", message: "Too many attempts. Try again shortly." });
      }
    });
    routes.setErrorHandler((error, request, reply) => {
      if (error instanceof SpotifyError) return reply.code(error.status).send({ code: error.code, message: error.message });
      if (error instanceof z.ZodError) return reply.code(400).send({ code: "SPOTIFY_INPUT_INVALID", message: "Check the Spotify settings and try again." });
      request.log.error({ err: error }, "Spotify request failed");
      return reply.code(500).send({ code: "SPOTIFY_FAILED", message: "Spotify settings could not be saved. Try again." });
    });

    routes.get("/v1/spotify", async (request) => options.service.status(options.authenticate(request)!.userId));
    routes.post("/v1/spotify/connect", { logLevel: "silent" }, async (request, reply) => {
      const session = options.authenticate(request)!;
      const result = options.service.beginConnection(session.userId, session.sessionToken);
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      reply.header("set-cookie", `${COOKIE}=${result.state}; Path=/v1/spotify/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
      return { url: result.url };
    });
    routes.get("/v1/spotify/callback", { logLevel: "silent" }, async (request, reply) => {
      const returnUrl = new URL(options.clientUrl);
      try {
        const query = callbackSchema.parse(request.query);
        const session = options.authenticate(request)!;
        const cookie = request.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
        const verifier = options.service.authorization.consume(query.state, cookie, session.userId, session.sessionToken);
        if (query.error === "access_denied") returnUrl.searchParams.set("spotify", "cancelled");
        else {
          if (!query.code || query.error) throw new Error("Spotify authorization failed");
          await options.service.completeConnection(session.userId, query.code, verifier,
            () => options.authenticate(request)?.sessionToken === session.sessionToken);
          returnUrl.searchParams.set("spotify", "connected");
        }
      } catch {
        returnUrl.searchParams.set("spotify", "error");
      }
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      reply.header("set-cookie", `${COOKIE}=; Path=/v1/spotify/callback; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
      return reply.redirect(returnUrl.toString());
    });
    routes.delete("/v1/spotify", async (request) => options.service.disconnect(options.authenticate(request)!.userId));
    routes.put("/v1/spotify/sharing", async (request) => options.service.setSharing(options.authenticate(request)!.userId, sharingSchema.parse(request.body).sharing));
    routes.put("/v1/spotify/jam", async (request) => options.service.setJam(options.authenticate(request)!.userId, jamSchema.parse(request.body).url));
    routes.post("/v1/spotify/play", async (request) => {
      const body = playSchema.parse(request.body);
      await options.service.playSameSong(options.authenticate(request)!.userId, body.targetUserId, body.trackId);
      return { played: true };
    });
  });
}
