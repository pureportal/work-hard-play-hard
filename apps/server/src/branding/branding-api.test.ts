import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createApplication>>[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
});

describe("corporate identity API", () => {
  it("persists owner-managed identity and exposes it before authentication", async () => {
    const database = new MemoryDatabase();
    const context = await createApplication({ database, seeded: true });
    applications.push(context);
    const ownerCookie = await loginCookie(context);
    const adminCookie = await loginCookie(context, "leo");
    const settings = {
      applicationName: "Acme Spaces",
      primaryColor: "#123ABC",
      secondaryColor: "#F28C28",
      authenticationLayout: "centered",
    };

    const forbidden = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/corporate-identity",
      headers: { cookie: adminCookie },
      payload: settings,
    });
    const updated = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/corporate-identity",
      headers: { cookie: ownerCookie },
      payload: settings,
    });
    const session = await context.app.inject({ method: "GET", url: "/v1/auth/session" });
    const adminBootstrap = await context.app.inject({
      method: "GET",
      url: "/v1/bootstrap",
      headers: { cookie: adminCookie },
    });

    expect(forbidden.statusCode).toBe(403);
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      ...settings,
      primaryColor: "#123abc",
      secondaryColor: "#f28c28",
    });
    expect(session.json().corporateIdentity).toEqual(updated.json());
    expect(adminBootstrap.json().corporateIdentity).toEqual(updated.json());

    await context.app.close();
    applications.splice(applications.indexOf(context), 1);
    const restored = await createApplication({ database, seeded: true });
    applications.push(restored);
    expect((await restored.app.inject({ method: "GET", url: "/v1/auth/session" })).json().corporateIdentity)
      .toEqual(updated.json());
  }, 30_000);

  it("stores an optimized logo as a database BLOB and restores its public URL", async () => {
    const database = new MemoryDatabase();
    const context = await createApplication({ database, seeded: true });
    applications.push(context);
    const cookie = await loginCookie(context);
    const input = await sharp({
      create: {
        width: 1600,
        height: 600,
        channels: 4,
        background: "#2457d6",
      },
    }).png().toBuffer();

    const upload = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/corporate-identity/logo",
      headers: { cookie, "content-type": "image/png" },
      payload: input,
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.json().logoUrl).toMatch(/^\/v1\/branding\/logo\.webp\?v=/);
    const logoUrl = upload.json().logoUrl as string;
    const served = await context.app.inject({ method: "GET", url: logoUrl });
    const metadata = await sharp(served.rawPayload).metadata();
    const stored = await database.readBrandingLogo();
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(served.headers["cache-control"]).toContain("immutable");
    expect(metadata).toMatchObject({ format: "webp", width: 1024, height: 384 });
    expect(stored?.data).toEqual(served.rawPayload);

    await context.app.close();
    applications.splice(applications.indexOf(context), 1);
    const restored = await createApplication({ database, seeded: true });
    applications.push(restored);
    expect((await restored.app.inject({ method: "GET", url: "/v1/auth/session" })).json().corporateIdentity.logoUrl)
      .toBe(logoUrl);

    const removed = await restored.app.inject({
      method: "DELETE",
      url: "/v1/admin/corporate-identity/logo",
      headers: { cookie: await loginCookie(restored) },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).not.toHaveProperty("logoUrl");
    expect(await database.readBrandingLogo()).toBeUndefined();
    expect((await restored.app.inject({ method: "GET", url: logoUrl })).statusCode).toBe(404);
  }, 30_000);
});

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
