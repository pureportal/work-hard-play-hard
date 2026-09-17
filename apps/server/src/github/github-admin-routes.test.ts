import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationContext } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { createTestApplication } from "../testing/application.js";
import { resolveGitHubConfig } from "./github-config.js";
import { githubFetcher, githubRecord, githubTestConfig } from "./github-test-fixtures.js";

const applications: ApplicationContext[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setup(configured = true) {
  const database = new MemoryDatabase();
  if (configured) await database.saveGitHubConnection(githubRecord());
  const fetcher = githubFetcher();
  const context = await createTestApplication({ fixture: true, database, spotifyConfig: null,
    githubConfig: configured ? githubTestConfig : null, githubFetch: fetcher });
  applications.push(context);
  const sessions = new Map<string, string>();
  const headers = async (name = "maya") => {
    if (!sessions.has(name)) sessions.set(name, (await context.auth.authenticate(name, "northstar"))!.sessionToken);
    return { cookie: `whph_session=${sessions.get(name)}` };
  };
  return { ...context, database, fetcher, headers };
}

const settings = { clientId: "Iv1.new", clientSecret: "new-app-secret", appSlug: "new-mailroom", redirectUri: "https://office.example.com/v1/github/callback" };
const disabled = { clientId: "", appSlug: "", redirectUri: "" };

describe("GitHub server administration", () => {
  it("restricts reading and writing settings to server administrators and keeps secrets private", async () => {
    const { app, headers, store } = await setup();
    for (const method of ["GET", "PUT"] as const) {
      expect((await app.inject({ method, url: "/v1/admin/github", ...(method === "PUT" ? { payload: settings } : {}) })).statusCode).toBe(401);
      for (const name of ["jonas", "noah"]) {
        expect((await app.inject({ method, url: "/v1/admin/github", headers: await headers(name), ...(method === "PUT" ? { payload: settings } : {}) })).statusCode).toBe(403);
      }
    }
    const result = await app.inject({ url: "/v1/admin/github", headers: await headers("leo") });
    expect(result.json()).toEqual({ clientId: githubTestConfig.clientId, appSlug: githubTestConfig.appSlug,
      redirectUri: githubTestConfig.redirectUri, hasClientSecret: true, encryptionReady: true, needsApply: false });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body).not.toContain(githubTestConfig.clientSecret);
    expect(result.body).not.toContain(githubTestConfig.encryptionKey.toString("base64"));
    expect(result.body).not.toContain(store.getGitHubAppSettings()!.encryptedClientSecret);
    const bootstrap = await app.inject({ url: "/v1/bootstrap", headers: await headers() });
    expect(bootstrap.body).not.toContain("githubAppSettings");
    expect(bootstrap.body).not.toContain(githubTestConfig.clientSecret);
  }, 15_000);

  it("saves an encrypted secret, disconnects old accounts and immediately uses the new OAuth settings", async () => {
    const { app, database, fetcher, github, headers } = await setup();
    const admin = await headers();
    const pending = await app.inject({ method: "POST", url: "/v1/github/connect", headers: admin, payload: {} });
    const state = new URL(pending.json().url).searchParams.get("state")!;
    const result = await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: settings });
    expect(result.statusCode).toBe(200);
    expect(result.body).not.toContain(settings.clientSecret);
    const stored = (await database.loadWorkspaceState())!.store.githubAppSettings!;
    expect(stored).toMatchObject({ clientId: settings.clientId, appSlug: settings.appSlug, redirectUri: settings.redirectUri });
    expect(JSON.stringify(stored)).not.toContain(settings.clientSecret);
    expect(resolveGitHubConfig(stored, githubTestConfig.encryptionKey)?.clientSecret).toBe(settings.clientSecret);
    expect(await database.loadGitHubConnections()).toEqual([]);
    expect(github.status("user-maya")).toMatchObject({ connected: false, configured: true, installationUrl: "https://github.com/apps/new-mailroom/installations/new" });
    const stale = await app.inject({ url: `/v1/github/callback?state=${state}&code=stale`, headers: { cookie: `${admin.cookie}; whph_github_state=${state}` } });
    expect(stale.headers.location).toContain("github=error");
    expect(fetcher).not.toHaveBeenCalled();
    const connection = await app.inject({ method: "POST", url: "/v1/github/connect", headers: admin, payload: {} });
    const url = new URL(connection.json().url);
    expect(url.searchParams.get("client_id")).toBe(settings.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(settings.redirectUri);
    expect(connection.headers["set-cookie"]).toContain("; Secure");
    const newState = url.searchParams.get("state");
    const callback = await app.inject({ url: `/v1/github/callback?state=${newState}&code=new`, headers: { cookie: `${admin.cookie}; whph_github_state=${newState}` } });
    expect(callback.headers.location).toContain("github=connected");
    expect((fetcher.mock.calls[0]![1]!.body as URLSearchParams).get("client_secret")).toBe(settings.clientSecret);
  });

  it("keeps an omitted secret, rejects reusing it for a different app, and leaves unchanged connections intact", async () => {
    const { app, headers, store, github, database } = await setup();
    const admin = await headers();
    const original = store.getGitHubAppSettings()!;
    const payload = { clientId: original.clientId, appSlug: original.appSlug, redirectUri: original.redirectUri };
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload })).statusCode).toBe(200);
    expect(github.status("user-maya").connected).toBe(true);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: { ...payload, clientId: settings.clientId } })).statusCode).toBe(400);
    expect(store.getGitHubAppSettings()).toEqual(original);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: { ...payload, redirectUri: settings.redirectUri } })).statusCode).toBe(200);
    expect(store.getGitHubAppSettings()!.encryptedClientSecret).toBe(original.encryptedClientSecret);
    expect(await database.loadGitHubConnections()).toEqual([]);
  });

  it("supports first-time setup with only a server encryption key and restores saved settings after restart", async () => {
    vi.stubEnv("GITHUB_TOKEN_KEY", githubTestConfig.encryptionKey.toString("base64"));
    const { app, headers, database } = await setup(false);
    const admin = await headers();
    expect((await app.inject({ url: "/v1/admin/github", headers: admin })).json()).toEqual({ ...disabled, hasClientSecret: false, encryptionReady: true, needsApply: false });
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: settings })).statusCode).toBe(200);
    await app.close();
    const persisted = (await database.loadWorkspaceState())!;
    const { appSlug, clientId, redirectUri, encryptedClientSecret, connectionsResetPending } = persisted.store.githubAppSettings!;
    persisted.store.githubAppSettings = { connectionsResetPending, encryptedClientSecret, redirectUri, appSlug, clientId };
    await database.saveWorkspaceState(persisted);
    await database.saveGitHubConnection(githubRecord());
    vi.stubEnv("GITHUB_CLIENT_ID", "ignored-provisioning-id");
    const restored = await createTestApplication({ database, spotifyConfig: null, githubFetch: githubFetcher() });
    applications.push(restored);
    expect(restored.store.getGitHubAppSettings()!.clientId).toBe(settings.clientId);
    expect(restored.github.status("user-maya").configured).toBe(true);
    expect((await restored.app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: { clientId, appSlug, redirectUri } })).statusCode).toBe(200);
    expect(restored.github.status("user-maya").connected).toBe(true);
    expect(new URL(restored.github.beginConnection("user-maya", "session").url).searchParams.get("client_id")).toBe(settings.clientId);
    expect((await restored.app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: disabled })).statusCode).toBe(200);
    expect(restored.store.getGitHubAppSettings()).toEqual({ ...disabled, encryptedClientSecret: null, connectionsResetPending: false });
    expect(restored.github.status("user-maya").configured).toBe(false);
    await restored.app.close();
    const stillDisabled = await createTestApplication({ database, spotifyConfig: null, githubConfig: githubTestConfig });
    applications.push(stillDisabled);
    expect(stillDisabled.github.status("user-maya").configured).toBe(false);
  });

  it("rejects invalid settings and never stores a secret without an encryption key", async () => {
    vi.stubEnv("GITHUB_TOKEN_KEY", "");
    const unconfigured = await setup(false);
    const missingKey = await unconfigured.app.inject({ method: "PUT", url: "/v1/admin/github", headers: await unconfigured.headers(), payload: settings });
    expect(missingKey.statusCode).toBe(503);
    expect(unconfigured.store.getGitHubAppSettings()).toBeNull();
    const { app, headers, store } = await setup();
    const admin = await headers();
    const original = store.getGitHubAppSettings();
    for (const change of [
      { redirectUri: "http://office.example.com/v1/github/callback" }, { redirectUri: "https://user:password@office.example.com/v1/github/callback" },
      { redirectUri: "https://office.example.com/wrong" }, { redirectUri: `${settings.redirectUri}?token=x` }, { redirectUri: `${settings.redirectUri}#x` },
      { appSlug: "" }, { appSlug: "https://github.com/apps/test" }, { clientSecret: "" }, { clientId: "" }, { encryptionKey: "secret" },
    ]) {
      expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: { ...settings, ...change } })).statusCode).toBe(400);
    }
    expect(store.getGitHubAppSettings()).toEqual(original);
  });

  it("rolls back failed persistence and permits retrying failed credential cleanup", async () => {
    const { app, headers, database, store, github } = await setup();
    const admin = await headers();
    const original = store.getGitHubAppSettings();
    vi.spyOn(database, "saveWorkspaceState").mockRejectedValueOnce(new Error(settings.clientSecret));
    const failedSave = await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: settings });
    expect(failedSave.statusCode).toBe(500);
    expect(failedSave.body).not.toContain(settings.clientSecret);
    expect(store.getGitHubAppSettings()).toEqual(original);
    expect(github.status("user-maya").connected).toBe(true);
    vi.spyOn(database, "removeGitHubConnection").mockRejectedValueOnce(new Error("cleanup failed"));
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: settings })).statusCode).toBe(503);
    expect(github.status("user-maya")).toMatchObject({ configured: false, connected: false });
    expect((await app.inject({ url: "/v1/admin/github", headers: admin })).json().needsApply).toBe(true);
    const { clientSecret: _secret, ...retry } = settings;
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: retry })).statusCode).toBe(200);
    expect(await database.loadGitHubConnections()).toEqual([]);
    expect(github.status("user-maya").configured).toBe(true);
    expect((await app.inject({ url: "/v1/admin/github", headers: admin })).json().needsApply).toBe(false);
  });

  it("rejects overlapping saves until the current update finishes", async () => {
    const { app, headers, database, store } = await setup();
    const admin = await headers();
    const originalSave = database.saveWorkspaceState.bind(database);
    let finish!: () => void;
    vi.spyOn(database, "saveWorkspaceState").mockImplementationOnce(async (state) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      await originalSave(state);
    });
    const pending = app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: settings }).then((result) => result);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const overlapping = await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: disabled });
    finish();
    expect(overlapping.statusCode).toBe(409);
    expect((await pending).statusCode).toBe(200);
    expect(store.getGitHubAppSettings()!.clientId).toBe(settings.clientId);
  });

  it("finishes interrupted account cleanup on restart before exposing the new configuration", async () => {
    const { app, headers, database } = await setup();
    vi.spyOn(database, "removeGitHubConnection").mockRejectedValueOnce(new Error("cleanup interrupted"));
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: await headers(), payload: settings })).statusCode).toBe(503);
    expect((await database.loadWorkspaceState())!.store.githubAppSettings!.connectionsResetPending).toBe(true);
    await app.close();
    const restarted = await createTestApplication({ database, spotifyConfig: null, githubConfig: githubTestConfig });
    applications.push(restarted);
    expect(restarted.github.status("user-maya")).toMatchObject({ configured: true, connected: false });
    expect(await database.loadGitHubConnections()).toEqual([]);
    expect(restarted.store.getGitHubAppSettings()!.connectionsResetPending).toBe(false);
  });

  it("can restore the previous settings after an update fails to apply", async () => {
    const { app, headers, database, store, github } = await setup();
    const admin = await headers();
    const original = { clientId: githubTestConfig.clientId, appSlug: githubTestConfig.appSlug, redirectUri: githubTestConfig.redirectUri };
    vi.spyOn(database, "removeGitHubConnection").mockRejectedValueOnce(new Error("cleanup interrupted"));
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: { ...original, redirectUri: settings.redirectUri } })).statusCode).toBe(503);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/github", headers: admin, payload: original })).statusCode).toBe(200);
    expect(store.getGitHubAppSettings()).toMatchObject({ ...original, connectionsResetPending: false });
    expect(github.status("user-maya").configured).toBe(true);
  });
});
