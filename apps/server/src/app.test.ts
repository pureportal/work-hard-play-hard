import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "./app.js";
import { MemoryDatabase } from "./persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createApplication>>[] = [];
const temporaryDirectories: string[] = [];
const defaultRegistrationAvailability = { enabled: true, invitationRequired: true };

afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function application() {
  const context = await createApplication({ database: new MemoryDatabase(), exposeMagicLinks: true, seeded: true });
  applications.push(context);
  return context;
}

async function freshApplication() {
  const context = await createApplication({ database: new MemoryDatabase(), exposeMagicLinks: true });
  applications.push(context);
  return context;
}

async function applicationWithImages() {
  const directory = await mkdtemp(join(tmpdir(), "workhard-chat-images-"));
  temporaryDirectories.push(directory);
  const context = await createApplication({
    database: new MemoryDatabase(),
    exposeMagicLinks: true,
    chatImagePath: directory,
    seeded: true,
  });
  applications.push(context);
  return context;
}

async function loginCookie(
  context: Awaited<ReturnType<typeof createApplication>>,
  identifier = "maya",
  password = "northstar",
): Promise<string> {
  const response = await context.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { identifier, password },
  });
  expect(response.statusCode).toBe(200);
  return cookieHeader(response.headers["set-cookie"]);
}

function cookieHeader(header: string | string[] | undefined): string {
  const source = Array.isArray(header) ? header[0] : header;
  if (!source) {
    throw new Error("Session cookie is missing");
  }
  return source.split(";")[0]!;
}

describe("authentication API", () => {
  it("registers the first user as owner and closes public registration", async () => {
    const context = await freshApplication();
    const setup = await context.app.inject({ method: "GET", url: "/v1/auth/session" });
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "alex.r", email: "alex@example.com", password: "correct-horse" },
    });

    expect(setup.json()).toEqual({
      user: null,
      setupRequired: true,
      registration: defaultRegistrationAvailability,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: { username: "alex.r", email: "alex@example.com" },
    });
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");

    const cookie = cookieHeader(response.headers["set-cookie"]);
    const bootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers["cache-control"]).toBe("no-store");
    expect(bootstrap.json().members).toContainEqual(expect.objectContaining({
      id: response.json().user.id,
      name: "alex.r",
      role: "owner",
      permissions: ["manage_members", "build"],
      online: false,
    }));

    const closed = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "second", email: "second@example.com", password: "correct-horse" },
    });
    const configured = await context.app.inject({ method: "GET", url: "/v1/auth/session" });
    expect(closed.statusCode).toBe(403);
    expect(closed.json()).toMatchObject({ code: "INVITATION_REQUIRED" });
    expect(configured.json()).toEqual({
      user: null,
      setupRequired: false,
      registration: defaultRegistrationAvailability,
    });
  }, 15_000);

  it("uses one response for invalid username and password combinations", async () => {
    const context = await application();
    const missing = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { identifier: "missing", password: "incorrect-password" },
    });
    const wrong = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { identifier: "maya", password: "incorrect-password" },
    });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(missing.json()).toEqual(wrong.json());
  }, 15_000);

  it("authenticates normalized email addresses and keeps concurrent sessions independent", async () => {
    const context = await application();
    const firstCookie = await loginCookie(context, "  MAYA@NORTHSTAR.STUDIO  ");
    const secondCookie = await loginCookie(context, "maya");

    expect(secondCookie).not.toBe(firstCookie);
    const firstSession = await context.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: firstCookie },
    });
    expect(firstSession.json()).toMatchObject({ user: { id: "user-maya" } });

    await context.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie: firstCookie },
    });
    const [revokedSession, activeSession, revokedBootstrap, activeBootstrap] = await Promise.all([
      context.app.inject({ method: "GET", url: "/v1/auth/session", headers: { cookie: firstCookie } }),
      context.app.inject({ method: "GET", url: "/v1/auth/session", headers: { cookie: secondCookie } }),
      context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: firstCookie } }),
      context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: secondCookie } }),
    ]);

    expect(revokedSession.json()).toEqual({
      user: null,
      setupRequired: false,
      registration: defaultRegistrationAvailability,
    });
    expect(activeSession.json()).toMatchObject({ user: { id: "user-maya" } });
    expect(revokedBootstrap.statusCode).toBe(401);
    expect(activeBootstrap.statusCode).toBe(200);
  }, 15_000);

  it("expires sessions after seven days", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-02T12:00:00.000Z"));
    const context = await application();
    const cookie = await loginCookie(context);
    now.mockReturnValue(Date.parse("2026-09-10T12:00:00.000Z"));

    const session = await context.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie },
    });
    const bootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie },
    });

    expect(session.json()).toEqual({
      user: null,
      setupRequired: false,
      registration: defaultRegistrationAvailability,
    });
    expect(bootstrap.statusCode).toBe(401);
  });

  it("restores a persisted session after an application restart", async () => {
    const database = new MemoryDatabase();
    const options = {
      database,
      seeded: true,
    } as const;
    const first = await createApplication(options);
    const cookie = await loginCookie(first);
    await first.app.close();

    const restored = await createApplication(options);
    applications.push(restored);
    const session = await restored.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie },
    });

    expect(session.json()).toMatchObject({ user: { id: "user-maya" } });
  }, 15_000);

  it("restores the initial owner and setup state after a restart", async () => {
    const database = new MemoryDatabase();
    const options = {
      database,
    } as const;
    const first = await createApplication(options);
    const registration = await first.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "first-owner", email: "owner@example.com", password: "correct-horse" },
    });
    const cookie = cookieHeader(registration.headers["set-cookie"]);
    await first.app.close();

    const restored = await createApplication(options);
    applications.push(restored);
    const session = await restored.app.inject({ method: "GET", url: "/v1/auth/session", headers: { cookie } });
    const bootstrap = await restored.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie } });

    expect(session.json()).toMatchObject({
      user: { username: "first-owner", email: "owner@example.com" },
      setupRequired: false,
    });
    expect(bootstrap.json().members).toContainEqual(expect.objectContaining({
      role: "owner",
      permissions: ["manage_members", "build"],
    }));
  }, 15_000);

  it("creates only one account for concurrent duplicate registrations", async () => {
    const context = await freshApplication();
    const payload = { username: "same-user", email: "same@example.com", password: "correct-horse" };
    const responses = await Promise.all([
      context.app.inject({ method: "POST", url: "/v1/auth/register", payload }),
      context.app.inject({ method: "POST", url: "/v1/auth/register", payload }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(context.store.getMembers().filter((member) => member.email === payload.email)).toHaveLength(1);
  }, 15_000);

  it("allows only one initial owner when different registrations race", async () => {
    const context = await freshApplication();
    const responses = await Promise.all([
      context.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { username: "first-racer", email: "first-racer@example.com", password: "correct-horse" },
      }),
      context.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { username: "second-racer", email: "second-racer@example.com", password: "correct-horse" },
      }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 403]);
    expect(context.store.getMembers()).toHaveLength(1);
    expect(context.store.getMembers()[0]).toMatchObject({
      role: "owner",
      permissions: ["manage_members", "build"],
    });
  }, 15_000);

  it("consumes a magic link once and rotates it on a new request", async () => {
    const context = await application();
    const requested = await context.app.inject({
      method: "POST",
      url: "/v1/auth/magic-link",
      payload: { email: "maya@northstar.studio" },
    });
    expect(requested.statusCode).toBe(202);
    const link = new URL(requested.json().magicLink);
    const token = new URLSearchParams(link.hash.slice(1)).get("magic");
    expect(token).toHaveLength(43);

    const verified = await context.app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: { token },
    });
    const replayed = await context.app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: { token },
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({ user: { id: "user-maya" } });
    const verifiedCookie = cookieHeader(verified.headers["set-cookie"]);
    const session = await context.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie: verifiedCookie },
    });
    expect(session.json()).toMatchObject({ user: { id: "user-maya" } });
    expect(replayed.statusCode).toBe(401);
  });

  it("revokes the current session on sign out", async () => {
    const context = await application();
    const cookie = await loginCookie(context);
    const logout = await context.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { cookie },
    });
    const session = await context.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { cookie },
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    expect(session.statusCode).toBe(200);
    expect(session.headers["cache-control"]).toBe("no-store");
    expect(session.json()).toEqual({
      user: null,
      setupRequired: false,
      registration: defaultRegistrationAvailability,
    });
  });
});

describe("registration administration", () => {
  it("keeps first-owner setup available independently of registration policy", async () => {
    const context = await freshApplication();
    context.store.updateRegistrationSettings({
      enabled: false,
      invitationRequired: true,
      whitelistedDomains: [],
      defaultRole: "guest",
    });

    const registration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "initial-owner", email: "owner@example.com", password: "correct-horse" },
    });

    expect(registration.statusCode).toBe(201);
    expect(context.store.getMember(registration.json().user.id)).toMatchObject({
      role: "owner",
      permissions: ["manage_members", "build"],
    });
  }, 15_000);

  it("lets only the owner manage registration settings", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const adminCookie = await loginCookie(context, "leo");
    const settings = {
      enabled: true,
      invitationRequired: true,
      whitelistedDomains: [" Example.COM "],
      defaultRole: "guest",
    };

    const anonymous = await context.app.inject({
      method: "GET",
      url: "/v1/admin/registration-settings",
    });
    const forbidden = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: adminCookie },
      payload: settings,
    });
    const updated = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: settings,
    });
    const retrieved = await context.app.inject({
      method: "GET",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
    });
    const invalid = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: { ...settings, whitelistedDomains: ["example.com", "EXAMPLE.COM"] },
    });
    const ownerBootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: ownerCookie },
    });
    const adminBootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: adminCookie },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(forbidden.statusCode).toBe(403);
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      enabled: true,
      invitationRequired: true,
      whitelistedDomains: ["example.com"],
      defaultRole: "guest",
    });
    expect(retrieved.json()).toEqual(updated.json());
    expect(retrieved.headers["cache-control"]).toBe("no-store");
    expect(invalid.statusCode).toBe(400);
    expect(ownerBootstrap.json().registrationSettings).toEqual(updated.json());
    expect(adminBootstrap.json()).not.toHaveProperty("registrationSettings");
  });

  it("blocks all new accounts when registration is disabled", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const invitation = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "invited-disabled@example.com", role: "member" },
    });
    const invitationToken = new URLSearchParams(new URL(invitation.json().inviteLink).hash.slice(1)).get("invite")!;
    await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: {
        enabled: false,
        invitationRequired: false,
        whitelistedDomains: ["example.com"],
        defaultRole: "member",
      },
    });

    const publicRegistration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "blocked-public", email: "blocked@example.com", password: "correct-horse" },
    });
    const invitedRegistration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "blocked-invited",
        email: "invited-disabled@example.com",
        password: "correct-horse",
        invitationToken,
      },
    });
    const session = await context.app.inject({ method: "GET", url: "/v1/auth/session" });

    expect(publicRegistration.statusCode).toBe(403);
    expect(publicRegistration.json()).toMatchObject({ code: "REGISTRATION_DISABLED" });
    expect(invitedRegistration.statusCode).toBe(403);
    expect(invitedRegistration.json()).toMatchObject({ code: "REGISTRATION_DISABLED" });
    expect(session.json().registration).toEqual({ enabled: false, invitationRequired: false });
    expect(context.store.getMembers()).not.toContainEqual(expect.objectContaining({ email: "blocked@example.com" }));
    expect(context.store.getMembers()).not.toContainEqual(expect.objectContaining({ email: "invited-disabled@example.com" }));
  }, 15_000);

  it("applies invitation exemptions and the configured default role", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: {
        enabled: true,
        invitationRequired: true,
        whitelistedDomains: ["trusted.com"],
        defaultRole: "guest",
      },
    });

    const trusted = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "trusted-user", email: "person@TRUSTED.com", password: "correct-horse" },
    });
    const uninvited = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "uninvited-user", email: "person@outside.com", password: "correct-horse" },
    });

    expect(trusted.statusCode).toBe(201);
    expect(context.store.getMember(trusted.json().user.id)).toMatchObject({ role: "guest", permissions: [] });
    expect(uninvited.statusCode).toBe(403);
    expect(uninvited.json()).toMatchObject({ code: "INVITATION_REQUIRED" });

    await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: {
        enabled: true,
        invitationRequired: false,
        whitelistedDomains: [],
        defaultRole: "admin",
      },
    });
    const open = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "open-user", email: "open@outside.com", password: "correct-horse" },
    });

    expect(open.statusCode).toBe(201);
    expect(context.store.getMember(open.json().user.id)).toMatchObject({
      role: "admin",
      permissions: ["manage_members", "build"],
    });
  }, 15_000);

  it("keeps the invitation role when public registration has another default", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const invitation = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "invitation-role@example.com", role: "guest" },
    });
    const invitationToken = new URLSearchParams(new URL(invitation.json().inviteLink).hash.slice(1)).get("invite")!;
    await context.app.inject({
      method: "PUT",
      url: "/v1/admin/registration-settings",
      headers: { cookie: ownerCookie },
      payload: {
        enabled: true,
        invitationRequired: false,
        whitelistedDomains: [],
        defaultRole: "admin",
      },
    });

    const registration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "invitation-role",
        email: "invitation-role@example.com",
        password: "correct-horse",
        invitationToken,
      },
    });

    expect(registration.statusCode).toBe(201);
    expect(context.store.getMember(registration.json().user.id)).toMatchObject({ role: "guest", permissions: [] });
  }, 15_000);
});

describe("application API", () => {
  it("rejects invalid client URLs and origins", async () => {
    await expect(createApplication({
      database: new MemoryDatabase(),
      clientUrl: "file:///northstar/index.html",
    })).rejects.toThrow("CLIENT_URL must be an HTTP or HTTPS URL");
    await expect(createApplication({
      database: new MemoryDatabase(),
      clientOrigins: ["https://northstar.example/preview"],
    })).rejects.toThrow("CLIENT_ORIGINS must contain HTTP or HTTPS origins");
  });

  it("accepts configured browser clients and rejects unknown origins", async () => {
    const context = await createApplication({
      database: new MemoryDatabase(),
      clientUrl: "https://northstar.example",
      clientOrigins: ["https://preview.northstar.example"],
    });
    applications.push(context);

    const preflight = await context.app.inject({
      method: "OPTIONS",
      url: "/v1/auth/session",
      headers: {
        origin: "https://preview.northstar.example",
        "access-control-request-method": "GET",
      },
    });
    const rejected = await context.app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: { origin: "https://untrusted.example" },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://preview.northstar.example");
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toMatchObject({ code: "ORIGIN_FORBIDDEN" });
  });

  it("serves the complete seeded workspace only to an authenticated member", async () => {
    const context = await application();
    const anonymous = await context.app.inject({ method: "GET", url: "/v1/bootstrap" });
    const cookie = await loginCookie(context);
    const response = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie },
    });
    const body = response.json();

    expect(anonymous.statusCode).toBe(401);
    expect(response.statusCode).toBe(200);
    expect(body.team.name).toBe("Northstar");
    expect(body.floors).toHaveLength(2);
    expect(body.members.length).toBeGreaterThan(5);
    expect(body.layouts[0].objects.length).toBeGreaterThan(10);
  });

  it("keeps floor geometry visible while hiding private conversations and invitations from ordinary members", async () => {
    const context = await application();
    const mayaCookie = await loginCookie(context);
    const jonasCookie = await loginCookie(context, "jonas");
    const maya = (await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: mayaCookie } })).json();
    const jonas = (await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: jonasCookie } })).json();

    expect(maya.layouts.flatMap((layout: { rooms: { id: string }[] }) => layout.rooms).some((room: { id: string }) => room.id === "room-quiet")).toBe(true);
    expect(jonas.layouts.flatMap((layout: { rooms: { id: string }[] }) => layout.rooms).some((room: { id: string }) => room.id === "room-quiet")).toBe(true);
    expect(jonas.conversations.some((conversation: { id: string }) => conversation.id === "conversation-leo")).toBe(false);
    expect(jonas.invitations).toEqual([]);
  });

  it("opens an idempotent direct conversation between any two members", async () => {
    const context = await application();
    const leoCookie = await loginCookie(context, "leo");
    const first = await context.app.inject({
      method: "POST",
      url: "/v1/conversations/direct",
      headers: { cookie: leoCookie },
      payload: { targetUserId: "user-jonas" },
    });
    const second = await context.app.inject({
      method: "POST",
      url: "/v1/conversations/direct",
      headers: { cookie: leoCookie },
      payload: { targetUserId: "user-jonas" },
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(first.json().participantIds).toEqual(["user-leo", "user-jonas"]);
    expect(context.store.getBootstrap("user-jonas").conversations).toContainEqual(expect.objectContaining({ id: first.json().id }));
    expect(context.store.getBootstrap("user-maya").conversations).not.toContainEqual(expect.objectContaining({ id: first.json().id }));
  });

  it("uploads authenticated chat images and keeps direct-chat images private", async () => {
    const context = await applicationWithImages();
    const mayaCookie = await loginCookie(context);
    const jonasCookie = await loginCookie(context, "jonas");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const upload = await context.app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-leo/images",
      headers: {
        cookie: mayaCookie,
        "content-type": "image/png",
        "x-file-name": encodeURIComponent("diagram.png"),
      },
      payload: png,
    });

    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({
      body: "",
      attachments: [{ type: "image", name: "diagram.png", mimeType: "image/png", size: png.length }],
    });
    const imageUrl = upload.json().attachments[0].url as string;
    const participantImage = await context.app.inject({ method: "GET", url: imageUrl, headers: { cookie: mayaCookie } });
    const outsiderImage = await context.app.inject({ method: "GET", url: imageUrl, headers: { cookie: jonasCookie } });
    expect(participantImage.statusCode).toBe(200);
    expect(participantImage.headers["content-type"]).toBe("image/png");
    expect(participantImage.rawPayload).toEqual(png);
    expect(outsiderImage.statusCode).toBe(404);
  });

  it("rejects an image whose declared type does not match its contents", async () => {
    const context = await applicationWithImages();
    const cookie = await loginCookie(context);
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/conversations/conversation-team/images",
      headers: { cookie, "content-type": "image/png" },
      payload: Buffer.from("not-an-image"),
    });

    expect(response.statusCode).toBe(415);
  });

  it("issues and accepts an email-bound invitation once", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const issued = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "invited@northstar.studio", role: "guest" },
    });

    expect(issued.statusCode).toBe(201);
    expect(issued.json()).toMatchObject({ email: "invited@northstar.studio", role: "guest", status: "pending" });
    const inviteUrl = new URL(issued.json().inviteLink);
    const token = new URLSearchParams(inviteUrl.hash.slice(1)).get("invite")!;
    expect(inviteUrl.pathname).toBe("/auth/invite");
    expect(token).toHaveLength(43);
    expect(JSON.stringify(context.store.exportMutableState())).not.toContain(token);

    const registration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "invited-user",
        email: "invited@northstar.studio",
        password: "correct-horse",
        invitationToken: token,
      },
    });
    const invitedCookie = cookieHeader(registration.headers["set-cookie"]);
    const replayed = await context.app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { cookie: invitedCookie },
      payload: { token },
    });
    const bootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: invitedCookie },
    });

    expect(registration.statusCode).toBe(201);
    expect(replayed.statusCode).toBe(409);
    expect(replayed.json()).toMatchObject({ code: "INVITATION_ACCEPTED" });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().members).toContainEqual(expect.objectContaining({
      id: registration.json().user.id,
      email: "invited@northstar.studio",
      role: "guest",
    }));
    expect(context.store.getBootstrap("user-maya").invitations).toContainEqual(expect.objectContaining({
      id: issued.json().id,
      status: "accepted",
    }));
  }, 15_000);

  it("applies build permission from an invitation", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const issued = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "builder@example.com", role: "member", permissions: ["build"] },
    });
    const invitationToken = new URLSearchParams(new URL(issued.json().inviteLink).hash.slice(1)).get("invite")!;
    const registration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "builder",
        email: "builder@example.com",
        password: "correct-horse",
        invitationToken,
      },
    });

    expect(issued.json()).toMatchObject({ role: "member", permissions: ["build"] });
    expect(registration.statusCode).toBe(201);
    expect(context.store.getMember(registration.json().user.id)).toMatchObject({
      role: "member",
      permissions: ["build"],
    });
    expect(context.store.canBuild(registration.json().user.id)).toBe(true);
  }, 15_000);

  it("lets an existing account accept through an invitation-preserving magic link", async () => {
    const context = await application();
    const registration = await context.auth.register("existing-user", "existing@example.com", "correct-horse");
    const ownerCookie = await loginCookie(context);
    const issued = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "existing@example.com", role: "admin" },
    });
    const invitationToken = new URLSearchParams(new URL(issued.json().inviteLink).hash.slice(1)).get("invite")!;
    const requested = await context.app.inject({
      method: "POST",
      url: "/v1/auth/magic-link",
      payload: { email: "existing@example.com", invitationToken },
    });
    const magicParameters = new URLSearchParams(new URL(requested.json().magicLink).hash.slice(1));
    const verified = await context.app.inject({
      method: "POST",
      url: "/v1/auth/magic-link/verify",
      payload: { token: magicParameters.get("magic") },
    });
    const accepted = await context.app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { cookie: cookieHeader(verified.headers["set-cookie"]) },
      payload: { token: invitationToken },
    });

    expect(magicParameters.get("invite")).toBe(invitationToken);
    expect(accepted.statusCode).toBe(200);
    expect(context.store.getMember(registration.user.id)).toMatchObject({
      email: "existing@example.com",
      role: "admin",
    });
  }, 15_000);

  it("accepts an invitation issued before an application restart", async () => {
    const database = new MemoryDatabase();
    const options = {
      database,
      exposeInvitationLinks: true,
      seeded: true,
    } as const;
    const first = await createApplication(options);
    applications.push(first);
    const ownerCookie = await loginCookie(first);
    const issued = await first.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "restart-invite@example.com", role: "guest" },
    });
    const invitationToken = new URLSearchParams(new URL(issued.json().inviteLink).hash.slice(1)).get("invite")!;
    await first.app.close();
    applications.splice(applications.indexOf(first), 1);

    const restored = await createApplication(options);
    applications.push(restored);
    const registration = await restored.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "restart-invite",
        email: "restart-invite@example.com",
        password: "correct-horse",
        invitationToken,
      },
    });

    expect(registration.statusCode).toBe(201);
    expect(restored.store.getMember(registration.json().user.id)).toMatchObject({
      email: "restart-invite@example.com",
      role: "guest",
    });
  }, 15_000);

  it("rejects wrong-email, superseded, revoked, and expired invitation links", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-02T12:00:00.000Z"));
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const issue = (email: string) => context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email, role: "member" },
    });
    const first = await issue("reissued@example.com");
    const replacement = await issue("reissued@example.com");
    const firstToken = new URLSearchParams(new URL(first.json().inviteLink).hash.slice(1)).get("invite")!;
    const replacementToken = new URLSearchParams(new URL(replacement.json().inviteLink).hash.slice(1)).get("invite")!;

    const superseded = await context.app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { cookie: ownerCookie },
      payload: { token: firstToken },
    });
    const wrongEmail = await context.app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { cookie: ownerCookie },
      payload: { token: replacementToken },
    });
    await context.app.inject({
      method: "DELETE",
      url: `/v1/teams/team-northstar/invitations/${replacement.json().id}`,
      headers: { cookie: ownerCookie },
    });
    const revoked = await context.app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { cookie: ownerCookie },
      payload: { token: replacementToken },
    });
    const expiring = await issue("expired@example.com");
    const expiringToken = new URLSearchParams(new URL(expiring.json().inviteLink).hash.slice(1)).get("invite")!;
    now.mockReturnValue(Date.parse("2026-09-10T12:00:00.000Z"));
    const expiredRegistration = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        username: "expired-user",
        email: "expired@example.com",
        password: "correct-horse",
        invitationToken: expiringToken,
      },
    });
    const expiredLogin = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { identifier: "expired-user", password: "correct-horse" },
    });

    expect(superseded.statusCode).toBe(410);
    expect(superseded.json()).toMatchObject({ code: "INVITATION_REVOKED" });
    expect(wrongEmail.statusCode).toBe(403);
    expect(wrongEmail.json()).toMatchObject({ code: "INVITATION_EMAIL_MISMATCH" });
    expect(revoked.statusCode).toBe(410);
    expect(revoked.json()).toMatchObject({ code: "INVITATION_REVOKED" });
    expect(expiredRegistration.statusCode).toBe(410);
    expect(expiredRegistration.json()).toMatchObject({ code: "INVITATION_EXPIRED" });
    expect(expiredLogin.statusCode).toBe(401);
    expect(context.store.getMembers()).not.toContainEqual(expect.objectContaining({ email: "expired@example.com" }));
  }, 15_000);

  it("does not retain an invitation when delivery fails", async () => {
    const context = await createApplication({
      database: new MemoryDatabase(),
      exposeInvitationLinks: false,
      deliverInvitation: async () => {
        throw new Error("MAIL_UNAVAILABLE");
      },
      seeded: true,
    });
    applications.push(context);
    const cookie = await loginCookie(context);
    const before = context.store.getBootstrap("user-maya").invitations;
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie },
      payload: { email: "delivery@example.com", role: "member" },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: "INVITATION_DELIVERY_FAILED" });
    expect(context.store.getBootstrap("user-maya").invitations).toEqual(before);
  });

  it("requires an authenticated editor to issue invitations", async () => {
    const context = await application();
    const memberCookie = await loginCookie(context, "jonas");
    const payload = { email: "restricted@example.com", role: "member" };
    const anonymous = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      payload,
    });
    const member = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: memberCookie },
      payload,
    });

    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(member.statusCode).toBe(403);
    expect(member.json()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not mutate the workspace through a different team path", async () => {
    const context = await application();
    const cookie = await loginCookie(context);
    const before = context.store.getBootstrap("user-maya").invitations;
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-other/invitations",
      headers: { cookie },
      payload: { email: "other@example.com", role: "member" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "TEAM_NOT_FOUND" });
    expect(context.store.getBootstrap("user-maya").invitations).toEqual(before);
  });

  it("lets owners and admins manage member roles and build permission within their authority", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const adminCookie = await loginCookie(context, "leo");
    const ownerGrant = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-jonas",
      headers: { cookie: ownerCookie },
      payload: { role: "member", permissions: ["build"] },
    });
    const adminGrant = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-priya",
      headers: { cookie: adminCookie },
      payload: { role: "member", permissions: ["build"] },
    });
    const adminPromotion = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-priya",
      headers: { cookie: adminCookie },
      payload: { role: "admin", permissions: [] },
    });
    const invalidGuestPermission = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-priya",
      headers: { cookie: ownerCookie },
      payload: { role: "guest", permissions: ["build"] },
    });

    expect(ownerGrant.statusCode).toBe(200);
    expect(ownerGrant.json()).toMatchObject({ role: "member", permissions: ["build"] });
    expect(adminGrant.statusCode).toBe(200);
    expect(adminGrant.json()).toMatchObject({ role: "member", permissions: ["build"] });
    expect(adminPromotion.statusCode).toBe(403);
    expect(invalidGuestPermission.statusCode).toBe(400);
    expect(context.store.canBuild("user-jonas")).toBe(true);
    expect(context.store.canManageMembers("user-jonas")).toBe(false);
  });

  it("restricts administrator assignment to the owner", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const adminCookie = await loginCookie(context, "leo");
    const adminInvite = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: adminCookie },
      payload: { email: "another-admin@example.com", role: "admin" },
    });
    const ownerPromotion = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-jonas",
      headers: { cookie: ownerCookie },
      payload: { role: "admin", permissions: [] },
    });
    const ownerDemotion = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-maya",
      headers: { cookie: ownerCookie },
      payload: { role: "member", permissions: [] },
    });

    expect(adminInvite.statusCode).toBe(403);
    expect(ownerPromotion.statusCode).toBe(200);
    expect(ownerPromotion.json()).toMatchObject({
      role: "admin",
      permissions: ["manage_members", "build"],
    });
    expect(ownerDemotion.statusCode).toBe(403);
    expect(context.store.getMember("user-maya")?.role).toBe("owner");
  });

  it("keeps owner-issued administrator invitations outside administrator authority", async () => {
    const context = await application();
    const ownerCookie = await loginCookie(context);
    const adminCookie = await loginCookie(context, "leo");
    const issued = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: ownerCookie },
      payload: { email: "protected-admin@example.com", role: "admin" },
    });
    const replacement = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie: adminCookie },
      payload: { email: "protected-admin@example.com", role: "member" },
    });
    const revocation = await context.app.inject({
      method: "DELETE",
      url: `/v1/teams/team-northstar/invitations/${issued.json().id}`,
      headers: { cookie: adminCookie },
    });
    const adminBootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: adminCookie },
    });

    expect(issued.statusCode).toBe(201);
    expect(replacement.statusCode).toBe(403);
    expect(revocation.statusCode).toBe(403);
    expect(adminBootstrap.json().invitations).not.toContainEqual(expect.objectContaining({ id: issued.json().id }));
    expect(context.store.getBootstrap("user-maya").invitations).toContainEqual(expect.objectContaining({
      id: issued.json().id,
      status: "pending",
    }));
  });

  it("rejects access changes from ordinary members", async () => {
    const context = await application();
    const cookie = await loginCookie(context, "jonas");
    const response = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-leo",
      headers: { cookie },
      payload: { role: "member", permissions: [] },
    });

    expect(response.statusCode).toBe(403);
  });
});
