import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { GITHUB_MAILROOM_VIEWS } from "@workhard/shared";
import { AuthRateLimiter } from "../auth/rate-limiter.js";
import { GitHubError } from "./github-error.js";
import { repositoryNameSchema } from "./github-mailroom.js";
import type { GitHubService } from "./github-service.js";

const callbackSchema = z.object({ state: z.string().min(1).max(128), code: z.string().min(1).max(2048).optional(), error: z.string().max(128).optional() });
const repositoriesSchema = z.object({ page: z.coerce.number().int().min(1).max(200).default(1) }).strict();
const mailroomSchema = z.object({ repository: repositoryNameSchema, view: z.enum(GITHUB_MAILROOM_VIEWS), cursor: z.string().min(1).max(256).optional() }).strict();
const COOKIE = "whph_github_state";

export async function registerGitHubRoutes(app: FastifyInstance, options: {
  service: GitHubService;
  clientUrl: string;
  secureCookie: boolean;
  authenticate: (request: FastifyRequest) => { userId: string; sessionToken: string } | undefined;
  canOpenTray: (userId: string, objectId: string) => boolean;
}): Promise<void> {
  await app.register(async (routes) => {
    const limiter = new AuthRateLimiter();
    routes.addHook("onRequest", async (request, reply) => {
      reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
      const session = options.authenticate(request);
      if (!session) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in and connect GitHub again." });
      if (request.method === "POST" && request.headers["content-type"]?.split(";")[0] !== "application/json") {
        return reply.code(415).send({ code: "JSON_REQUIRED", message: "Send a JSON request." });
      }
      const retryAfter = limiter.consume("github", session.userId, 40, 60_000);
      if (retryAfter) return reply.code(429).header("retry-after", String(retryAfter)).send({ code: "RATE_LIMITED", message: "Too many requests. Try again shortly." });
    });
    routes.setErrorHandler((error, request, reply) => {
      if (error instanceof GitHubError) {
        if (error.retryAfter) reply.header("retry-after", String(error.retryAfter));
        return reply.code(error.status).send({ code: error.code, message: error.message });
      }
      if (error instanceof z.ZodError) return reply.code(400).send({ code: "GITHUB_INPUT_INVALID", message: "Choose a repository and try again." });
      request.log.error({ code: "GITHUB_FAILED" }, "GitHub request failed");
      return reply.code(500).send({ code: "GITHUB_FAILED", message: "GitHub request failed. Try again." });
    });
    const cookie = (value: string, age: number) => `${COOKIE}=${value}; Path=/v1/github/callback; HttpOnly; SameSite=Lax; Max-Age=${age}${options.secureCookie ? "; Secure" : ""}`;

    routes.get("/v1/github", async (request) => options.service.status(options.authenticate(request)!.userId));
    routes.post("/v1/github/connect", { logLevel: "silent" }, async (request, reply) => {
      const session = options.authenticate(request)!;
      const result = options.service.beginConnection(session.userId, session.sessionToken);
      reply.header("set-cookie", cookie(result.state, 600));
      return { url: result.url };
    });
    routes.get("/v1/github/callback", { logLevel: "silent" }, async (request, reply) => {
      const returnUrl = new URL(options.clientUrl);
      try {
        const query = callbackSchema.parse(request.query);
        const session = options.authenticate(request)!;
        const stateCookie = request.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
        const verifier = options.service.authorization.consume(query.state, stateCookie, session.userId, session.sessionToken);
        if (query.error === "access_denied") returnUrl.searchParams.set("github", "cancelled");
        else {
          if (!query.code || query.error) throw new GitHubError("GITHUB_AUTH_FAILED", "GitHub could not connect.", 400);
          await options.service.completeConnection(session.userId, query.code, verifier,
            () => options.authenticate(request)?.sessionToken === session.sessionToken);
          returnUrl.searchParams.set("github", "connected");
        }
      } catch {
        returnUrl.searchParams.set("github", "error");
      }
      reply.header("set-cookie", cookie("", 0));
      return reply.redirect(returnUrl.toString());
    });
    routes.delete("/v1/github", async (request) => options.service.disconnect(options.authenticate(request)!.userId));
    routes.get("/v1/github/repositories", { logLevel: "silent" }, async (request) => {
      const { page } = repositoriesSchema.parse(request.query);
      const session = options.authenticate(request)!;
      const result = await options.service.repositories(session.userId, page);
      if (options.authenticate(request)?.sessionToken !== session.sessionToken) throw new GitHubError("AUTH_REQUIRED", "Sign in again.", 401);
      return result;
    });
    routes.get<{ Params: { objectId: string } }>("/v1/github/trays/:objectId", { logLevel: "silent" }, async (request) => {
      const session = options.authenticate(request)!;
      const canOpen = () => options.authenticate(request)?.sessionToken === session.sessionToken
        && options.canOpenTray(session.userId, request.params.objectId);
      if (!canOpen()) throw new GitHubError("GITHUB_TRAY_UNAVAILABLE", "Move closer to the PR tray to open it.", 403);
      const { repository, view, cursor } = mailroomSchema.parse(request.query);
      const result = await options.service.mailroom(session.userId, repository, view, cursor);
      if (!canOpen()) throw new GitHubError("GITHUB_TRAY_UNAVAILABLE", "Move closer to the PR tray to open it.", 403);
      return result;
    });
  });
}
