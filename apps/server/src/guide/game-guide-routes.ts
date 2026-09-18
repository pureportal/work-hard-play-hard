import { GAME_GUIDE_STATUSES, type AuthUser } from "@workhard/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApplicationDatabase } from "../persistence/application-database.js";

const gameGuideBodySchema = z.object({ status: z.enum(GAME_GUIDE_STATUSES) }).strict();

export function registerGameGuideRoutes(app: FastifyInstance, database: ApplicationDatabase,
  authenticate: (request: FastifyRequest) => AuthUser | undefined): void {
  app.get("/v1/me/game-guide", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = authenticate(request);
    if (!user) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    return { status: await database.loadGameGuideStatus(user.id) };
  });

  app.put("/v1/me/game-guide", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const user = authenticate(request);
    if (!user) return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    const parsed = gameGuideBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "GUIDE_STATE_INVALID", message: "Guide progress could not be saved. Reopen the guide and try again." });
    await database.saveGameGuideStatus(user.id, parsed.data.status);
    return parsed.data;
  });
}
