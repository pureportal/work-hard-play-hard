import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { ApplicationContext } from "../app.js";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { SPOTIFY_SCOPES } from "./spotify-client.js";
import { playbackBody, spotifyRecord, spotifyTestConfig, testTrackId } from "./spotify-test-fixtures.js";

const contexts: ApplicationContext[] = [];
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(contexts.splice(0).map(({ app }) => app.close()));
});

async function setup(connected = false) {
  const database = new MemoryDatabase();
  if (connected) {
    await database.saveSpotifyConnection(spotifyRecord());
    await database.saveSpotifyConnection(spotifyRecord("user-leo", false));
  }
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).endsWith("/api/token")
    ? Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, scope: SPOTIFY_SCOPES.join(" ") })
    : String(url).endsWith("/play") ? new Response(null, { status: 204 }) : Response.json(playbackBody()));
  const context = await createTestApplication({ database, fixture: true, spotifyConfig: spotifyTestConfig, spotifyFetch: fetcher });
  contexts.push(context);
  const session = await context.auth.authenticate("maya", "northstar");
  const cookie = `whph_session=${session!.sessionToken}`;
  return { ...context, database, fetcher, cookie };
}

describe("Spotify account routes", () => {
  it("completes a session-bound PKCE flow, defaults sharing off, and rejects replay", async () => {
    const { app, cookie, fetcher, database } = await setup();
    const start = await app.inject({ method: "POST", url: "/v1/spotify/connect", headers: { cookie }, payload: {} });
    expect(start.statusCode).toBe(200);
    const authorize = new URL(start.json().url);
    expect(authorize.origin).toBe("https://accounts.spotify.com");
    expect(authorize.searchParams.get("scope")).toBe(SPOTIFY_SCOPES.join(" "));
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = `/v1/spotify/callback?state=${authorize.searchParams.get("state")}&code=test-code`;
    const callbackCookie = `${cookie}; ${start.cookies[0]!.name}=${start.cookies[0]!.value}`;
    const result = await app.inject({ url: callback, headers: { cookie: callbackCookie } });
    expect(result.headers.location).toBe("http://127.0.0.1:5173/?spotify=connected");
    const exchange = fetcher.mock.calls[0]![1]!.body as URLSearchParams;
    expect(createHash("sha256").update(exchange.get("code_verifier")!).digest("base64url")).toBe(authorize.searchParams.get("code_challenge"));
    expect(exchange.has("client_secret")).toBe(false);
    const status = await app.inject({ url: "/v1/spotify", headers: { cookie } });
    expect(status.json()).toMatchObject({ configured: true, connected: true, sharing: false });
    expect(status.headers["cache-control"]).toBe("no-store");
    expect(status.body).not.toContain("test-access");
    expect(JSON.stringify(await database.loadSpotifyConnections())).not.toContain("test-refresh");
    const replay = await app.inject({ url: callback, headers: { cookie: callbackCookie } });
    expect(replay.headers.location).toContain("spotify=error");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const disconnect = await app.inject({ method: "DELETE", url: "/v1/spotify", headers: { cookie } });
    expect(disconnect.json().connected).toBe(false);
    expect(await database.loadSpotifyConnections()).toEqual([]);
  });

  it("rejects missing cookie, wrong session, CSRF, and a callback after disconnect", async () => {
    const { app, auth, cookie, fetcher } = await setup();
    expect((await app.inject({ method: "POST", url: "/v1/spotify/connect", payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/spotify/connect", headers: { cookie, origin: "https://attacker.example" }, payload: {} })).statusCode).toBe(403);
    const start = await app.inject({ method: "POST", url: "/v1/spotify/connect", headers: { cookie }, payload: {} });
    const state = new URL(start.json().url).searchParams.get("state");
    const callback = `/v1/spotify/callback?state=${state}&code=test-code`;
    expect((await app.inject({ url: callback, headers: { cookie } })).headers.location).toContain("spotify=error");
    const otherSession = await auth.authenticate("maya", "northstar");
    expect((await app.inject({ url: callback, headers: { cookie: `whph_session=${otherSession!.sessionToken}; whph_spotify_state=${state}` } })).headers.location).toContain("spotify=error");
    await app.inject({ method: "DELETE", url: "/v1/spotify", headers: { cookie } });
    expect((await app.inject({ url: callback, headers: { cookie: `${cookie}; whph_spotify_state=${state}` } })).headers.location).toContain("spotify=error");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("handles declined consent and missing setup without creating a connection", async () => {
    const { app, cookie, fetcher } = await setup();
    const start = await app.inject({ method: "POST", url: "/v1/spotify/connect", headers: { cookie }, payload: {} });
    const state = new URL(start.json().url).searchParams.get("state");
    const declined = await app.inject({ url: `/v1/spotify/callback?state=${state}&error=access_denied`, headers: { cookie: `${cookie}; whph_spotify_state=${state}` } });
    expect(declined.headers.location).toContain("spotify=cancelled");
    expect(fetcher).not.toHaveBeenCalled();
    const disabled = await createTestApplication({ database: new MemoryDatabase(), fixture: true, spotifyConfig: null });
    contexts.push(disabled);
    const login = await disabled.auth.authenticate("maya", "northstar");
    const response = await disabled.app.inject({ method: "POST", url: "/v1/spotify/connect", headers: { cookie: `whph_session=${login!.sessionToken}` }, payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("SPOTIFY_NOT_CONFIGURED");
  });

  it("broadcasts updates to two players, shares one poll across tabs, and controls the listener’s device", async () => {
    const { app, spotify, auth, fetcher, cookie } = await setup(true);
    await spotify.setSharing("user-maya", false);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    const leo = await auth.authenticate("leo", "northstar");
    const leoCookie = `whph_session=${leo!.sessionToken}`;
    const events: unknown[][] = [[], [], []];
    for (const [index, loginCookie] of [cookie, cookie, leoCookie].entries()) {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/realtime?floorId=floor-studio`, { headers: { cookie: loginCookie } });
      sockets.push(socket);
      socket.on("message", (data) => events[index]!.push(JSON.parse(data.toString())));
      await vi.waitFor(() => expect(events[index]!.some((event) => (event as { type: string }).type === "spotify.snapshot")).toBe(true), { timeout: 10_000 });
    }
    const enabled = await app.inject({ method: "PUT", url: "/v1/spotify/sharing", headers: { cookie }, payload: { sharing: true } });
    expect(enabled.json().sharing).toBe(true);
    spotify.tick();
    await vi.waitFor(() => expect(spotify.snapshot()).toHaveLength(1), { timeout: 10_000 });
    await vi.waitFor(() => expect(events.every((list) => list.some((event) => (event as { type: string }).type === "spotify.activity"))).toBe(true), { timeout: 10_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const play = await app.inject({ method: "POST", url: "/v1/spotify/play", headers: { cookie: leoCookie }, payload: { targetUserId: "user-maya", trackId: testTrackId } });
    expect(play.json()).toEqual({ played: true });
    expect(fetcher.mock.calls.at(-1)![1]!.headers).toMatchObject({ authorization: "Bearer test-access-user-leo" });
    sockets[0]!.close();
    await new Promise<void>((resolve) => sockets[0]!.once("close", () => resolve()));
    expect(spotify.snapshot()).toHaveLength(1);
    const sharing = await app.inject({ method: "PUT", url: "/v1/spotify/sharing", headers: { cookie }, payload: { sharing: false } });
    expect(sharing.json().sharing).toBe(false);
    await vi.waitFor(() => expect(events[2]!.some((event) => (event as { type: string; activity?: unknown }).type === "spotify.activity" && (event as { activity: unknown }).activity === null)).toBe(true), { timeout: 10_000 });
    expect(JSON.stringify(events)).not.toContain("test-access");
  });
});
