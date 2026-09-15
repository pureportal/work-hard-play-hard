import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { decryptTokens } from "../security/encrypted-tokens.js";
import { GitHubAuthorization } from "./github-authorization.js";
import { readGitHubConfig } from "./github-config.js";
import { GitHubService } from "./github-service.js";
import { githubFetcher, githubRecord, githubTestConfig, searchBody, tokenBody } from "./github-test-fixtures.js";

afterEach(() => vi.useRealTimers());

async function setup(expired = false) {
  const database = new MemoryDatabase();
  await database.saveGitHubConnection(githubRecord("user-maya", expired));
  const fetcher = githubFetcher();
  const service = await GitHubService.create(database, githubTestConfig, fetcher);
  return { database, fetcher, service };
}

describe("GitHub credentials and failures", () => {
  it("validates complete configuration, callback URLs and keys", () => {
    expect(readGitHubConfig({})).toBeUndefined();
    expect(() => readGitHubConfig({ GITHUB_CLIENT_ID: "test" })).toThrow();
    const env = { GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "secret", GITHUB_APP_SLUG: "tray", GITHUB_TOKEN_KEY: Buffer.alloc(32, 1).toString("base64"), GITHUB_REDIRECT_URI: "https://office.example/v1/github/callback" };
    expect(readGitHubConfig(env)?.clientId).toBe("test");
    for (const url of ["http://office.example/v1/github/callback", "https://user@office.example/v1/github/callback", "https://office.example/v1/github/callback?next=evil"]) expect(() => readGitHubConfig({ ...env, GITHUB_REDIRECT_URI: url })).toThrow();
    expect(() => readGitHubConfig({ ...env, GITHUB_TOKEN_KEY: "bad" })).toThrow();
  });

  it("expires attempts and authenticates encrypted credentials against both provider and player", () => {
    vi.useFakeTimers();
    const authorization = new GitHubAuthorization();
    const { state } = authorization.begin("maya", "session", githubTestConfig);
    vi.advanceTimersByTime(600_001);
    expect(() => authorization.consume(state, state, "maya", "session")).toThrow();
    const record = githubRecord();
    expect(() => decryptTokens(record.encryptedTokens!, "github:user-leo", githubTestConfig.encryptionKey)).toThrow();
    expect(() => decryptTokens(record.encryptedTokens!, "user-maya", githubTestConfig.encryptionKey)).toThrow();
  });

  it("serializes token rotation across tabs and persists refreshed credentials", async () => {
    const { service, fetcher, database } = await setup(true);
    await Promise.all([service.repositories("user-maya", 1), service.repositories("user-maya", 1)]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("access_token"))).toHaveLength(1);
    const stored = (await database.loadGitHubConnections())[0]!;
    expect(JSON.parse(decryptTokens(stored.encryptedTokens!, "github:user-maya", githubTestConfig.encryptionKey)).accessToken).toBe("ghu_new");
    expect(fetcher.mock.calls.slice(1).every(([, options]) => new Headers(options?.headers).get("authorization") === "Bearer ghu_new")).toBe(true);
    await service.close();
  });

  it("clears revoked credentials and never returns previously fetched data after access is removed", async () => {
    const { service, fetcher, database } = await setup();
    await service.mailroom("user-maya", "team/private", "repository");
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 404 }));
    await expect(service.mailroom("user-maya", "team/private", "repository")).rejects.toMatchObject({ code: "GITHUB_ACCESS_DENIED" });
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(service.repositories("user-maya", 1)).rejects.toMatchObject({ code: "GITHUB_RECONNECT" });
    expect(service.status("user-maya")).toMatchObject({ connected: false, needsReconnect: true });
    expect((await database.loadGitHubConnections())[0]!.encryptedTokens).toBeNull();
    fetcher.mockClear();
    await expect(service.repositories("user-maya", 1)).rejects.toMatchObject({ code: "GITHUB_RECONNECT" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("respects rate limits and returns sanitized errors for network and partial GraphQL failures", async () => {
    const { service, fetcher } = await setup();
    fetcher.mockResolvedValueOnce(Response.json({ message: "sensitive response" }, { status: 429, headers: { "retry-after": "120" } }));
    await expect(service.repositories("user-maya", 1)).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED", retryAfter: 120 });
    await expect(service.repositories("user-maya", 1)).rejects.toMatchObject({ code: "GITHUB_RATE_LIMITED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const other = await setup();
    other.fetcher.mockRejectedValueOnce(new Error("ghu_secret"));
    await expect(other.service.repositories("user-maya", 1)).rejects.toMatchObject({ message: "GitHub could not be reached. Try again shortly." });
    const partial = await setup();
    partial.fetcher.mockResolvedValueOnce(Response.json({ full_name: "team/private", private: true }))
      .mockResolvedValueOnce(Response.json({ ...searchBody(), errors: [{ message: "not allowed" }] }));
    await expect(partial.service.mailroom("user-maya", "team/private", "repository")).rejects.toMatchObject({ code: "GITHUB_QUERY_FAILED" });
  });

  it("discards authorization and reads that finish after disconnect", async () => {
    const { service, fetcher, database } = await setup();
    let resolveToken!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise((resolve) => { resolveToken = resolve; }));
    service.beginConnection("user-maya", "session");
    const connection = service.completeConnection("user-maya", "code", "verifier", () => true);
    const rejected = expect(connection).rejects.toMatchObject({ code: "GITHUB_CANCELLED" });
    await vi.waitFor(() => expect(resolveToken).toBeTypeOf("function"));
    const disconnect = service.disconnect("user-maya");
    resolveToken(Response.json(tokenBody()));
    await rejected;
    await disconnect;
    expect(await database.loadGitHubConnections()).toEqual([]);
    const reading = await setup();
    let resolveRead!: (response: Response) => void;
    reading.fetcher.mockImplementationOnce(() => new Promise((resolve) => { resolveRead = resolve; }));
    const request = reading.service.repositories("user-maya", 1);
    const readRejected = expect(request).rejects.toMatchObject({ code: "GITHUB_CANCELLED" });
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf("function"));
    const removal = reading.service.disconnect("user-maya");
    resolveRead(Response.json([{ full_name: "team/private", private: true }]));
    await readRejected;
    await removal;
  });

  it("refuses non-expiring OAuth tokens and does not claim success when persistence fails", async () => {
    const { service, fetcher, database } = await setup();
    service.beginConnection("user-maya", "session");
    fetcher.mockResolvedValueOnce(Response.json({ access_token: "gho_broad", token_type: "bearer", scope: "repo" }));
    await expect(service.completeConnection("user-maya", "code", "verifier", () => true)).rejects.toMatchObject({ code: "GITHUB_APP_REQUIRED" });
    vi.spyOn(database, "saveGitHubConnection").mockRejectedValueOnce(new Error("storage failed"));
    await expect(service.completeConnection("user-maya", "code", "verifier", () => true)).rejects.toThrow("storage failed");
    expect((await database.loadGitHubConnections())[0]!.encryptedTokens).not.toBeNull();
  });

  it("aborts stalled requests and never follows redirects with credentials", async () => {
    vi.useFakeTimers();
    const { service, fetcher } = await setup();
    fetcher.mockImplementationOnce((_input, options) => new Promise((_resolve, reject) => {
      expect(options?.redirect).toBe("error");
      options!.signal!.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    }));
    const request = service.repositories("user-maya", 1);
    const rejected = expect(request).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
    await vi.advanceTimersByTimeAsync(10_001);
    await rejected;
  }, 15_000);

  it("rejects expired sessions at callback completion and failed refresh credentials", async () => {
    const { service, database } = await setup();
    const before = await database.loadGitHubConnections();
    service.beginConnection("user-maya", "session");
    await expect(service.completeConnection("user-maya", "code", "verifier", () => false)).rejects.toMatchObject({ code: "GITHUB_CANCELLED" });
    expect(await database.loadGitHubConnections()).toEqual(before);
    const expired = await setup(true);
    expired.fetcher.mockResolvedValueOnce(Response.json({ error: "bad_refresh_token" }));
    await expect(expired.service.repositories("user-maya", 1)).rejects.toMatchObject({ code: "GITHUB_RECONNECT" });
    expect(expired.service.status("user-maya").needsReconnect).toBe(true);
  });
});
