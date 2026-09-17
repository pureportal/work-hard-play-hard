import type { FastifyReply } from "fastify";

const SESSION_COOKIE_NAME = "whph_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function getSessionToken(cookieHeader: string | undefined): string | undefined {
  const source = cookieHeader?.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!source) {
    return undefined;
  }
  try {
    return decodeURIComponent(source.slice(SESSION_COOKIE_NAME.length + 1));
  } catch {
    return undefined;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const security = process.env.NODE_ENV === "production" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE_SECONDS}; Priority=High${security}`);
}

export function clearSessionCookie(reply: FastifyReply): void {
  const security = process.env.NODE_ENV === "production" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; Priority=High${security}`);
}

export function sendRateLimit(reply: FastifyReply, retryAfter: number): FastifyReply {
  return reply.code(429).header("retry-after", String(retryAfter)).send({
    code: "RATE_LIMITED",
    message: "Too many attempts. Try again later.",
  });
}

export function sendInvitationError(reply: FastifyReply, code: string): FastifyReply {
  const errors: Record<string, { status: number; message: string }> = {
    INVITATION_INVALID: { status: 404, message: "Invitation is invalid." },
    INVITATION_EXPIRED: { status: 410, message: "Invitation has expired." },
    INVITATION_REVOKED: { status: 410, message: "Invitation was revoked." },
    INVITATION_ACCEPTED: { status: 409, message: "Invitation has already been used." },
    INVITATION_EMAIL_MISMATCH: { status: 403, message: "Sign in with the invited email." },
    INVITATION_MEMBER_EXISTS: { status: 409, message: "This person is already a member." },
  };
  const error = errors[code] ?? errors.INVITATION_INVALID!;
  return reply.code(error.status).send({ code: errors[code] ? code : "INVITATION_INVALID", message: error.message });
}
