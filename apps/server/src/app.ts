import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import websocket from "@fastify/websocket";
import type { AuthUser, ClientCommand, MemberRole, ServerEvent } from "@workhard/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { AuthStore } from "./auth/auth-store.js";
import { AuthRateLimiter } from "./auth/rate-limiter.js";
import {
  CHAT_IMAGE_MAX_BYTES,
  ChatImageStore,
  detectChatImageMimeType,
  normalizeChatImageName,
  type ChatImageMimeType,
} from "./chat/chat-images.js";
import { CheckpointStore } from "./persistence/checkpoint-store.js";
import {
  clientCommandSchema,
  directConversationBodySchema,
  invitationBodySchema,
  loginBodySchema,
  magicLinkRequestBodySchema,
  magicLinkVerifyBodySchema,
  registerBodySchema,
  roleBodySchema,
} from "./protocol.js";
import { DemoStore } from "./store.js";
import { WorldRuntime } from "./world/world-runtime.js";

const SESSION_COOKIE_NAME = "whph_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const AUTH_WINDOW_MS = 15 * 60 * 1_000;

interface ApplicationOptions {
  checkpointPath?: string;
  checkpointEnabled?: boolean;
  authPath?: string;
  authPersistenceEnabled?: boolean;
  chatImagePath?: string;
  appOrigin?: string;
  exposeMagicLinks?: boolean;
  deliverMagicLink?: (email: string, link: string) => Promise<void>;
  logger?: boolean;
}

export interface ApplicationContext {
  app: FastifyInstance;
  store: DemoStore;
  auth: AuthStore;
  runtime: WorldRuntime;
}

const defaultCheckpointPath = fileURLToPath(
  new URL("../../../.data/checkpoint.json", import.meta.url),
);
const defaultAuthPath = fileURLToPath(
  new URL("../../../.data/auth.json", import.meta.url),
);
const defaultChatImagePath = fileURLToPath(
  new URL("../../../.data/chat-images", import.meta.url),
);

export async function createApplication(options: ApplicationOptions = {}): Promise<ApplicationContext> {
  const app = Fastify({ logger: options.logger ?? false });
  const store = new DemoStore();
  const checkpoint = new CheckpointStore(options.checkpointPath ?? defaultCheckpointPath);
  const checkpointEnabled = options.checkpointEnabled ?? true;
  const savedState = checkpointEnabled ? await checkpoint.load() : undefined;
  if (savedState) {
    store.restoreMutableState(savedState.store);
  }
  const auth = await AuthStore.create({
    filePath: options.authPath ?? defaultAuthPath,
    persistenceEnabled: options.authPersistenceEnabled ?? checkpointEnabled,
    members: store.getMembers(),
  });
  const runtime = new WorldRuntime(store);
  const chatImages = new ChatImageStore(options.chatImagePath ?? defaultChatImagePath);
  if (savedState) {
    runtime.restorePlayers(savedState.players);
  }
  const authRateLimiter = new AuthRateLimiter();
  const appOrigin = options.appOrigin ?? process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
  const exposeMagicLinks = options.exposeMagicLinks ?? process.env.NODE_ENV !== "production";

  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
    },
  });

  for (const mimeType of ["image/png", "image/jpeg", "image/gif", "image/webp"] as const) {
    app.addContentTypeParser(mimeType, { parseAs: "buffer", bodyLimit: CHAT_IMAGE_MAX_BYTES }, (_request, body, done) => {
      done(null, body);
    });
  }

  app.get("/v1/health/live", async () => ({ status: "ok" }));
  app.get("/v1/health/ready", async () => ({ status: "ready", checkpoint: checkpointEnabled }));
  app.get("/v1/version", async () => ({ version: "0.1.0", protocol: 5 }));

  app.get("/v1/auth/session", async (request, reply) => {
    const user = getAuthenticatedUser(auth, request);
    if (!user) {
      return { user: null };
    }
    return { user };
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
      const registered = await auth.register(parsed.data.username, parsed.data.email, parsed.data.password);
      try {
        store.addMember(registered.user);
      } catch (error) {
        await auth.removeAccount(registered.user.id);
        throw error;
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
      const fragment = new URLSearchParams({ magic: magicLink.token });
      const magicUrl = new URL("/auth/magic", appOrigin);
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
    await auth.revokeSession(getSessionToken(request.headers.cookie));
    clearSessionCookie(reply);
    return { signedOut: true };
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
    const detectedMimeType = detectChatImageMimeType(body);
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
    const userId = requireEditor(auth, store, request);
    if (!userId) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot invite members." });
    }
    const parsed = invitationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "INVITATION_INVALID", message: "Enter a valid email." });
    }
    const invitation = store.addInvitation(parsed.data.email, parsed.data.role as Exclude<MemberRole, "owner">);
    runtime.publishWorkspaceAccess();
    return reply.code(201).send(invitation);
  });

  app.delete("/v1/teams/:teamId/invitations/:invitationId", async (request, reply) => {
    const userId = requireEditor(auth, store, request);
    if (!userId) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot revoke invitations." });
    }
    const params = request.params as { invitationId: string };
    try {
      const invitation = store.revokeInvitation(params.invitationId);
      runtime.publishWorkspaceAccess();
      return invitation;
    } catch {
      return reply.code(404).send({ code: "INVITATION_NOT_FOUND", message: "Invitation not found." });
    }
  });

  app.patch("/v1/teams/:teamId/members/:memberId", async (request, reply) => {
    const userId = requireEditor(auth, store, request);
    if (!userId) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You cannot change roles." });
    }
    const parsed = roleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "ROLE_INVALID", message: "Choose a valid role." });
    }
    const params = request.params as { memberId: string };
    try {
      const member = store.updateRole(params.memberId, parsed.data.role);
      runtime.publishRoleChange(member);
      return member;
    } catch (error) {
      const code = error instanceof Error ? error.message : "MEMBER_UPDATE_FAILED";
      return reply.code(code === "USER_NOT_FOUND" ? 404 : 409).send({ code, message: "Role could not be changed." });
    }
  });

  app.get("/v1/realtime", { websocket: true }, (socket, request) => {
    const user = auth.getUserFromSession(getSessionToken(request.headers.cookie));
    if (!user) {
      socket.close(1008, "Authentication required");
      return;
    }
    const query = request.query as { floorId?: string };
    const floorId = query.floorId ?? "";
    let peerId = "";
    let heartbeatReceived = true;
    const heartbeatTimer = setInterval(() => {
      if (socket.readyState !== 1) {
        clearInterval(heartbeatTimer);
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
      if (!peerId) {
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
        sendEvent(socket, { type: "command.error", code: "MESSAGE_INVALID", message: "Message is invalid." });
        return;
      }
      runtime.handleCommand(peerId, parsed.data as ClientCommand);
    });

    socket.on("pong", () => {
      heartbeatReceived = true;
    });
    const disconnect = () => {
      clearInterval(heartbeatTimer);
      runtime.disconnect(peerId);
    };
    socket.on("close", disconnect);
    socket.on("error", disconnect);

    try {
      peerId = runtime.connect(user.id, floorId, (event) => sendEvent(socket, event));
    } catch {
      socket.close(1008, "Session invalid");
    }
  });

  let checkpointTimer: NodeJS.Timeout | undefined;
  let pendingCheckpoint: Promise<void> | undefined;

  const persist = async (): Promise<void> => {
    if (!checkpointEnabled || (!runtime.dirty && !store.dirty)) {
      return;
    }
    if (pendingCheckpoint) {
      await pendingCheckpoint;
      return;
    }
    pendingCheckpoint = checkpoint.save({
      schemaVersion: 5,
      savedAt: new Date().toISOString(),
      players: runtime.serializePlayers(),
      store: store.exportMutableState(),
    });
    try {
      await pendingCheckpoint;
      runtime.markClean();
      store.markClean();
    } finally {
      pendingCheckpoint = undefined;
    }
  };

  app.addHook("onReady", async () => {
    runtime.start();
    if (checkpointEnabled) {
      checkpointTimer = setInterval(() => void persist(), 10_000);
    }
  });

  app.addHook("onClose", async () => {
    if (checkpointTimer) {
      clearInterval(checkpointTimer);
    }
    runtime.stop();
    await persist();
    await auth.close();
  });

  return { app, store, auth, runtime };
}

function getAuthenticatedUser(auth: AuthStore, request: FastifyRequest): AuthUser | undefined {
  return auth.getUserFromSession(getSessionToken(request.headers.cookie));
}

function requireEditor(auth: AuthStore, store: DemoStore, request: FastifyRequest): string | undefined {
  const user = getAuthenticatedUser(auth, request);
  return user && store.canEdit(user.id) ? user.id : undefined;
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
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}; Priority=High${secure}`);
}

function clearSessionCookie(reply: FastifyReply): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("set-cookie", `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Priority=High${secure}`);
}

function sendRateLimit(reply: FastifyReply, retryAfter: number): FastifyReply {
  return reply.code(429).header("retry-after", String(retryAfter)).send({
    code: "RATE_LIMITED",
    message: "Too many attempts. Try again later.",
  });
}

function sendEvent(socket: { readyState: number; send: (data: string) => void }, event: ServerEvent): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(event));
  }
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
