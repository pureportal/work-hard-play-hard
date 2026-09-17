import type { FastifyInstance } from "fastify";
import type { AuthStore } from "./auth-store.js";
import { normalizeEmail } from "./auth-store.js";
import { clearSessionCookie, sendRateLimit } from "./auth-http.js";
import type { AuthRateLimiter } from "./rate-limiter.js";
import type { WorkspaceStore } from "../store.js";
import { magicLinkRequestBodySchema, passwordResetBodySchema, passwordResetRequestBodySchema } from "../protocol.js";

const AUTH_WINDOW_MS = 15 * 60 * 1_000;

export interface EmailLinkOptions {
  exposeMagicLinks?: boolean;
  exposePasswordResetLinks?: boolean;
  deliverMagicLink?: (email: string, link: string, applicationName: string) => Promise<void>;
  deliverPasswordReset?: (email: string, link: string, applicationName: string) => Promise<void>;
  deliverPasswordChanged?: (email: string, applicationName: string) => Promise<void>;
}

interface EmailLinkDependencies extends EmailLinkOptions {
  auth: AuthStore;
  store: WorkspaceStore;
  rateLimiter: AuthRateLimiter;
  clientUrl: string;
  onPasswordReset: (userId: string) => void;
}

export function registerEmailLinkRoutes(app: FastifyInstance, options: EmailLinkDependencies): () => Promise<void> {
  const { auth, store, rateLimiter, clientUrl } = options;
  const pending = new Set<Promise<void>>();
  const enqueue = (action: () => Promise<unknown>) => {
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(action)
      .then(() => undefined)
      .catch((error: unknown) => app.log.error(error));
    pending.add(job);
    void job.then(() => pending.delete(job));
  };

  for (const kind of ["magic", "reset"] as const) {
    const magic = kind === "magic";
    const expose = (magic ? options.exposeMagicLinks : options.exposePasswordResetLinks) === true && process.env.NODE_ENV !== "production";
    const deliver = magic ? options.deliverMagicLink : options.deliverPasswordReset;
    app.post(magic ? "/v1/auth/magic-link" : "/v1/auth/forgot-password", async (request, reply) => {
      if (!deliver && !expose) {
        return reply.code(503).send({
          code: magic ? "MAGIC_LINK_UNAVAILABLE" : "PASSWORD_RESET_UNAVAILABLE",
          message: magic ? "Email sign-in is unavailable. Use your password." : "Password recovery is unavailable. Contact the workspace owner.",
        });
      }
      const parsed = (magic ? magicLinkRequestBodySchema : passwordResetRequestBodySchema).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ code: "EMAIL_INVALID", message: "Enter a valid email." });
      const email = normalizeEmail(parsed.data.email);
      const retryAfter = Math.max(
        rateLimiter.consume(`${kind}-ip`, request.ip, 30, AUTH_WINDOW_MS) ?? 0,
        rateLimiter.consume(`${kind}-email`, email, 5, AUTH_WINDOW_MS) ?? 0,
      );
      if (retryAfter) return sendRateLimit(reply, retryAfter);

      const send = async (): Promise<string | undefined> => {
        const emailLink = magic ? await auth.createMagicLink(email) : await auth.createPasswordReset(email);
        if (!emailLink) return undefined;
        const url = new URL(magic ? "/auth/magic" : "/auth/reset", clientUrl);
        url.hash = new URLSearchParams({
          [kind]: emailLink.token,
          ...(parsed.data.invitationToken ? { invite: parsed.data.invitationToken } : {}),
        }).toString();
        try {
          await deliver?.(emailLink.email, url.toString(), store.getCorporateIdentity().applicationName);
        } catch (error) {
          await auth.revokeEmailLink(magic ? "magicLinks" : "passwordResets", emailLink.token);
          throw error;
        }
        return url.toString();
      };

      let link: string | undefined;
      if (expose) link = await send();
      else enqueue(send);
      return reply.code(202).send({ message: "Check your email.", ...(link ? { [magic ? "magicLink" : "resetLink"]: link } : {}) });
    });
  }

  app.post("/v1/auth/reset-password", async (request, reply) => {
    const retryAfter = rateLimiter.consume("reset-verify", request.ip, 30, AUTH_WINDOW_MS);
    if (retryAfter) return sendRateLimit(reply, retryAfter);
    const parsed = passwordResetBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "PASSWORD_RESET_INVALID", message: "Use the reset link and a password between 8 and 128 characters." });
    const user = await auth.resetPassword(parsed.data.token, parsed.data.password);
    if (!user) return reply.code(401).send({ code: "PASSWORD_RESET_EXPIRED", message: "Reset link is invalid or expired. Request a new link." });
    options.onPasswordReset(user.id);
    clearSessionCookie(reply);
    if (options.deliverPasswordChanged) {
      enqueue(() => options.deliverPasswordChanged!(user.email, store.getCorporateIdentity().applicationName));
    }
    return { passwordReset: true };
  });

  return async () => {
    while (pending.size) await Promise.all(pending);
  };
}
