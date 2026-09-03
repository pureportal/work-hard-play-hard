import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createApplication>>[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
});

describe("player avatar API", () => {
  it("optimizes an uploaded image and stores the resulting WebP as a database BLOB", async () => {
    const { context, database } = await application();
    const cookie = await loginCookie(context);
    const input = await sharp({
      create: {
        width: 720,
        height: 360,
        channels: 3,
        background: "#d85f45",
      },
    }).png().toBuffer();

    const upload = await context.app.inject({
      method: "PUT",
      url: "/v1/members/me/avatar",
      headers: { cookie, "content-type": "image/png" },
      payload: input,
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({
      id: "user-maya",
      avatarUrl: expect.stringMatching(/^\/v1\/members\/user-maya\/avatar\.webp\?v=/),
    });
    const avatarUrl = upload.json().avatarUrl as string;
    const served = await context.app.inject({ method: "GET", url: avatarUrl });
    const metadata = await sharp(served.rawPayload).metadata();
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect(served.rawPayload.length).toBeLessThan(input.length);
    expect(metadata).toMatchObject({ format: "webp", width: 256, height: 256 });

    const stored = await database.readAvatar("user-maya");
    expect(stored).toMatchObject({ mimeType: "image/webp", width: 256, height: 256 });
    expect(stored?.data).toEqual(served.rawPayload);

    const teammateBootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: await loginCookie(context, "leo") },
    });
    expect(teammateBootstrap.json().members).toContainEqual(expect.objectContaining({
      id: "user-maya",
      avatarUrl,
    }));
  }, 30_000);

  it("restores avatar references from the database and removes a customized avatar", async () => {
    const first = await application();
    const input = await sharp({
      create: {
        width: 64,
        height: 96,
        channels: 4,
        background: "#4f7ed7",
      },
    }).webp().toBuffer();
    const firstCookie = await loginCookie(first.context);
    const upload = await first.context.app.inject({
      method: "PUT",
      url: "/v1/members/me/avatar",
      headers: { cookie: firstCookie, "content-type": "image/webp" },
      payload: input,
    });
    expect(upload.statusCode).toBe(200);
    const uploadedAvatarUrl = upload.json().avatarUrl as string;
    await first.context.app.close();
    applications.splice(applications.indexOf(first.context), 1);

    const restored = await createApplication({
      database: first.database,
      seeded: true,
    });
    applications.push(restored);
    const restoredCookie = await loginCookie(restored);
    const bootstrap = await restored.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: restoredCookie },
    });
    const avatarUrl = bootstrap.json().members.find((member: { id: string }) => member.id === "user-maya").avatarUrl as string;
    expect(avatarUrl).toBe(uploadedAvatarUrl);

    const removed = await restored.app.inject({
      method: "DELETE",
      url: "/v1/members/me/avatar",
      headers: { cookie: restoredCookie },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).not.toHaveProperty("avatarUrl");
    expect((await restored.app.inject({ method: "GET", url: avatarUrl })).statusCode).toBe(404);
  }, 30_000);

  it("rejects corrupt image data before it reaches the avatar database", async () => {
    const { context, database } = await application();
    const cookie = await loginCookie(context);
    const corruptPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const upload = await context.app.inject({
      method: "PUT",
      url: "/v1/members/me/avatar",
      headers: { cookie, "content-type": "image/png" },
      payload: corruptPng,
    });

    expect(upload.statusCode).toBe(422);
    expect(await database.getAvatarReferences()).toHaveLength(0);
  }, 30_000);
});

async function application() {
  const database = new MemoryDatabase();
  const context = await createApplication({
    database,
    seeded: true,
  });
  applications.push(context);
  return { context, database };
}

async function loginCookie(
  context: Awaited<ReturnType<typeof createApplication>>,
  identifier = "maya",
): Promise<string> {
  const response = await context.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { identifier, password: "northstar" },
  });
  expect(response.statusCode).toBe(200);
  const header = response.headers["set-cookie"];
  const source = Array.isArray(header) ? header[0] : header;
  if (!source) {
    throw new Error("Session cookie is missing");
  }
  return source.split(";", 1)[0]!;
}
