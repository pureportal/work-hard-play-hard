import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEvent, WorldObject } from "@workhard/shared";
import type { ApplicationContext } from "../app.js";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { githubFetcher, githubRecord, githubTestConfig } from "./github-test-fixtures.js";

const contexts: ApplicationContext[] = [];
afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.app.close())); vi.useRealTimers(); });

async function setup(connected = false) {
  const database = new MemoryDatabase();
  if (connected) for (const id of ["user-maya", "user-leo"]) await database.saveGitHubConnection(githubRecord(id));
  const fetcher = githubFetcher();
  const context = await createTestApplication({ database, fixture: true, spotifyConfig: null, githubConfig: githubTestConfig, githubFetch: fetcher });
  contexts.push(context);
  const session = await context.auth.authenticate("maya", "northstar");
  const cookie = `whph_session=${session!.sessionToken}`;
  return { ...context, database, fetcher, cookie };
}

describe("GitHub connection routes", () => {
  it("uses session-bound PKCE, stores only encrypted tokens, and rejects callback replay", async () => {
    const { app, cookie, fetcher, database } = await setup();
    const start = await app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie }, payload: {} });
    const url = new URL(start.json().url);
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(start.headers["set-cookie"]).toContain("HttpOnly; SameSite=Lax");
    const state = url.searchParams.get("state");
    const headers = { cookie: `${cookie}; whph_github_state=${state}` };
    const callback = `/v1/github/callback?state=${state}&code=test`;
    const result = await app.inject({ url: callback, headers });
    expect(result.headers.location).toBe("http://127.0.0.1:5173/?github=connected");
    const exchange = fetcher.mock.calls[0]![1]!.body as URLSearchParams;
    expect(createHash("sha256").update(exchange.get("code_verifier")!).digest("base64url")).toBe(url.searchParams.get("code_challenge"));
    expect(exchange.get("client_secret")).toBe(githubTestConfig.clientSecret);
    expect(JSON.stringify(await database.loadGitHubConnections())).not.toMatch(/ghu_|ghr_/);
    const status = await app.inject({ url: "/v1/github", headers: { cookie } });
    expect(status.json()).toMatchObject({ connected: true, login: "maya" });
    expect(status.headers["cache-control"]).toBe("no-store");
    expect(status.body).not.toMatch(/ghu_|ghr_|client-secret/);
    expect((await app.inject({ url: callback, headers })).headers.location).toContain("github=error");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await app.inject({ method: "DELETE", url: "/v1/github", headers: { cookie } })).json().connected).toBe(false);
    expect(await database.loadGitHubConnections()).toEqual([]);
  });

  it("rejects missing sessions, CSRF, wrong cookies and other login sessions", async () => {
    const { app, auth, cookie, fetcher } = await setup();
    expect((await app.inject({ method: "POST", url: "/v1/github/connect", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie, origin: "https://attacker.example" }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie, "content-type": "text/plain" }, payload: "{}" })).statusCode).toBe(415);
    const start = await app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie }, payload: {} });
    const state = new URL(start.json().url).searchParams.get("state");
    const callback = `/v1/github/callback?state=${state}&code=test`;
    expect((await app.inject({ url: callback, headers: { cookie } })).headers.location).toContain("github=error");
    const other = await auth.authenticate("maya", "northstar");
    expect((await app.inject({ url: callback, headers: { cookie: `whph_session=${other!.sessionToken}; whph_github_state=${state}` } })).headers.location).toContain("github=error");
    await app.inject({ method: "DELETE", url: "/v1/github", headers: { cookie } });
    expect((await app.inject({ url: callback, headers: { cookie: `${cookie}; whph_github_state=${state}` } })).headers.location).toContain("github=error");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles denied consent and disabled configuration", async () => {
    const { app, cookie, fetcher, database } = await setup();
    const start = await app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie }, payload: {} });
    const state = new URL(start.json().url).searchParams.get("state");
    const declined = await app.inject({ url: `/v1/github/callback?state=${state}&error=access_denied`, headers: { cookie: `${cookie}; whph_github_state=${state}` } });
    expect(declined.headers.location).toContain("github=cancelled");
    expect(await database.loadGitHubConnections()).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    const disabled = await createTestApplication({ database: new MemoryDatabase(), fixture: true, spotifyConfig: null, githubConfig: null });
    contexts.push(disabled);
    const login = await disabled.auth.authenticate("maya", "northstar");
    const response = await disabled.app.inject({ method: "POST", url: "/v1/github/connect", headers: { cookie: `whph_session=${login!.sessionToken}` }, payload: {} });
    expect(response.statusCode).toBe(503);
  });

  it("keeps a shared tray's PRs private to each player and checks position before and after fetching", async () => {
    const { app, cookie, auth, runtime, store, fetcher } = await setup(true);
    const layout = store.getLayout("floor-studio")!;
    const tray: WorldObject = { id: "tray", assetId: "decor-pr-tray", floorId: layout.floorId, x: 192, y: 192, rotation: 0, variantId: "ivory" };
    store.replaceLayout({ ...layout, revision: layout.revision + 1, rooms: [], walls: [], openings: [], objects: [tray] });
    const events: ServerEvent[] = [];
    runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 220, y: 232 })));
    runtime.connect("user-maya", layout.floorId, (event) => events.push(event));
    runtime.connect("user-leo", layout.floorId, (event) => events.push(event));
    const leo = await auth.authenticate("leo", "northstar");
    const endpoint = "/v1/github/trays/tray?repository=team/private&view=reviews";
    const response = await app.inject({ url: endpoint, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, pullRequests: [{ title: "Private launch", url: "https://github.com/team/private/pull/12", reviewDecision: "REVIEW_REQUIRED" }] });
    expect(response.headers["cache-control"]).toBe("no-store");
    const graph = fetcher.mock.calls.find(([url]) => String(url).endsWith("/graphql"))!;
    expect(JSON.parse(graph[1]!.body as string).variables.search).toBe("repo:team/private is:pr is:open review-requested:@me sort:updated-desc");
    const denied = await app.inject({ url: endpoint, headers: { cookie: `whph_session=${leo!.sessionToken}` } });
    expect(denied.statusCode).toBe(403);
    expect(denied.body).not.toContain("Private launch");
    expect(JSON.stringify(events)).not.toMatch(/Private launch|team\/private|ghu_|ghr_/);
    expect(JSON.stringify(store.exportMutableState())).not.toMatch(/Private launch|team\/private|ghu_|ghr_/);
    expect((await app.inject({ url: `${endpoint}&userId=user-maya`, headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ url: "/v1/github/trays/tray?repository=team/private%20repo:other/secret&view=mine", headers: { cookie } })).statusCode).toBe(400);
    fetcher.mockImplementationOnce(async () => {
      runtime.restorePlayers(runtime.serializePlayers().map((player) => ({ ...player, x: 800, y: 800 })));
      return Response.json({ full_name: "team/private", private: true });
    });
    const moved = await app.inject({ url: endpoint, headers: { cookie } });
    expect(moved.statusCode).toBe(403);
    expect(moved.body).not.toContain("Private launch");
    fetcher.mockClear();
    expect((await app.inject({ url: endpoint, headers: { cookie } })).statusCode).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
