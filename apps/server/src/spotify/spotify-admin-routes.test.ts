import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { spotifyRecord, spotifyTestConfig } from "./spotify-test-fixtures.js";

const applications: Awaited<ReturnType<typeof createTestApplication>>[] = [];
afterEach(async () => { await Promise.all(applications.splice(0).map(({ app }) => app.close())); });

async function setup() {
  const database = new MemoryDatabase();
  await database.saveSpotifyConnection(spotifyRecord());
  const context = await createTestApplication({ fixture: true, database, spotifyConfig: spotifyTestConfig });
  applications.push(context);
  const cookie = async (name: string) => ({ cookie: `whph_session=${(await context.auth.authenticate(name, "northstar"))!.sessionToken}` });
  return { ...context, database, cookie };
}

const settings = { clientId: "newclient123", redirectUri: "https://office.example.com/v1/spotify/callback" };

describe("Spotify server administration", () => {
  it("limits configuration to server roles and never exposes the encryption key", async () => {
    const { app, cookie } = await setup();
    expect((await app.inject({ url: "/v1/admin/spotify" })).statusCode).toBe(401);
    for (const name of ["jonas", "noah"]) {
      expect((await app.inject({ url: "/v1/admin/spotify", headers: await cookie(name) })).statusCode).toBe(403);
    }
    const result = await app.inject({ url: "/v1/admin/spotify", headers: await cookie("leo") });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ clientId: spotifyTestConfig.clientId, redirectUri: spotifyTestConfig.redirectUri, encryptionReady: true });
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("persists app settings, disconnects previous accounts and uses the new app for connections", async () => {
    const { app, cookie, database, store } = await setup();
    const organisation = structuredClone(store.getOrganisation());
    const headers = await cookie("leo");
    const result = await app.inject({ method: "PUT", url: "/v1/admin/spotify", headers, payload: settings });
    expect(result.statusCode).toBe(200);
    expect((await database.loadWorkspaceState())!.store.spotifyAppSettings).toEqual(settings);
    expect(await database.loadSpotifyConnections()).toEqual([]);
    expect(store.getOrganisation()).toEqual(organisation);
    const connection = await app.inject({ method: "POST", url: "/v1/spotify/connect", headers, payload: {} });
    expect(new URL(connection.json().url).searchParams.get("client_id")).toBe(settings.clientId);
  });

  it("rejects insecure and malformed callback URLs", async () => {
    const { app, cookie, store } = await setup();
    const headers = await cookie("maya");
    const previous = store.getSpotifyAppSettings();
    for (const redirectUri of ["http://office.example.com/v1/spotify/callback", "https://user:password@office.example.com/v1/spotify/callback", "https://office.example.com/wrong", "https://office.example.com/v1/spotify/callback?token=x"]) {
      expect((await app.inject({ method: "PUT", url: "/v1/admin/spotify", headers, payload: { ...settings, redirectUri } })).statusCode).toBe(400);
    }
    expect(store.getSpotifyAppSettings()).toEqual(previous);
  });

  it("restores settings when saving fails and permits retrying failed reconfiguration", async () => {
    const { app, cookie, database, store } = await setup();
    const headers = await cookie("maya");
    const previous = store.getSpotifyAppSettings();
    vi.spyOn(database, "saveWorkspaceState").mockRejectedValueOnce(new Error("save failed"));
    expect((await app.inject({ method: "PUT", url: "/v1/admin/spotify", headers, payload: settings })).statusCode).toBe(500);
    expect(store.getSpotifyAppSettings()).toEqual(previous);
    vi.spyOn(database, "removeSpotifyConnection").mockRejectedValueOnce(new Error("connection cleanup failed"));
    expect((await app.inject({ method: "PUT", url: "/v1/admin/spotify", headers, payload: settings })).statusCode).toBe(503);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/spotify", headers, payload: settings })).statusCode).toBe(200);
    expect(await database.loadSpotifyConnections()).toEqual([]);
  });
});
