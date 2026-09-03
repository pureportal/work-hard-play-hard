import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AuthUser, ClientCommand, Member, MemberRole, ServerEvent } from "@workhard/shared";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  AVATAR_IMAGE_MAX_BYTES,
  AvatarImageInputError,
  AvatarImageProcessor,
} from "./avatar/avatar-image-processor.js";
import { AvatarStore, type AvatarReference } from "./avatar/avatar-store.js";
import { AuthStore } from "./auth/auth-store.js";
import { AuthRateLimiter } from "./auth/rate-limiter.js";
import {
  CHAT_IMAGE_MAX_BYTES,
  ChatImageStore,
  normalizeChatImageName,
  type ChatImageMimeType,
} from "./chat/chat-images.js";
import { detectImageMimeType, SUPPORTED_IMAGE_MIME_TYPES } from "./images/image-input.js";
import type { ApplicationDatabase } from "./persistence/application-database.js";
import { PostgreSqlDatabase } from "./persistence/postgresql-database.js";
import {
  clientCommandSchema,
  directConversationBodySchema,
  invitationAcceptBodySchema,
  invitationBodySchema,
  loginBodySchema,
  magicLinkRequestBodySchema,
  magicLinkVerifyBodySchema,
  memberAccessBodySchema,
  registerBodySchema,
  registrationSettingsBodySchema,
} from "./protocol.js";
import { createInitialData, createSeedData } from "./seed.js";
import { DemoStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";

const SESSION_COOKIE_NAME = "whph_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const AUTH_WINDOW_MS = 15 * 60 * 1_000;
const AUTHENTICATION_CLOSE_CODE = 4_401;
const REALTIME_COMMAND_LIMIT = 200;
const REALTIME_COMMAND_WINDOW_MS = 1_000;
const SNAPSHOT_BACKPRESSURE_BYTES = 64 * 1024;
const MAX_SOCKET_BACKPRESSURE_BYTES = 4 * 1024 * 1024;
const serializedEventCache = new WeakMap<ServerEvent, string>();

interface RealtimeCommandWindow {
  startedAt: number;
  count: number;
}

interface ApplicationOptions {
  database?: ApplicationDatabase;
  chatImagePath?: string;
  clientUrl?: string;
  clientOrigins?: string[];
  exposeMagicLinks?: boolean;
  deliverMagicLink?: (email: string, link: string) => Promise<void>;
  exposeInvitationLinks?: boolean;
  deliverInvitation?: (email: string, link: string) => Promise<void>;
  seeded?: boolean;
  logger?: boolean;
}

export interface ApplicationContext {
  app: FastifyInstance;
  store: DemoStore;
  auth: AuthStore;
  runtime: WorldRuntime;
}

const defaultChatImagePath = fileURLToPath(
  new URL("../../../.data/chat-images", import.meta.url),
);

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const clientUrl = normalizeClientUrl(options.clientUrl ?? process.env.CLIENT_URL ?? "http://127.0.0.1:5173");
  const clientOrigins = resolveClientOrigins(clientUrl, options.clientOrigins ?? parseClientOrigins(process.env.CLIENT_ORIGINS));
  const app = Fastify({ logger: options.logger ?? false });
  const database = options.database ?? await PostgreSqlDatabase.connect();
  const initialized = await initializePersistentState(database, options.seeded ?? false).catch(async (error: unknown) => {
    await database.close();
    throw error;
  });
  const { auth, avatars, runtime, store } = initialized;
  const chatImages = new ChatImageStore(options.chatImagePath ?? defaultChatImagePath);
  const avatarProcessor = new AvatarImageProcessor();
  const authRateLimiter = new AuthRateLimiter();
  const exposeMagicLinks = options.exposeMagicLinks ?? process.env.NODE_ENV !== "production";
  const exposeInvitationLinks = options.exposeInvitationLinks ?? process.env.NODE_ENV !== "production";
  const realtimeSocketsBySession = new Map<string, Set<RealtimeSocket>>();
  const realtimeSocketsByUser = new Map<string, Set<RealtimeSocket>>();
  const realtimeCommandWindowsByUser = new Map<string, RealtimeCommandWindow>();

  await app.register(cors, {
    origin: [...clientOrigins],
    credentials: true,
  });

  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && !clientOrigins.has(origin)) {
      return reply.code(403).send({ code: "ORIGIN_FORBIDDEN", message: "Request origin is not allowed." });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.url.startsWith("/v1/auth/")
      || request.url === "/v1/bootstrap"
      || request.url === "/v1/admin/registration-settings"
    ) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.statusCode === 413) {
      return reply.code(413).send({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large." });
    }
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    if (statusCode === 500) {
      request.log.error(error);
    }
    return reply.code(statusCode).send({
      code: statusCode === 500 ? "REQUEST_FAILED" : "REQUEST_INVALID",
      message: statusCode === 500 ? "Request could not be completed." : "Check the request and try again.",
    });
  });

  for (const mimeType of SUPPORTED_IMAGE_MIME_TYPES) {
    app.addContentTypeParser(mimeType, { parseAs: "buffer", bodyLimit: Math.max(CHAT_IMAGE_MAX_BYTES, AVATAR_IMAGE_MAX_BYTES) }, (_request, body, done) => {
      done(null, body);
    });
  }

  app.get("/v1/health/live", async () => ({ status: "ok" }));
  app.get("/v1/health/ready", async (request, reply) => {
    try {
      if (await database.isHealthy()) {
        return { status: "ready", database: true };
      }
    } catch (error) {
      request.log.error(error);
    }
    return reply.code(503).send({ status: "unavailable", database: false });
  });
  app.get("/v1/version", async () => ({ version: "2.0.0", protocol: 10 }));

  app.get("/v1/auth/session", async (request) => {
    const user = getAuthenticatedUser(auth, request);
    const registrationSettings = store.getRegistrationSettings();
    return {
      user: user ?? null,
      setupRequired: store.needsSetup(),
      registration: {
        enabled: registrationSettings.enabled,
        invitationRequired: registrationSettings.invitationRequired,
      },
    };
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const retryAfter = authRateLimiter.consume("register-ip", request.ip, 10, 60 * 60 * 1_000);
    if (retryAfter) {
      return sendRateLimit(reply, retryAfter);
    }
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "REGISTRATION_INVALID", message: "Check the account details." });
    }
    try {
      store.assertRegistrationAllowed(parsed.data.email, Boolean(parsed.data.invitationToken));
      const registered = await auth.register(parsed.data.username, parsed.data.email, parsed.data.password);
      let member: Member;
      let invitationAccepted = false;
      try {
        if (parsed.data.invitationToken) {
          store.assertRegistrationAllowed(registered.user.email, true);
          member = store.acceptInvitation(parsed.data.invitationToken, registered.user).member;
          invitationAccepted = true;
        } else if (store.needsSetup()) {
          member = store.addInitialMember(registered.user);
        } else {
          member = store.addRegisteredMember(registered.user);
        }
      } catch (error) {
        await auth.removeAccount(registered.user.id);
        throw error;
      }
      runtime.publishMember(member);
      if (invitationAccepted) {
        runtime.publishWorkspaceAccess();
      }
      setSessionCookie(reply, registered.sessionToken);
      return reply.code(201).send({ user: registered.user });
    } catch (error) {
      const code = error instanceof Error ? error.message : "REGISTRATION_FAILED";
      if (code === "USERNAME_TAKEN") {
        return reply.code(409).send({ code, message: "Username is already taken." });
      }
      if (code === "EMAIL_TAKEN") {
        return reply.code(409).send({ code, message: "Email is already registered." });
      }
      if (code === "REGISTRATION_DISABLED") {
        return reply.code(403).send({ code, message: "Registration is disabled." });
      }
      if (code === "REGISTRATION_CLOSED" || code === "INVITATION_REQUIRED") {
        return reply.code(403).send({ code: "INVITATION_REQUIRED", message: "An invitation is required." });
      }
      if (code.startsWith("INVITATION_")) {
        return sendInvitationError(reply, code);
      }
      request.log.error(error);
      return reply.code(500).send({ code: "REGISTRATION_FAILED", message: "Account could not be created." });
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "LOGIN_INVALID", message: "Enter your username and password." });
    }
    const identifier = parsed.data.identifier.normalize("NFKC").trim().toLowerCase();
    const ipRetryAfter = authRateLimiter.consume("login-ip", request.ip, 50, AUTH_WINDOW_MS);
    const identifierRetryAfter = authRateLimiter.consume("login-identifier", identifier, 10, AUTH_WINDOW_MS);
    const retryAfter = Math.max(ipRetryAfter ?? 0, identifierRetryAfter ?? 0);
    if (retryAfter > 0) {
      return sendRateLimit(reply, retryAfter);
    }
    const authenticated = await auth.authenticate(identifier, parsed.data.password);
    if (!authenticated) {
      return reply.code(401).send({ code: "CREDENTIALS_INVALID", message: "Invalid username or password." });
    }
    authRateLimiter.reset("login-identifier", identifier);
    setSessionCookie(reply, authenticated.sessionToken);
    return { user: authenticated.user };
  });

  app.post("/v1/auth/magic-link", async (request, reply) => {
    if (!options.deliverMagicLink && !exposeMagicLinks) {
      return reply.code(503).send({ code: "MAGIC_LINK_UNAVAILABLE", message: "Magic-link sign-in is unavailable." });
    }
    const parsed = magicLinkRequestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "EMAIL_INVALID", message: "Enter a valid email." });
    }
    const email = parsed.data.email.normalize("NFC").trim().toLowerCase();
    const ipRetryAfter = authRateLimiter.consume("magic-ip", request.ip, 30, AUTH_WINDOW_MS);
    const emailRetryAfter = authRateLimiter.consume("magic-email", email, 5, AUTH_WINDOW_MS);
    const retryAfter = Math.max(ipRetryAfter ?? 0, emailRetryAfter ?? 0);
    if (retryAfter > 0) {
      return sendRateLimit(reply, retryAfter);
    }
    const magicLink = await auth.createMagicLink(email);
    let link: string | undefined;
    if (magicLink) {
      const fragment = new URLSearchParams({
        magic: magicLink.token,
        ...(parsed.data.invitationToken ? { invite: parsed.data.invitationToken } : {}),
      });
      const magicUrl = new URL("/auth/magic", clientUrl);
      magicUrl.hash = fragment.toString();
      link = magicUrl.toString();
      if (options.deliverMagicLink) {
        await options.deliverMagicLink(magicLink.email, link);
      }
    }
    return reply.code(202).send({
      message: "Check your email.",
      ...(exposeMagicLinks && link ? { magicLink: link } : {}),
    });
  });

  app.post("/v1/auth/magic-link/verify", async (request, reply) => {
    const parsed = magicLinkVerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "MAGIC_LINK_INVALID", message: "Sign-in link is invalid or expired." });
    }
    const retryAfter = authRateLimiter.consume("magic-verify", request.ip, 30, AUTH_WINDOW_MS);
    if (retryAfter) {
      return sendRateLimit(reply, retryAfter);
    }
    const authenticated = await auth.consumeMagicLink(parsed.data.token);
    if (!authenticated) {
      return reply.code(401).send({ code: "MAGIC_LINK_INVALID", message: "Sign-in link is invalid or expired." });
    }
    setSessionCookie(reply, authenticated.sessionToken);
    return { user: authenticated.user };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const sessionToken = getSessionToken(request.headers.cookie);
    await auth.revokeSession(sessionToken);
    if (sessionToken) {
      for (const socket of realtimeSocketsBySession.get(sessionToken) ?? []) {
        socket.close(1000, "Signed out");
      }
      realtimeSocketsBySession.delete(sessionToken);
    }
    clearSessionCookie(reply);
    return { signedOut: true };
  });

  app.post("/v1/invitations/accept", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to accept the invitation." });
    }
    const parsed = invitationAcceptBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVITATION_INVALID", message: "Invitation is invalid." });
    }
    const retryAfter = authRateLimiter.consume("invitation-accept", request.ip, 30, AUTH_WINDOW_MS);
    if (retryAfter) {
      return sendRateLimit(reply, retryAfter);
    }
    try {
      const accepted = store.acceptInvitation(parsed.data.token, user);
      runtime.publishMember(accepted.member);
      runtime.publishWorkspaceAccess();
      return accepted.invitation;
    } catch (error) {
      return sendInvitationError(reply, error instanceof Error ? error.message : "INVITATION_INVALID");
    }
  });

  app.get("/v1/bootstrap", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    try {
      return store.getBootstrap(user.id);
    } catch {
      return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found." });
    }
  });

  app.get("/v1/admin/registration-settings", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageGlobalSettings(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot view registration settings." });
    }
    return store.getRegistrationSettings();
  });

  app.put("/v1/admin/registration-settings", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageGlobalSettings(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change registration settings." });
    }
    const parsed = registrationSettingsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "REGISTRATION_SETTINGS_INVALID",
        message: "Check the registration settings.",
      });
    }
    return store.updateRegistrationSettings(parsed.data);
  });

  app.put("/v1/members/me/avatar", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.getMember(user.id)) {
      return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found." });
    }
    const retryAfter = authRateLimiter.consume("avatar-upload", user.id, 20, AUTH_WINDOW_MS);
    if (retryAfter) {
      return sendRateLimit(reply, retryAfter);
    }
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > AVATAR_IMAGE_MAX_BYTES) {
      return reply.code(400).send({ code: "AVATAR_IMAGE_INVALID", message: "Choose an image up to 5 MB." });
    }
    const detectedMimeType = detectImageMimeType(body);
    const declaredMimeType = request.headers["content-type"]?.split(";", 1)[0];
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      return reply.code(415).send({ code: "AVATAR_IMAGE_TYPE_INVALID", message: "Choose a PNG, JPEG, GIF, or WebP image." });
    }
    let processed;
    try {
      processed = await avatarProcessor.process(body);
    } catch (error) {
      if (error instanceof AvatarImageInputError) {
        return reply.code(422).send({ code: "AVATAR_IMAGE_INVALID", message: "Choose a valid image." });
      }
      throw error;
    }
    const reference = await avatars.save(user.id, processed);
    const member = store.updateMemberAvatar(user.id, avatarUrl(reference));
    runtime.publishMember(member);
    return member;
  });

  app.delete("/v1/members/me/avatar", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.getMember(user.id)) {
      return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found." });
    }
    await avatars.remove(user.id);
    const member = store.updateMemberAvatar(user.id, undefined);
    runtime.publishMember(member);
    return member;
  });

  app.get("/v1/members/:memberId/avatar.webp", async (request, reply) => {
    const { memberId } = request.params as { memberId: string };
    const { v: version } = request.query as { v?: string };
    if (!store.getMember(memberId)) {
      return reply.code(404).send({ code: "AVATAR_NOT_FOUND", message: "Avatar not found." });
    }
    const avatar = await avatars.read(memberId);
    if (!avatar || version !== avatar.version) {
      return reply.code(404).send({ code: "AVATAR_NOT_FOUND", message: "Avatar not found." });
    }
    const etag = `"${avatar.version}"`;
    reply
      .header("content-type", avatar.mimeType)
      .header("content-length", avatar.data.length)
      .header("etag", etag)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=31536000, immutable");
    if (request.headers["if-none-match"] === etag) {
      return reply.code(304).send();
    }
    return reply.send(avatar.data);
  });

  app.post("/v1/conversations/direct", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    const parsed = directConversationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "DIRECT_CONVERSATION_INVALID", message: "Choose a person." });
    }
    try {
      const result = store.getOrCreateDirectConversation(user.id, parsed.data.targetUserId);
      if (result.created) {
        runtime.publishConversation(result.conversation);
      }
      return reply.code(result.created ? 201 : 200).send(result.conversation);
    } catch (error) {
      const code = error instanceof Error ? error.message : "DIRECT_CONVERSATION_FAILED";
      const status = code === "USER_NOT_FOUND" ? 404 : 400;
      return reply.code(status).send({ code, message: code === "USER_NOT_FOUND" ? "Person not found." : "Choose another person." });
    }
  });

  app.post("/v1/conversations/:conversationId/images", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    const { conversationId } = request.params as { conversationId: string };
    if (!store.canAccessConversation(user.id, conversationId)) {
      return reply.code(403).send({ code: "CONVERSATION_FORBIDDEN", message: "You cannot send to that conversation." });
    }
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > CHAT_IMAGE_MAX_BYTES) {
      return reply.code(400).send({ code: "IMAGE_INVALID", message: "Choose an image up to 5 MB." });
    }
    const detectedMimeType = detectImageMimeType(body);
    const declaredMimeType = request.headers["content-type"]?.split(";", 1)[0];
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      return reply.code(415).send({ code: "IMAGE_TYPE_INVALID", message: "Choose a PNG, JPEG, GIF, or WebP image." });
    }
    const imageId = randomUUID();
    const attachment = {
      id: imageId,
      type: "image" as const,
      name: normalizeChatImageName(decodeFileName(request.headers["x-file-name"]), detectedMimeType),
      mimeType: detectedMimeType,
      size: body.length,
      url: `/v1/chat/images/${imageId}`,
    };
    await chatImages.save(imageId, detectedMimeType, body);
    try {
      const message = store.addMessage(conversationId, user.id, "", [attachment]);
      runtime.publishChatMessage(message);
      return reply.code(201).send(message);
    } catch (error) {
      await chatImages.remove(imageId, detectedMimeType);
      throw error;
    }
  });

  app.get("/v1/chat/images/:imageId", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    const { imageId } = request.params as { imageId: string };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(imageId)) {
      return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    }
    const attachment = store.getAccessibleImage(user.id, imageId);
    if (!attachment) {
      return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    }
    try {
      const source = await chatImages.read(imageId, attachment.mimeType as ChatImageMimeType);
      return reply
        .header("content-type", attachment.mimeType)
        .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=86400")
        .send(source);
    } catch {
      return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    }
  });

  app.post("/v1/teams/:teamId/invitations", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageMembers(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot invite members." });
    }
    const { teamId } = request.params as { teamId: string };
    if (!store.hasTeam(teamId)) {
      return reply.code(404).send({ code: "TEAM_NOT_FOUND", message: "Team not found." });
    }
    if (!options.deliverInvitation && !exposeInvitationLinks) {
      return reply.code(503).send({ code: "INVITATION_UNAVAILABLE", message: "Invitations are unavailable." });
    }
    const parsed = invitationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVITATION_INVALID", message: "Enter a valid email." });
    }
    if (!store.canIssueInvitation(user.id, parsed.data.email, parsed.data.role)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot assign this role." });
    }
    let issued: ReturnType<DemoStore["issueInvitation"]>;
    try {
      issued = store.issueInvitation(parsed.data.email, parsed.data.role as Exclude<MemberRole, "owner">, parsed.data.permissions);
    } catch (error) {
      return sendInvitationError(reply, error instanceof Error ? error.message : "INVITATION_INVALID");
    }
    const invitationUrl = new URL("/auth/invite", clientUrl);
    invitationUrl.hash = new URLSearchParams({ invite: issued.token }).toString();
    const inviteLink = invitationUrl.toString();
    if (options.deliverInvitation) {
      try {
        await options.deliverInvitation(issued.invitation.email, inviteLink);
      } catch (error) {
        store.rollbackInvitationIssue(issued.invitation.id, issued.supersededInvitationIds);
        request.log.error(error);
        return reply.code(502).send({
          code: "INVITATION_DELIVERY_FAILED",
          message: "Invitation could not be sent.",
        });
      }
    }
    runtime.publishWorkspaceAccess();
    return reply.code(201).send({
      ...issued.invitation,
      ...(exposeInvitationLinks ? { inviteLink } : {}),
    });
  });

  app.delete("/v1/teams/:teamId/invitations/:invitationId", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageMembers(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot revoke invitations." });
    }
    const params = request.params as { teamId: string; invitationId: string };
    if (!store.hasTeam(params.teamId)) {
      return reply.code(404).send({ code: "TEAM_NOT_FOUND", message: "Team not found." });
    }
    const invitation = store.getInvitation(params.invitationId);
    if (!invitation) {
      return reply.code(404).send({ code: "INVITATION_NOT_FOUND", message: "Invitation not found." });
    }
    if (!store.canInviteWithRole(user.id, invitation.role)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot revoke this invitation." });
    }
    try {
      const revokedInvitation = store.revokeInvitation(params.invitationId);
      runtime.publishWorkspaceAccess();
      return revokedInvitation;
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVITATION_NOT_FOUND";
      if (code === "INVITATION_NOT_PENDING") {
        return reply.code(409).send({ code, message: "Invitation is no longer pending." });
      }
      return reply.code(404).send({ code: "INVITATION_NOT_FOUND", message: "Invitation not found." });
    }
  });

  app.patch("/v1/teams/:teamId/members/:memberId", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageMembers(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change member access." });
    }
    const params = request.params as { teamId: string; memberId: string };
    if (!store.hasTeam(params.teamId)) {
      return reply.code(404).send({ code: "TEAM_NOT_FOUND", message: "Team not found." });
    }
    const parsed = memberAccessBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "MEMBER_ACCESS_INVALID", message: "Choose valid access." });
    }
    if (!store.getMember(params.memberId)) {
      return reply.code(404).send({ code: "USER_NOT_FOUND", message: "Person not found." });
    }
    if (!store.canChangeMemberAccess(user.id, params.memberId, parsed.data.role)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change this person's access." });
    }
    try {
      const member = store.updateMemberAccess(params.memberId, parsed.data.role, parsed.data.permissions);
      runtime.publishMemberAccess(member);
      return member;
    } catch (error) {
      const code = error instanceof Error ? error.message : "MEMBER_UPDATE_FAILED";
      return reply.code(code === "USER_NOT_FOUND" ? 404 : 409).send({ code, message: "Access could not be changed." });
    }
  });

  app.get("/v1/realtime", { websocket: true }, (socket, request) => {
    const sessionToken = getSessionToken(request.headers.cookie);
    const user = auth.getUserFromSession(sessionToken);
    if (!sessionToken || !user) {
      socket.close(AUTHENTICATION_CLOSE_CODE, "Authentication required");
      return;
    }
    const query = request.query as { floorId?: string };
    const floorId = query.floorId ?? "";
    const sessionSockets = realtimeSocketsBySession.get(sessionToken) ?? new Set<RealtimeSocket>();
    sessionSockets.add(socket);
    realtimeSocketsBySession.set(sessionToken, sessionSockets);
    const userSockets = realtimeSocketsByUser.get(user.id) ?? new Set<RealtimeSocket>();
    userSockets.add(socket);
    realtimeSocketsByUser.set(user.id, userSockets);
    let peerId = "";
    let disconnected = false;
    let heartbeatReceived = true;
    const heartbeatTimer = setInterval(() => {
      if (socket.readyState !== 1) {
        clearInterval(heartbeatTimer);
        return;
      }
      if (auth.getUserFromSession(sessionToken)?.id !== user.id) {
        socket.close(AUTHENTICATION_CLOSE_CODE, "Session expired");
        return;
      }
      if (!heartbeatReceived) {
        socket.terminate();
        return;
      }
      heartbeatReceived = false;
      socket.ping();
    }, 8_000);

    socket.on("message", (source) => {
      if (!peerId || socket.readyState !== 1) {
        return;
      }
      const now = Date.now();
      let commandWindow = realtimeCommandWindowsByUser.get(user.id);
      if (!commandWindow || now - commandWindow.startedAt >= REALTIME_COMMAND_WINDOW_MS) {
        commandWindow = { startedAt: now, count: 0 };
        realtimeCommandWindowsByUser.set(user.id, commandWindow);
      }
      commandWindow.count += 1;
      if (commandWindow.count > REALTIME_COMMAND_LIMIT) {
        socket.close(1008, "Too many commands");
        return;
      }
      let candidate: unknown;
      try {
        candidate = JSON.parse(source.toString());
      } catch {
        sendEvent(socket, { type: "command.error", code: "MESSAGE_INVALID", message: "Message is invalid." });
        return;
      }
      const parsed = clientCommandSchema.safeParse(candidate);
      if (!parsed.success) {
        sendEvent(socket, {
          type: "command.error",
          ...requestIdFromCandidate(candidate),
          code: "MESSAGE_INVALID",
          message: "Message is invalid.",
        });
        return;
      }
      runtime.handleCommand(peerId, parsed.data as ClientCommand);
    });

    socket.on("pong", () => {
      heartbeatReceived = true;
    });
    const disconnect = () => {
      if (disconnected) {
        return;
      }
      disconnected = true;
      clearInterval(heartbeatTimer);
      sessionSockets.delete(socket);
      if (sessionSockets.size === 0) {
        realtimeSocketsBySession.delete(sessionToken);
      }
      userSockets.delete(socket);
      if (userSockets.size === 0) {
        realtimeSocketsByUser.delete(user.id);
        const commandWindow = realtimeCommandWindowsByUser.get(user.id);
        if (commandWindow) {
          const remainingWindowMs = Math.max(0, commandWindow.startedAt + REALTIME_COMMAND_WINDOW_MS - Date.now());
          setTimeout(() => {
            if (
              !realtimeSocketsByUser.has(user.id)
              && realtimeCommandWindowsByUser.get(user.id) === commandWindow
            ) {
              realtimeCommandWindowsByUser.delete(user.id);
            }
          }, remainingWindowMs).unref();
        }
      }
      const disconnectedPeerId = peerId;
      peerId = "";
      runtime.disconnect(disconnectedPeerId);
    };
    socket.on("close", disconnect);
    socket.on("error", disconnect);

    try {
      peerId = runtime.connect(user.id, floorId, (event) => sendEvent(socket, event));
    } catch {
      socket.close(AUTHENTICATION_CLOSE_CODE, "Session invalid");
    }
  });

  let persistenceTimer: NodeJS.Timeout | undefined;
  let pendingPersistence: Promise<void> | undefined;

  const persist = async (): Promise<void> => {
    if (pendingPersistence) {
      await pendingPersistence;
      return persist();
    }
    if (!runtime.dirty && !store.dirty) {
      return;
    }
    const state = {
      players: runtime.serializePlayers(),
      store: store.exportMutableState(),
    } as const;
    runtime.markClean();
    store.markClean();
    pendingPersistence = database.saveWorkspaceState(state);
    try {
      await pendingPersistence;
    } catch (error) {
      runtime.markDirty();
      store.markDirty();
      throw error;
    } finally {
      pendingPersistence = undefined;
    }
  };

  app.addHook("onReady", async () => {
    runtime.start();
    persistenceTimer = setInterval(() => {
      void persist().catch((error) => app.log.error(error));
    }, 10_000);
  });

  app.addHook("onClose", async () => {
    if (persistenceTimer) {
      clearInterval(persistenceTimer);
    }
    runtime.stop();
    try {
      await persist();
    } finally {
      try {
        await avatarProcessor.close();
      } finally {
        try {
          await auth.close();
        } finally {
          await database.close();
        }
      }
    }
  });

  return { app, store, auth, runtime };
}

async function initializePersistentState(database: ApplicationDatabase, seeded: boolean) {
  const store = new DemoStore(seeded ? createSeedData() : createInitialData());
  const savedState = await database.loadWorkspaceState();
  if (savedState) {
    store.restoreMutableState(savedState.store);
  }

  const avatars = new AvatarStore(database);
  const avatarReferences = new Map((await avatars.getReferences()).map((reference) => [reference.userId, reference]));
  for (const member of store.getMembers()) {
    store.updateMemberAvatar(member.id, avatarUrl(avatarReferences.get(member.id)));
  }

  const auth = await AuthStore.create({ database, members: store.getMembers() });
  const runtime = new WorldRuntime(store);
  if (savedState) {
    runtime.restorePlayers(savedState.players);
  } else {
    await database.saveWorkspaceState({
      players: runtime.serializePlayers(),
      store: store.exportMutableState(),
    });
  }
  return { auth, avatars, runtime, store };
}

function avatarUrl(reference: AvatarReference | undefined): string | undefined {
  return reference ? `/v1/members/${encodeURIComponent(reference.userId)}/avatar.webp?v=${encodeURIComponent(reference.version)}` : undefined;
}

function getAuthenticatedUser(auth: AuthStore, request: FastifyRequest): AuthUser | undefined {
  return auth.getUserFromSession(getSessionToken(request.headers.cookie));
}

function getSessionToken(cookieHeader: string | undefined): string | undefined {
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

function setSessionCookie(reply: FastifyReply, token: string): void {
  const security = process.env.NODE_ENV === "production" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE_SECONDS}; Priority=High${security}`);
}

function clearSessionCookie(reply: FastifyReply): void {
  const security = process.env.NODE_ENV === "production" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; Priority=High${security}`);
}

function sendRateLimit(reply: FastifyReply, retryAfter: number): FastifyReply {
  return reply.code(429).header("retry-after", String(retryAfter)).send({
    code: "RATE_LIMITED",
    message: "Too many attempts. Try again later.",
  });
}

function sendInvitationError(reply: FastifyReply, code: string): FastifyReply {
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

interface RealtimeSocket {
  readyState: number;
  bufferedAmount: number;
  send: (data: string, callback: (error?: Error) => void) => void;
  close: (code?: number, reason?: string) => void;
  terminate: () => void;
}

function sendEvent(socket: RealtimeSocket, event: ServerEvent): void {
  if (socket.readyState !== 1) {
    return;
  }
  if (socket.bufferedAmount >= MAX_SOCKET_BACKPRESSURE_BYTES) {
    socket.terminate();
    return;
  }
  if (event.type === "world.snapshot" && socket.bufferedAmount >= SNAPSHOT_BACKPRESSURE_BYTES) {
    return;
  }
  try {
    let payload = serializedEventCache.get(event);
    if (!payload) {
      payload = JSON.stringify(event);
      serializedEventCache.set(event, payload);
    }
    socket.send(payload, (error) => {
      if (error) {
        socket.terminate();
      }
    });
  } catch {
    socket.terminate();
  }
}

function requestIdFromCandidate(candidate: unknown): { requestId: string } | Record<string, never> {
  if (
    typeof candidate === "object"
    && candidate !== null
    && "requestId" in candidate
    && typeof candidate.requestId === "string"
    && candidate.requestId.length > 0
    && candidate.requestId.length <= 80
  ) {
    return { requestId: candidate.requestId };
  }
  return {};
}

function decodeFileName(header: string | string[] | undefined): string | undefined {
  const source = Array.isArray(header) ? header[0] : header;
  if (!source) {
    return undefined;
  }
  try {
    return decodeURIComponent(source);
  } catch {
    return undefined;
  }
}

function parseClientOrigins(value: string | undefined): string[] {
  return value?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [];
}

function normalizeClientUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("CLIENT_URL must be an HTTP or HTTPS URL without credentials, a query, or a fragment.");
  }
  return url.toString();
}

function resolveClientOrigins(clientUrl: string, configuredOrigins: string[]): Set<string> {
  const clientOrigin = new URL(clientUrl).origin;
  const origins = configuredOrigins.map((origin) => {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("CLIENT_ORIGINS must contain HTTP or HTTPS origins.");
    }
    return url.origin;
  });
  return new Set([
    clientOrigin,
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    ...origins,
  ]);
}
