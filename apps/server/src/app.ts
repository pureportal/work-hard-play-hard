import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { AuthUser, ClientCommand, MemberRole, ServerEvent } from "@workhard/shared";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import { characterAppearanceSchema } from "./avatar/character-schema.js";
import { AuthStore } from "./auth/auth-store.js";
import { AuthRateLimiter } from "./auth/rate-limiter.js";
import { clearSessionCookie, getSessionToken, sendInvitationError, sendRateLimit, setSessionCookie } from "./auth/auth-http.js";
import { registerEmailLinkRoutes, type EmailLinkOptions } from "./auth/email-link-routes.js";
import { registerRegistrationRoutes, type RegistrationOptions } from "./auth/registration-routes.js";
import {
  BRANDING_LOGO_MAX_BYTES,
  BrandingLogoInputError,
  processBrandingLogo,
} from "./branding/branding-logo-processor.js";
import { BrandingLogoStore, type BrandingLogoReference } from "./branding/branding-logo-store.js";
import {
  CHAT_IMAGE_MAX_BYTES,
  ChatImageStore,
  normalizeChatImageName,
} from "./chat/chat-images.js";
import { detectImageMimeType, SUPPORTED_IMAGE_MIME_TYPES } from "./images/image-input.js";
import type { ApplicationDatabase } from "./persistence/application-database.js";
import { PostgreSqlDatabase } from "./persistence/postgresql-database.js";
import {
  clientCommandSchema,
  corporateIdentityBodySchema,
  directConversationBodySchema,
  invitationAcceptBodySchema,
  invitationBodySchema,
  loginBodySchema,
  magicLinkVerifyBodySchema,
  memberAccessBodySchema,
  registrationSettingsBodySchema,
} from "./protocol.js";
import { createInitialData } from "./initial-data.js";
import { WorkspaceStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";
import { registerWhiteboardImageRoutes } from "./work/whiteboard-images.js";
import { saveWorkObject } from "./work/work-object-commands.js";
import { readSpotifyConfig, type SpotifyConfig } from "./spotify/spotify-config.js";
import { SpotifyService } from "./spotify/spotify-service.js";
import { registerSpotifyRoutes } from "./spotify/spotify-routes.js";
import { readGitHubConfig, type GitHubConfig } from "./github/github-config.js";
import { GitHubService } from "./github/github-service.js";
import { registerGitHubRoutes } from "./github/github-routes.js";
import { GITHUB_TRAY_ASSET_ID, canUseWorkObject } from "@workhard/shared";

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

interface ApplicationOptions extends EmailLinkOptions, RegistrationOptions {
  githubConfig?: GitHubConfig | null;
  githubFetch?: typeof fetch;
  spotifyConfig?: SpotifyConfig | null;
  spotifyFetch?: typeof fetch;
  database?: ApplicationDatabase;
  clientUrl?: string;
  clientOrigins?: string[];
  exposeInvitationLinks?: boolean;
  deliverInvitation?: (email: string, link: string, applicationName: string) => Promise<void>;
  logger?: boolean;
  chessNow?: () => Date;
}

export interface ApplicationContext {
  github: GitHubService;
  spotify: SpotifyService;
  app: FastifyInstance;
  store: WorkspaceStore;
  auth: AuthStore;
  runtime: WorldRuntime;
}

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const githubConfig = options.githubConfig === null ? undefined : options.githubConfig ?? readGitHubConfig();
  const spotifyConfig = options.spotifyConfig === null ? undefined : options.spotifyConfig ?? readSpotifyConfig();
  const clientUrl = normalizeClientUrl(options.clientUrl ?? process.env.CLIENT_URL ?? "http://127.0.0.1:5173");
  const clientOrigins = resolveClientOrigins(clientUrl, options.clientOrigins ?? parseClientOrigins(process.env.CLIENT_ORIGINS));
  const app = Fastify({ logger: options.logger ?? false });
  const database = options.database ?? await PostgreSqlDatabase.connect();
  const initialized = await initializePersistentState(database, options.chessNow).catch(async (error: unknown) => {
    await database.close();
    throw error;
  });
  const { auth, brandingLogo, runtime, store } = initialized;
  const github = await GitHubService.create(database, githubConfig, options.githubFetch);
  const githubSettings = store.getGitHubAppSettings();
  if (githubSettings?.connectionsResetPending) {
    await github.configure(githubConfig);
    store.updateGitHubAppSettings({ ...githubSettings, connectionsResetPending: false });
  }
  const chatImages = new ChatImageStore(database);
  const authRateLimiter = new AuthRateLimiter();
  const exposeMagicLinks = options.exposeMagicLinks === true && process.env.NODE_ENV !== "production";
  const exposeInvitationLinks = options.exposeInvitationLinks === true && process.env.NODE_ENV !== "production";
  const magicLinkEnabled = Boolean(options.deliverMagicLink || exposeMagicLinks);
  const passwordResetEnabled = Boolean(options.deliverPasswordReset || (options.exposePasswordResetLinks === true && process.env.NODE_ENV !== "production"));
  const realtimeSocketsBySession = new Map<string, Set<RealtimeSocket>>();
  const realtimeSocketsByUser = new Map<string, Set<RealtimeSocket>>();
  const realtimeCommandWindowsByUser = new Map<string, RealtimeCommandWindow>();
  const spotify = await SpotifyService.create({
    database, config: spotifyConfig,
    ...(options.spotifyFetch ? { fetcher: options.spotifyFetch } : {}),
    publish: (event) => {
      for (const sockets of realtimeSocketsByUser.values()) {
        for (const socket of sockets) sendEvent(socket, event);
      }
    },
    reportError: (error) => app.log.error(error),
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

  await app.register(cors, {
    origin: [...clientOrigins],
    credentials: true,
  });

  await app.register(websocket, {
    options: {
      maxPayload: 256 * 1024,
      perMessageDeflate: false,
    },
  });

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if ((origin && !clientOrigins.has(origin)) || (!origin && request.headers["sec-fetch-site"] === "cross-site")) {
      return reply.code(403).send({ code: "ORIGIN_FORBIDDEN", message: "Request origin is not allowed." });
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.url.startsWith("/v1/auth/")
      || request.url === "/v1/bootstrap"
      || request.url === "/v1/admin/registration-settings"
      || request.url.startsWith("/v1/admin/corporate-identity")
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
    app.addContentTypeParser(mimeType, {
      parseAs: "buffer",
      bodyLimit: Math.max(CHAT_IMAGE_MAX_BYTES, BRANDING_LOGO_MAX_BYTES),
    }, (_request, body, done) => {
      done(null, body);
    });
  }

  registerWhiteboardImageRoutes(app, {
    database,
    store, runtime, authenticate: (request) => getAuthenticatedUser(auth, request)?.id,
  });

  await registerGitHubRoutes(app, {
    service: github, clientUrl, secureCookie: githubConfig?.redirectUri.startsWith("https:") ?? false,
    authenticate: (request) => {
      const sessionToken = getSessionToken(request.headers.cookie);
      const user = auth.getUserFromSession(sessionToken);
      return user && sessionToken ? { userId: user.id, sessionToken } : undefined;
    },
    canOpenTray: (userId, objectId) => {
      const object = store.getObject(objectId);
      const layout = object && store.getVisibleLayout(object.floorId, userId);
      const player = runtime.serializePlayers().find((candidate) => candidate.userId === userId);
      return Boolean(object?.assetId === GITHUB_TRAY_ASSET_ID && layout && player?.connected && canUseWorkObject(object, layout, player));
    },
  });

  await registerSpotifyRoutes(app, {
    service: spotify, clientUrl,
    authenticate: (request) => {
      const sessionToken = getSessionToken(request.headers.cookie);
      const user = auth.getUserFromSession(sessionToken);
      return user && sessionToken ? { userId: user.id, sessionToken } : undefined;
    },
  });

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
  app.get("/v1/version", async () => ({ version: "6.0.0", protocol: 11 }));

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
      magicLinkEnabled,
      passwordResetEnabled,
      corporateIdentity: store.getCorporateIdentity(),
    };
  });

  registerRegistrationRoutes(app, { ...options, auth, store, runtime, rateLimiter: authRateLimiter, clientUrl, persist });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "LOGIN_INVALID", message: "Enter your username and password." });
    }
    const identifier = parsed.data.identifier.normalize(parsed.data.identifier.includes("@") ? "NFC" : "NFKC").trim().toLowerCase();
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

  const drainAuthEmails = registerEmailLinkRoutes(app, {
    ...options, auth, store, rateLimiter: authRateLimiter, clientUrl,
    onPasswordReset: (userId) => {
      for (const socket of realtimeSocketsByUser.get(userId) ?? []) {
        socket.close(AUTHENTICATION_CLOSE_CODE, "Password changed");
      }
    },
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
      await persist();
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

  app.put("/v1/admin/corporate-identity", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageGlobalSettings(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change corporate identity." });
    }
    const parsed = corporateIdentityBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "CORPORATE_IDENTITY_INVALID", message: "Check the corporate identity settings." });
    }
    const corporateIdentity = store.updateCorporateIdentity(parsed.data);
    await persist();
    runtime.publishCorporateIdentity(corporateIdentity);
    return corporateIdentity;
  });

  app.put("/v1/admin/corporate-identity/logo", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageGlobalSettings(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change the corporate logo." });
    }
    const retryAfter = authRateLimiter.consume("branding-logo-upload", user.id, 20, AUTH_WINDOW_MS);
    if (retryAfter) {
      return sendRateLimit(reply, retryAfter);
    }
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0 || body.length > BRANDING_LOGO_MAX_BYTES) {
      return reply.code(400).send({ code: "BRANDING_LOGO_INVALID", message: "Choose an image up to 5 MB." });
    }
    const detectedMimeType = detectImageMimeType(body);
    const declaredMimeType = request.headers["content-type"]?.split(";", 1)[0];
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      return reply.code(415).send({ code: "BRANDING_LOGO_TYPE_INVALID", message: "Choose a PNG, JPEG, GIF, or WebP image." });
    }
    let processed;
    try {
      processed = await processBrandingLogo(body);
    } catch (error) {
      if (error instanceof BrandingLogoInputError) {
        return reply.code(422).send({ code: "BRANDING_LOGO_INVALID", message: "Choose a valid image." });
      }
      throw error;
    }
    const reference = await brandingLogo.save(processed);
    const corporateIdentity = store.updateCorporateIdentityLogo(brandingLogoUrl(reference));
    await persist();
    runtime.publishCorporateIdentity(corporateIdentity);
    return corporateIdentity;
  });

  app.delete("/v1/admin/corporate-identity/logo", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.canManageGlobalSettings(user.id)) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change the corporate logo." });
    }
    await brandingLogo.remove();
    const corporateIdentity = store.updateCorporateIdentityLogo(undefined);
    await persist();
    runtime.publishCorporateIdentity(corporateIdentity);
    return corporateIdentity;
  });

  app.get("/v1/branding/logo.webp", async (request, reply) => {
    const { v: version } = request.query as { v?: string };
    const logo = await brandingLogo.read();
    if (!logo || version !== logo.version) {
      return reply.code(404).send({ code: "BRANDING_LOGO_NOT_FOUND", message: "Logo not found." });
    }
    const etag = `"${logo.version}"`;
    reply
      .header("content-type", logo.mimeType)
      .header("content-length", logo.data.length)
      .header("etag", etag)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "public, max-age=31536000, immutable");
    if (request.headers["if-none-match"] === etag) {
      return reply.code(304).send();
    }
    return reply.send(logo.data);
  });

  app.put("/v1/members/me/character", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return reply.code(401).send({ code: "AUTH_REQUIRED", message: "Sign in to continue." });
    }
    if (!store.getMember(user.id)) {
      return reply.code(404).send({ code: "USER_NOT_FOUND", message: "User not found." });
    }
    const parsed = characterAppearanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "CHARACTER_INVALID", message: "Choose an option for each part of your character." });
    }
    const member = store.updateMemberCharacter(user.id, parsed.data);
    await persist();
    runtime.publishMember(member);
    return member;
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
    await chatImages.save(imageId, body);
    try {
      const message = store.addMessage(conversationId, user.id, "", [attachment]);
      runtime.publishChatMessage(message);
      return reply.code(201).send(message);
    } catch (error) {
      await chatImages.remove(imageId);
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
    const source = await chatImages.read(imageId);
    if (!source) {
      return reply.code(404).send({ code: "IMAGE_NOT_FOUND", message: "Image not found." });
    }
    return reply
      .header("content-type", attachment.mimeType)
      .header("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, max-age=86400")
      .send(source);
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
    const retryAfter = authRateLimiter.consume("invitation-issue", user.id, 30, AUTH_WINDOW_MS);
    if (retryAfter) return sendRateLimit(reply, retryAfter);
    let issued: ReturnType<WorkspaceStore["issueInvitation"]>;
    try {
      issued = store.issueInvitation(parsed.data.email, parsed.data.role as Exclude<MemberRole, "owner">, parsed.data.permissions);
    } catch (error) {
      return sendInvitationError(reply, error instanceof Error ? error.message : "INVITATION_INVALID");
    }
    const invitationUrl = new URL("/auth/invite", clientUrl);
    invitationUrl.hash = new URLSearchParams({ invite: issued.token }).toString();
    const inviteLink = invitationUrl.toString();
    await persist();
    if (options.deliverInvitation) {
      try {
        await options.deliverInvitation(
          issued.invitation.email,
          inviteLink,
          store.getCorporateIdentity().applicationName,
        );
      } catch (error) {
        store.rollbackInvitationIssue(issued.invitation.id, issued.supersededInvitationIds);
        await persist();
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
      await persist();
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
      if (parsed.data.type === "work.update") {
        const command = parsed.data as Extract<ClientCommand, { type: "work.update" }>;
        void saveWorkObject(command, {
          peerId, store, runtime, database, persist, send: (event) => sendEvent(socket, event),
        }).catch((error: unknown) => {
          app.log.error(error);
          sendEvent(socket, { type: "command.error", requestId: command.requestId, code: "WORK_SAVE_FAILED", message: "Your board could not be saved. Try saving again." });
        });
        return;
      }
      runtime.handleCommand(peerId, parsed.data as ClientCommand);
      const economyCommand = parsed.data.type.startsWith("economy.") || parsed.data.type.startsWith("public_economy.") || parsed.data.type === "project.submit";
      if (parsed.data.type.startsWith("chess.") || economyCommand) {
        void persist().catch((error: unknown) => {
          app.log.error(error);
          sendEvent(socket, {
            type: "command.error",
            ...requestIdFromCandidate(candidate),
            code: economyCommand ? "ECONOMY_SAVE_FAILED" : "CHESS_SAVE_FAILED",
            message: economyCommand ? "The transaction could not be saved. Reconnect to check your balances." : "Your game could not be saved. Reconnect to check its state.",
          });
        });
      }
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
        spotify.setOnline(user.id, false);
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
      if (userSockets.size === 1) spotify.setOnline(user.id, true);
      sendEvent(socket, { type: "spotify.snapshot", serverTime: Date.now(), activities: spotify.snapshot() });
    } catch {
      socket.close(AUTHENTICATION_CLOSE_CODE, "Session invalid");
    }
  });

  app.addHook("onReady", async () => {
    spotify.start();
    runtime.start();
    persistenceTimer = setInterval(() => {
      void persist().catch((error) => app.log.error(error));
      void database.cleanupWhiteboardImages().catch((error) => app.log.error(error));
    }, 10_000);
  });

  app.addHook("onClose", async () => {
    await drainAuthEmails();
    if (persistenceTimer) {
      clearInterval(persistenceTimer);
    }
    runtime.stop();
    await spotify.close();
    await github.close();
    try {
      await persist();
    } finally {
      try {
        await auth.close();
      } finally {
        await database.close();
      }
    }
  });

  return { app, store, auth, runtime, spotify, github };
}

async function initializePersistentState(database: ApplicationDatabase, chessNow?: () => Date) {
  const store = new WorkspaceStore(createInitialData());
  const savedState = await database.loadWorkspaceState();
  if (savedState) {
    store.restoreMutableState(savedState.store);
  }

  const brandingLogo = new BrandingLogoStore(database);
  store.updateCorporateIdentityLogo(brandingLogoUrl(await brandingLogo.getReference()), false);

  const auth = await AuthStore.create({ database });
  const runtime = new WorldRuntime(store, chessNow ? { chessNow } : {});
  if (savedState) {
    runtime.restorePlayers(savedState.players);
  } else {
    await database.saveWorkspaceState({
      players: runtime.serializePlayers(),
      store: store.exportMutableState(),
    });
  }
  return { auth, brandingLogo, runtime, store };
}

function brandingLogoUrl(reference: BrandingLogoReference | undefined): string | undefined {
  return reference ? `/v1/branding/logo.webp?v=${encodeURIComponent(reference.version)}` : undefined;
}

function getAuthenticatedUser(auth: AuthStore, request: FastifyRequest): AuthUser | undefined {
  return auth.getUserFromSession(getSessionToken(request.headers.cookie));
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
  if (process.env.NODE_ENV === "production" && url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("CLIENT_URL must use HTTPS for non-loopback addresses in production.");
  }
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
