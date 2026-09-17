import type { Member } from "@workhard/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthStore, RegisteredAccount } from "./auth-store.js";
import { normalizeEmail } from "./auth-store.js";
import { sendInvitationError, sendRateLimit, setSessionCookie } from "./auth-http.js";
import type { AuthRateLimiter } from "./rate-limiter.js";
import type { WorkspaceStore } from "../store.js";
import type { WorldRuntime } from "../world/world-runtime.js";
import { magicLinkVerifyBodySchema, registerBodySchema } from "../protocol.js";

export interface RegistrationOptions {
  exposeRegistrationLinks?: boolean;
  deliverRegistrationLink?: (email: string, link: string, applicationName: string) => Promise<void>;
}

interface RegistrationDependencies extends RegistrationOptions {
  auth: AuthStore;
  store: WorkspaceStore;
  runtime: WorldRuntime;
  rateLimiter: AuthRateLimiter;
  clientUrl: string;
  persist: () => Promise<void>;
}

export function registerRegistrationRoutes(app: FastifyInstance, options: RegistrationDependencies): void {
  const { auth, store, runtime, rateLimiter, clientUrl, persist } = options;
  const expose = options.exposeRegistrationLinks === true && process.env.NODE_ENV !== "production";

  const complete = async (registered: RegisteredAccount, reply: FastifyReply, invitationToken?: string, initialSetup = false) => {
    let member: Member;
    try {
      if (invitationToken) {
        store.assertRegistrationAllowed(registered.user.email, true);
        member = store.acceptInvitation(invitationToken, registered.user).member;
      } else if (initialSetup) {
        member = store.addInitialMember(registered.user);
      } else {
        member = store.addRegisteredMember(registered.user);
      }
    } catch (error) {
      await auth.removeAccount(registered.user.id);
      throw error;
    }
    await persist();
    runtime.publishMember(member);
    if (invitationToken) runtime.publishWorkspaceAccess();
    setSessionCookie(reply, registered.sessionToken);
    return reply.code(201).send({ user: registered.user });
  };

  app.post("/v1/auth/register", async (request, reply) => {
    const retryAfter = rateLimiter.consume("register-ip", request.ip, 10, 60 * 60 * 1_000);
    if (retryAfter) return sendRateLimit(reply, retryAfter);
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "REGISTRATION_INVALID", message: "Check the account details." });
    const { username, email, password, invitationToken } = parsed.data;
    try {
      store.assertRegistrationAllowed(email, Boolean(invitationToken));
      const initialSetup = store.needsSetup();
      if (initialSetup || invitationToken) {
        return await complete(await auth.register(username, email, password), reply, invitationToken, initialSetup);
      }
      if (!options.deliverRegistrationLink && !expose) {
        return reply.code(503).send({ code: "REGISTRATION_EMAIL_UNAVAILABLE", message: "Email verification is unavailable. Ask the workspace owner for an invitation." });
      }
      const emailRetryAfter = rateLimiter.consume("register-email", normalizeEmail(email), 5, 15 * 60 * 1_000);
      if (emailRetryAfter) return sendRateLimit(reply, emailRetryAfter);
      const link = await auth.createRegistrationLink(username, email, password);
      const url = new URL("/auth/register", clientUrl);
      url.hash = new URLSearchParams({ registration: link.token }).toString();
      try {
        await options.deliverRegistrationLink?.(link.email, url.toString(), store.getCorporateIdentity().applicationName);
      } catch (error) {
        await auth.revokeEmailLink("registrationLinks", link.token);
        request.log.error(error);
        return reply.code(502).send({ code: "REGISTRATION_DELIVERY_FAILED", message: "Verification email could not be sent. Try again." });
      }
      return reply.code(202).send({ verificationRequired: true, ...(expose ? { registrationLink: url.toString() } : {}) });
    } catch (error) {
      return sendRegistrationError(request, reply, error);
    }
  });

  app.post("/v1/auth/register/verify", async (request, reply) => {
    const retryAfter = rateLimiter.consume("register-verify", request.ip, 30, 15 * 60 * 1_000);
    if (retryAfter) return sendRateLimit(reply, retryAfter);
    const parsed = magicLinkVerifyBodySchema.safeParse(request.body);
    if (!parsed.success) return invalidRegistrationLink(reply);
    try {
      const registered = await auth.consumeRegistrationLink(parsed.data.token, (email) => store.assertRegistrationAllowed(email, false));
      if (!registered) return invalidRegistrationLink(reply);
      return await complete(registered, reply);
    } catch (error) {
      return sendRegistrationError(request, reply, error);
    }
  });
}

function invalidRegistrationLink(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ code: "REGISTRATION_LINK_INVALID", message: "Verification link is invalid or expired. Register again." });
}

function sendRegistrationError(request: FastifyRequest, reply: FastifyReply, error: unknown): FastifyReply {
  const code = error instanceof Error ? error.message : "REGISTRATION_FAILED";
  if (code === "USERNAME_TAKEN") return reply.code(409).send({ code, message: "Username is already taken." });
  if (code === "EMAIL_TAKEN") return reply.code(409).send({ code, message: "Email is already registered." });
  if (code === "REGISTRATION_DISABLED") return reply.code(403).send({ code, message: "Registration is disabled." });
  if (code === "REGISTRATION_CLOSED" || code === "INVITATION_REQUIRED") {
    return reply.code(403).send({ code: "INVITATION_REQUIRED", message: "An invitation is required." });
  }
  if (code.startsWith("INVITATION_")) return sendInvitationError(reply, code);
  request.log.error(error);
  return reply.code(500).send({ code: "REGISTRATION_FAILED", message: "Account could not be created." });
}
