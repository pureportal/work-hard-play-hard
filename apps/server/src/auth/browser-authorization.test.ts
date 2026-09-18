import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationContext } from "../app.js";
import { createTestApplication } from "../testing/application.js";
import { githubFetcher, githubTestConfig } from "../github/github-test-fixtures.js";
import { spotifyTestConfig } from "../spotify/spotify-test-fixtures.js";
import { SPOTIFY_SCOPES } from "../spotify/spotify-client.js";

const contexts: ApplicationContext[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(contexts.splice(0).map(({ app }) => app.close()));
});

async function setup(provider: "spotify" | "github") {
  const fetcher = provider === "github" ? githubFetcher() : vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, scope: SPOTIFY_SCOPES.join(" "),
  }));
  const context = await createTestApplication({ fixture: true,
    spotifyConfig: spotifyTestConfig, spotifyFetch: fetcher, githubConfig: githubTestConfig, githubFetch: fetcher });
  contexts.push(context);
  const session = (await context.auth.authenticate("maya", "northstar"))!;
  const cookie = `whph_session=${session.sessionToken}`;
  const start = await context.app.inject({ method: "POST", url: `/v1/${provider}/connect`, headers: { cookie }, payload: { native: true } });
  expect(start.statusCode).toBe(200);
  expect(start.cookies).toEqual([]);
  expect(start.body).not.toContain(session.sessionToken);
  const url = new URL(start.json().url);
  const browserUrl = url.pathname + url.search;
  return { ...context, fetcher, session, cookie, browserUrl };
}

describe.each(["spotify", "github"] as const)("%s desktop authorization", (provider) => {
  it("connects without an app session in the browser and rejects reused links and callbacks", async () => {
    const { app, cookie, fetcher, browserUrl } = await setup(provider);
    const browser = await app.inject({ url: browserUrl });
    expect(browser.statusCode).toBe(302);
    expect(browser.headers["cache-control"]).toBe("no-store");
    expect(browser.headers["referrer-policy"]).toBe("no-referrer");
    expect(browser.headers["set-cookie"]).toContain("HttpOnly; SameSite=Lax");
    const authorize = new URL(browser.headers.location!);
    expect(authorize.origin).toBe(provider === "spotify" ? "https://accounts.spotify.com" : "https://github.com");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect((await app.inject({ url: browserUrl })).statusCode).toBe(400);
    const callback = `/v1/${provider}/callback?state=${authorize.searchParams.get("state")}&code=test`;
    const missingCookie = await app.inject({ url: callback });
    expect(missingCookie.body).toContain("was not connected");
    expect(fetcher).not.toHaveBeenCalled();
    const browserCookie = `${browser.cookies[0]!.name}=${browser.cookies[0]!.value}`;
    const result = await app.inject({ url: callback, headers: { cookie: browserCookie } });
    expect(result.body).toContain("connected. Return to the app.");
    expect(result.headers.location).toBeUndefined();
    expect((await app.inject({ url: `/v1/${provider}`, headers: { cookie } })).json().connected).toBe(true);
    const calls = fetcher.mock.calls.length;
    expect((await app.inject({ url: callback, headers: { cookie: browserCookie } })).statusCode).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });

  it("rejects callbacks after the desktop session is revoked", async () => {
    const { app, auth, session, fetcher, browserUrl } = await setup(provider);
    const browser = await app.inject({ url: browserUrl });
    const state = new URL(browser.headers.location!).searchParams.get("state");
    await auth.revokeSession(session.sessionToken);
    const result = await app.inject({ url: `/v1/${provider}/callback?state=${state}&code=test`,
      headers: { cookie: `${browser.cookies[0]!.name}=${browser.cookies[0]!.value}` } });
    expect(result.body).toContain("was not connected");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects expired browser handoffs", async () => {
    const { app, fetcher, browserUrl } = await setup(provider);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 600_001);
    expect((await app.inject({ url: browserUrl })).statusCode).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
