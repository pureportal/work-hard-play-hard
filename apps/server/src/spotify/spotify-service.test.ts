import type { SpotifyEvent } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { readSpotifyConfig } from "./spotify-config.js";
import { decryptTokens } from "../security/encrypted-tokens.js";
import { SpotifyService } from "./spotify-service.js";
import { playbackBody, spotifyRecord, spotifyTestConfig, testTrackId } from "./spotify-test-fixtures.js";

let service: SpotifyService;
let database: MemoryDatabase;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
let events: SpotifyEvent[];

beforeEach(async () => {
  vi.useFakeTimers();
  database = new MemoryDatabase();
  await database.saveSpotifyConnection(spotifyRecord());
  fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(playbackBody()));
  events = [];
  service = await SpotifyService.create({ database, config: spotifyTestConfig, fetcher, publish: (event) => events.push(event), reportError: (error) => { throw error; } });
});
afterEach(async () => { await service.close(); vi.useRealTimers(); });

async function poll() {
  service.tick();
  await vi.advanceTimersByTimeAsync(1);
}

describe("Spotify presence", () => {
  it("polls only online sharing accounts and reuses one sample for every observer", async () => {
    await poll();
    expect(fetcher).not.toHaveBeenCalled();
    service.setOnline("user-maya", true);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.snapshot()[0]).toMatchObject({ title: "Test song", artist: "Test artist", album: "Test album", trackId: testTrackId });
    service.tick();
    service.snapshot();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await service.setSharing("user-maya", false);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(service.snapshot()).toEqual([]);
    expect(events.at(-1)).toMatchObject({ activity: null });
    expect((await database.loadSpotifyConnections())[0]?.sharing).toBe(false);
  });

  it.each(["paused", "empty", "private", "local", "episode", "malformed"])("clears activity and Jam on %s playback", async (kind) => {
    service.setOnline("user-maya", true);
    await poll();
    service.setJam("user-maya", "https://spotify.link/testJam");
    const body = playbackBody();
    if (kind === "paused") body.is_playing = false;
    if (kind === "private") body.device.is_private_session = true;
    if (kind === "local") body.item.is_local = true;
    if (kind === "episode") body.currently_playing_type = "episode";
    if (kind === "malformed") body.item.id = "invalid";
    fetcher.mockResolvedValueOnce(kind === "empty" ? new Response(null, { status: 204 }) : Response.json(body));
    await vi.advanceTimersByTimeAsync(20_000);
    await poll();
    expect(service.snapshot()).toEqual([]);
    expect(service.status("user-maya").jamUrl).toBeNull();
  });

  it("changes songs, expires a sample at track end and removes disconnected presence", async () => {
    service.setOnline("user-maya", true);
    await poll();
    const changed = playbackBody("0VjIjW4GlUZAMYd2vXMi3b");
    changed.progress_ms = changed.item.duration_ms - 2000;
    fetcher.mockResolvedValueOnce(Response.json(changed));
    await vi.advanceTimersByTimeAsync(15_000);
    await poll();
    expect(service.snapshot()[0]?.trackId).toBe(changed.item.id);
    await vi.advanceTimersByTimeAsync(2000);
    await poll();
    expect(service.snapshot()).toEqual([]);
    await vi.advanceTimersByTimeAsync(20_000);
    await poll();
    service.setOnline("user-maya", false);
    expect(service.snapshot()).toEqual([]);
  });

  it("discards an in-flight sample after sharing is disabled", async () => {
    let respond!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { respond = resolve; }));
    service.setOnline("user-maya", true);
    await poll();
    const sharing = service.setSharing("user-maya", false);
    respond(Response.json(playbackBody()));
    await sharing;
    expect(service.snapshot()).toEqual([]);
    expect(events).toEqual([]);
  });

  it("cannot restore tokens or activity after an in-flight refresh is disconnected", async () => {
    await service.close();
    await database.saveSpotifyConnection(spotifyRecord("user-maya", true, 0));
    let respond!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { respond = resolve; }));
    service = await SpotifyService.create({ database, config: spotifyTestConfig, fetcher, publish: (event) => events.push(event), reportError: vi.fn() });
    service.setOnline("user-maya", true);
    await poll();
    const disconnect = service.disconnect("user-maya");
    respond(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }));
    await disconnect;
    expect(service.snapshot()).toEqual([]);
    expect(await database.loadSpotifyConnections()).toEqual([]);
    expect(service.status("user-maya").connected).toBe(false);
  });

  it("refreshes a rejected access token once and keeps tokens out of public payloads", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "new-access", expires_in: 3600 }));
    service.setOnline("user-maya", true);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(3);
    const record = (await database.loadSpotifyConnections())[0]!;
    const tokens = JSON.parse(decryptTokens(record.encryptedTokens!, "user-maya", spotifyTestConfig.encryptionKey));
    expect(tokens).toMatchObject({ accessToken: "new-access", refreshToken: "test-refresh-user-maya" });
    expect(JSON.stringify([events, service.status("user-maya"), record])).not.toContain("new-access");
    expect(() => decryptTokens(record.encryptedTokens!, "different-user", spotifyTestConfig.encryptionKey)).toThrow();
  });

  it("requires reconnection when the refresh token expires", async () => {
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 }));
    service.setOnline("user-maya", true);
    await poll();
    expect(service.status("user-maya")).toMatchObject({ needsReconnect: true, sharing: false, connected: false });
    expect((await database.loadSpotifyConnections())[0]?.encryptedTokens).toBeNull();
    await vi.advanceTimersByTimeAsync(120_000);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("backs off across all accounts after rate limits (quota=%s)", async (quota) => {
    service.setOnline("user-maya", true);
    await poll();
    fetcher.mockResolvedValueOnce(Response.json({ error: { reason: quota ? "QUOTA_EXCEEDED" : "RATE_LIMITED" } }, {
      status: 429, headers: quota ? {} : { "retry-after": "120" },
    }));
    await vi.advanceTimersByTimeAsync(15_000);
    await poll();
    expect(service.snapshot()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(quota ? 3_600_000 : 120_000);
    await poll();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("only plays a currently shared track and sends the command to the requesting account", async () => {
    service.setOnline("user-maya", true);
    await poll();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await service.playSameSong("user-maya", "user-maya", testTrackId);
    expect(fetcher.mock.calls.at(-1)).toMatchObject([
      "https://api.spotify.com/v1/me/player/play", { method: "PUT", body: JSON.stringify({ uris: [`spotify:track:${testTrackId}`] }) },
    ]);
    await expect(service.playSameSong("user-maya", "user-maya", "0VjIjW4GlUZAMYd2vXMi3b")).rejects.toMatchObject({ code: "SPOTIFY_TRACK_CHANGED" });
    await service.setSharing("user-maya", false);
    await expect(service.playSameSong("user-maya", "user-maya", testTrackId)).rejects.toMatchObject({ code: "SPOTIFY_TRACK_CHANGED" });
  });

  it.each([[403, "SPOTIFY_FORBIDDEN"], [404, "SPOTIFY_NO_DEVICE"]])("reports playback restriction %s", async (status, code) => {
    service.setOnline("user-maya", true);
    await poll();
    fetcher.mockResolvedValueOnce(new Response(null, { status: Number(status) }));
    await expect(service.playSameSong("user-maya", "user-maya", testTrackId)).rejects.toMatchObject({ code });
  });

  it("accepts Spotify invitations only while sharing and forgets them after an hour", async () => {
    expect(() => service.setJam("user-maya", "https://spotify.link/invite")).toThrow();
    service.setOnline("user-maya", true);
    await poll();
    expect(() => service.setJam("user-maya", "https://spotify.link.evil.example/invite")).toThrow();
    expect(() => service.setJam("user-maya", "javascript:alert(1)")).toThrow();
    expect(() => service.setJam("user-maya", "https://open.spotify.com/jam/invite")).toThrow();
    service.setJam("user-maya", "https://open.spotify.com/socialsession/invite?si=test");
    expect(service.snapshot()[0]?.jamUrl).toBe("https://open.spotify.com/socialsession/invite?si=test");
    await vi.advanceTimersByTimeAsync(3_600_001);
    await poll();
    expect(service.status("user-maya").jamUrl).toBeNull();
  });

  it("validates server setup without requiring a client secret", () => {
    expect(readSpotifyConfig({})).toBeUndefined();
    expect(() => readSpotifyConfig({ SPOTIFY_CLIENT_ID: "app" })).toThrow();
    expect(() => readSpotifyConfig({ SPOTIFY_CLIENT_ID: "app", SPOTIFY_REDIRECT_URI: "http://localhost:3001/v1/spotify/callback", SPOTIFY_TOKEN_KEY: spotifyTestConfig.encryptionKey.toString("base64") })).toThrow();
    expect(readSpotifyConfig({ SPOTIFY_CLIENT_ID: "app", SPOTIFY_REDIRECT_URI: spotifyTestConfig.redirectUri, SPOTIFY_TOKEN_KEY: spotifyTestConfig.encryptionKey.toString("base64") })?.clientId).toBe("app");
  });
});
