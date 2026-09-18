import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const connectionRequestSchema = z.object({ native: z.boolean().default(false) }).strict();

interface BrowserAttempt {
  ticket: string | null;
  url: string;
  session: { userId: string; sessionToken: string };
  isActive: () => boolean;
  expiresAt: number;
}

export class BrowserAuthorization {
  private readonly attempts = new Map<string, BrowserAttempt>();

  constructor(app: FastifyInstance, provider: "spotify" | "github") {
    app.get<{ Querystring: { ticket?: string } }>(`/v1/${provider}/browser`, { logLevel: "silent" }, async (request, reply) => {
      reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
      this.prune();
      const entry = [...this.attempts].find(([, attempt]) => attempt.ticket && attempt.ticket === request.query.ticket);
      if (!entry || !entry[1].isActive()) return reply.code(400).type("text/plain").send("Connection expired. Return to the app and try again.");
      const [state, attempt] = entry;
      attempt.ticket = null;
      const secure = new URL(attempt.url).searchParams.get("redirect_uri")!.startsWith("https:");
      reply.header("set-cookie", `whph_${provider}_state=${state}; Path=/v1/${provider}/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);
      return reply.redirect(attempt.url);
    });
  }

  begin(result: { state: string; url: string }, session: BrowserAttempt["session"], isActive: () => boolean): string {
    this.prune();
    for (const [state, attempt] of this.attempts) {
      if (attempt.session.userId === session.userId) this.attempts.delete(state);
    }
    const ticket = randomBytes(32).toString("base64url");
    this.attempts.set(result.state, { ticket, url: result.url, session, isActive, expiresAt: Date.now() + 600_000 });
    const url = new URL(new URL(result.url).searchParams.get("redirect_uri")!);
    url.pathname = url.pathname.replace(/\/callback$/, "/browser");
    url.search = new URLSearchParams({ ticket }).toString();
    return url.toString();
  }

  has(state: unknown): boolean {
    this.prune();
    return typeof state === "string" && this.attempts.has(state);
  }

  consume(state: string, cookie: string | undefined): Pick<BrowserAttempt, "session" | "isActive"> {
    this.prune();
    const attempt = this.attempts.get(state);
    if (!attempt || attempt.ticket !== null || state !== cookie || !attempt.isActive()) {
      throw new Error("Connection expired. Return to the app and try again.");
    }
    this.attempts.delete(state);
    return attempt;
  }

  private prune(): void {
    for (const [state, attempt] of this.attempts) {
      if (attempt.expiresAt <= Date.now()) this.attempts.delete(state);
    }
  }
}
