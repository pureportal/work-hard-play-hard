import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "./app.js";

const applications: Awaited<ReturnType<typeof createApplication>>[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function application() {
  const context = await createApplication({ checkpointEnabled: false, exposeMagicLinks: true });
  applications.push(context);
  return context;
}

async function applicationWithImages() {
  const directory = await mkdtemp(join(tmpdir(), "workhard-chat-images-"));
  temporaryDirectories.push(directory);
  const context = await createApplication({ checkpointEnabled: false, exposeMagicLinks: true, chatImagePath: directory });
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
  it("registers a member and starts an authenticated session", async () => {
    const context = await application();
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { username: "alex.r", email: "alex@example.com", password: "correct-horse" },
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
    expect(bootstrap.json().members).toContainEqual(expect.objectContaining({
      id: response.json().user.id,
      name: "alex.r",
    }));
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

  it("creates only one account for concurrent duplicate registrations", async () => {
    const context = await application();
    const payload = { username: "same-user", email: "same@example.com", password: "correct-horse" };
    const responses = await Promise.all([
      context.app.inject({ method: "POST", url: "/v1/auth/register", payload }),
      context.app.inject({ method: "POST", url: "/v1/auth/register", payload }),
    ]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(context.store.getMembers().filter((member) => member.email === payload.email)).toHaveLength(1);
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
    expect(session.json()).toEqual({ user: null });
  });
});

describe("application API", () => {
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

  it("hides members-only rooms, private conversations, and invitations from ordinary members", async () => {
    const context = await application();
    const mayaCookie = await loginCookie(context);
    const jonasCookie = await loginCookie(context, "jonas");
    const maya = (await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: mayaCookie } })).json();
    const jonas = (await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: jonasCookie } })).json();

    expect(maya.layouts.flatMap((layout: { areas: { id: string }[] }) => layout.areas).some((area: { id: string }) => area.id === "area-quiet")).toBe(true);
    expect(jonas.layouts.flatMap((layout: { areas: { id: string }[] }) => layout.areas).some((area: { id: string }) => area.id === "area-quiet")).toBe(false);
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

  it("validates and records seeded-team invitations", async () => {
    const context = await application();
    const cookie = await loginCookie(context);
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/teams/team-northstar/invitations",
      headers: { cookie },
      payload: { email: "new@northstar.studio", role: "member" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ email: "new@northstar.studio", status: "pending" });
  });

  it("rejects role changes from ordinary members", async () => {
    const context = await application();
    const cookie = await loginCookie(context, "jonas");
    const response = await context.app.inject({
      method: "PATCH",
      url: "/v1/teams/team-northstar/members/user-leo",
      headers: { cookie },
      payload: { role: "member" },
    });

    expect(response.statusCode).toBe(403);
  });
});
