import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationContext } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { createTestApplication } from "../testing/application.js";

const contexts: ApplicationContext[] = [];
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.app.close()));
  vi.restoreAllMocks();
});

async function setup(database = new MemoryDatabase()) {
  const context = await createTestApplication({ database, fixture: true, spotifyConfig: null, githubConfig: null });
  contexts.push(context);
  const session = await context.auth.authenticate("maya", "northstar");
  return { ...context, database, headers: { cookie: `whph_session=${session!.sessionToken}` } };
}

describe("Game guide state", () => {
  it("persists start, skip, completion and replay across application restarts", async () => {
    const { app, database, headers } = await setup();
    const initial = await app.inject({ url: "/v1/me/game-guide", headers });
    expect(initial.json()).toEqual({ status: null });
    expect(initial.headers["cache-control"]).toBe("no-store");
    for (const status of ["started", "skipped", "started", "completed"]) {
      const saved = await app.inject({ method: "PUT", url: "/v1/me/game-guide", headers, payload: { status } });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual({ status });
      expect(await database.loadGameGuideStatus("user-maya")).toBe(status);
    }
    await app.close();
    contexts.splice(0, 1);
    const restarted = await setup(database);
    expect((await restarted.app.inject({ url: "/v1/me/game-guide", headers: restarted.headers })).json()).toEqual({ status: "completed" });
  }, 15_000);

  it("requires authentication, rejects invalid state and prevents changing another player", async () => {
    const { app, auth, database, headers } = await setup();
    expect((await app.inject({ url: "/v1/me/game-guide" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: "/v1/me/game-guide", payload: { status: "skipped" } })).statusCode).toBe(401);
    for (const payload of [{ status: "unknown" }, { status: null }, {}, { status: "skipped", userId: "user-leo" }]) {
      expect((await app.inject({ method: "PUT", url: "/v1/me/game-guide", headers, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "PUT", url: "/v1/me/game-guide", headers: { ...headers, origin: "https://attacker.example" }, payload: { status: "skipped" } })).statusCode).toBe(403);
    await app.inject({ method: "PUT", url: "/v1/me/game-guide", headers, payload: { status: "skipped" } });
    const other = await auth.authenticate("leo", "northstar");
    const response = await app.inject({ url: "/v1/me/game-guide", headers: { cookie: `whph_session=${other!.sessionToken}` } });
    expect(response.json()).toEqual({ status: null });
    expect(await database.loadGameGuideStatus("user-maya")).toBe("skipped");
  });

  it("reports database failures without acknowledging an unsaved change", async () => {
    const { app, database, headers } = await setup();
    vi.spyOn(database, "saveGameGuideStatus").mockRejectedValue(new Error("Database unavailable"));
    expect((await app.inject({ method: "PUT", url: "/v1/me/game-guide", headers, payload: { status: "completed" } })).statusCode).toBe(500);
    expect(await database.loadGameGuideStatus("user-maya")).toBeNull();
    vi.spyOn(database, "loadGameGuideStatus").mockRejectedValue(new Error("Database unavailable"));
    expect((await app.inject({ url: "/v1/me/game-guide", headers })).statusCode).toBe(500);
  });
});
