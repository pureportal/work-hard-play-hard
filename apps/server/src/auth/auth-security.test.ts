import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "../app.js";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createApplication>>[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function application(options: Parameters<typeof createTestApplication>[0] = {}) {
  const context = await createTestApplication({ fixture: true, ...options });
  applications.push(context);
  return context;
}

function linkToken(link: string, key: string): string {
  return new URLSearchParams(new URL(link).hash.slice(1)).get(key)!;
}

describe("password recovery API", () => {
  it("resets without signing in and rejects old sessions and replay", async () => {
    const context = await application();
    const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const requested = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio" } });
    expect(requested.statusCode).toBe(202);
    expect(requested.headers["cache-control"]).toBe("no-store");
    const token = linkToken(requested.json().resetLink, "reset");
    const reset = await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password: "new-password" } });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ passwordReset: true });
    expect(reset.headers["set-cookie"]).toContain("Max-Age=0");
    const session = await context.app.inject({ url: "/v1/auth/session", headers: { cookie } });
    expect(session.json().user).toBeNull();
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token, password: "replay-password" } })).statusCode).toBe(401);
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "new-password" } })).statusCode).toBe(200);
  });

  it("returns identical responses before slow delivery or account lookup can reveal account existence", async () => {
    let finishDelivery!: () => void;
    const deliverPasswordReset = vi.fn(() => new Promise<void>((resolve) => { finishDelivery = resolve; }));
    const context = await application({ exposePasswordResetLinks: false, deliverPasswordReset });
    try {
      const known = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio" } });
      const unknown = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "unknown@example.com" } });
      expect(known.statusCode).toBe(202);
      expect(unknown.statusCode).toBe(202);
      expect(known.json()).toEqual(unknown.json());
      expect(known.json()).toEqual({ message: "Check your email." });
      await vi.waitFor(() => expect(deliverPasswordReset).toHaveBeenCalledOnce());
    } finally {
      finishDelivery?.();
    }
  });

  it("revokes failed deliveries without leaking account existence", async () => {
    const database = new MemoryDatabase();
    const deliverPasswordReset = vi.fn(async () => { throw new Error("SMTP unavailable"); });
    const context = await application({ database, exposePasswordResetLinks: false, deliverPasswordReset });
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio" } });
    expect(response.statusCode).toBe(202);
    await context.app.close();
    expect(deliverPasswordReset).toHaveBeenCalledOnce();
    expect((await database.loadAuthState())?.passwordResets).toEqual([]);
  });

  it("limits requests by normalized email across IP addresses and limits token guesses", async () => {
    const context = await application();
    for (let index = 0; index < 5; index += 1) {
      const response = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", remoteAddress: `192.0.2.${index + 1}`, payload: { email: index % 2 ? " MAYA@NORTHSTAR.STUDIO " : "maya@northstar.studio" } });
      expect(response.statusCode).toBe(202);
    }
    const limited = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio" } });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    for (let index = 0; index < 30; index += 1) {
      expect((await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token: "x".repeat(43), password: "new-password" } })).statusCode).toBe(401);
    }
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token: "x".repeat(43), password: "new-password" } })).statusCode).toBe(429);
  });

  it("preserves invitations in recovery emails and notifies the user after a password change", async () => {
    const deliverPasswordChanged = vi.fn(async () => undefined);
    const context = await application({ deliverPasswordChanged });
    const invitationToken = "i".repeat(43);
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio", invitationToken } });
    expect(linkToken(response.json().resetLink, "invite")).toBe(invitationToken);
    const reset = await context.app.inject({ method: "POST", url: "/v1/auth/reset-password", payload: { token: linkToken(response.json().resetLink, "reset"), password: "new-password" } });
    expect(reset.statusCode).toBe(200);
    await context.app.close();
    expect(deliverPasswordChanged).toHaveBeenCalledWith("maya@northstar.studio", expect.any(String));
  });

  it("fails closed without email delivery and never exposes tokens in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const context = await application({ clientUrl: "https://office.example.com" });
    const session = await context.app.inject("/v1/auth/session");
    expect(session.json()).toMatchObject({ magicLinkEnabled: false, passwordResetEnabled: false });
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "maya@northstar.studio" } })).statusCode).toBe(503);
    const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
    expect(login.headers["set-cookie"]).toContain("HttpOnly");
    expect(login.headers["set-cookie"]).toContain("Secure");
    const defaultContext = await createApplication({ database: new MemoryDatabase(), clientUrl: "https://office.example.com" });
    applications.push(defaultContext);
    expect((await defaultContext.app.inject("/v1/auth/session")).json().magicLinkEnabled).toBe(false);
  });

  it("blocks untrusted origins, originless cross-site requests, and insecure production email URLs", async () => {
    const context = await application();
    for (const headers of [{ origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }]) {
      expect((await context.app.inject({ method: "POST", url: "/v1/auth/forgot-password", headers, payload: { email: "maya@northstar.studio" } })).statusCode).toBe(403);
    }
    vi.stubEnv("NODE_ENV", "production");
    await expect(createApplication({ database: new MemoryDatabase(), clientUrl: "http://office.example.com" })).rejects.toThrow("HTTPS");
  });

  it("delivers production links over HTTPS without including them in API responses", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const deliverMagicLink = vi.fn(async () => undefined);
    const deliverPasswordReset = vi.fn(async () => undefined);
    const context = await application({ clientUrl: "https://office.example.com", deliverMagicLink, deliverPasswordReset });
    for (const url of ["/v1/auth/magic-link", "/v1/auth/forgot-password"]) {
      const response = await context.app.inject({ method: "POST", url, payload: { email: "maya@northstar.studio" } });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ message: "Check your email." });
    }
    await context.app.close();
    expect(deliverMagicLink).toHaveBeenCalledWith("maya@northstar.studio", expect.stringMatching(/^https:\/\/office\.example\.com\/auth\/magic#magic=/), expect.any(String));
    expect(deliverPasswordReset).toHaveBeenCalledWith("maya@northstar.studio", expect.stringMatching(/^https:\/\/office\.example\.com\/auth\/reset#reset=/), expect.any(String));
  });
});

describe("registration verification", () => {
  it("requires mailbox ownership before granting a domain exemption and uses the policy at verification time", async () => {
    const context = await application();
    context.store.updateRegistrationSettings({ enabled: true, invitationRequired: true, whitelistedDomains: ["trusted.example"], defaultRole: "admin" });
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "new-user", email: "new@trusted.example", password: "new-password" } });
    expect(response.statusCode).toBe(202);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(context.store.getMembers().some((member) => member.email === "new@trusted.example")).toBe(false);
    expect(await context.auth.authenticate("new-user", "new-password")).toBeUndefined();
    const token = linkToken(response.json().registrationLink, "registration");
    context.store.updateRegistrationSettings({ enabled: false, invitationRequired: true, whitelistedDomains: [], defaultRole: "guest" });
    const denied = await context.app.inject({ method: "POST", url: "/v1/auth/register/verify", payload: { token } });
    expect(denied.statusCode).toBe(403);
    context.store.updateRegistrationSettings({ enabled: true, invitationRequired: true, whitelistedDomains: ["trusted.example"], defaultRole: "guest" });
    const verified = await context.app.inject({ method: "POST", url: "/v1/auth/register/verify", payload: { token } });
    expect(verified.statusCode).toBe(201);
    expect(context.store.getMember(verified.json().user.id)?.role).toBe("guest");
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/register/verify", payload: { token } })).statusCode).toBe(401);
  });

  it("removes undelivered verification tokens and rejects expired tokens", async () => {
    const database = new MemoryDatabase();
    const delivery = vi.fn(async () => { throw new Error("SMTP unavailable"); });
    const context = await application({ database, exposeRegistrationLinks: false, deliverRegistrationLink: delivery });
    context.store.updateRegistrationSettings({ enabled: true, invitationRequired: false, whitelistedDomains: [], defaultRole: "member" });
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "new-user", email: "new@example.com", password: "new-password" } });
    expect(response.statusCode).toBe(502);
    expect((await database.loadAuthState())?.registrationLinks).toEqual([]);
    const pending = await context.auth.createRegistrationLink("new-user", "new@example.com", "new-password");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(pending.expiresAt));
    expect((await context.app.inject({ method: "POST", url: "/v1/auth/register/verify", payload: { token: pending.token } })).statusCode).toBe(401);
    expect(context.store.getMembers().some((member) => member.email === "new@example.com")).toBe(false);
  });
});
