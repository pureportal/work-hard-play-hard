import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { createTestApplication, populateTestWorkspace } from "../testing/application.js";

const applications: Awaited<ReturnType<typeof createTestApplication>>[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map(({ app }) => app.close()));
  vi.restoreAllMocks();
});

async function application(options: Parameters<typeof createTestApplication>[0] = {}) {
  const context = await createTestApplication(options);
  applications.push(context);
  return context;
}

describe("new player starter inventory", () => {
  it.each(["setup", "invitation", "verified"] as const)("persists one starter set through %s registration, retries, restarts, and sign-ins", async (flow) => {
    const database = new MemoryDatabase();
    const context = await application({ database, fixture: flow !== "setup" });
    const existingAccounts = context.store.exportMutableState().economy.accounts;
    const payload = { username: "starter-player", email: "starter@example.com", password: "starter-password" };
    const invitationToken = flow === "invitation" ? context.store.issueInvitation(payload.email, "member").token : undefined;
    if (flow === "verified") {
      context.store.updateRegistrationSettings({ enabled: true, invitationRequired: false, whitelistedDomains: [], defaultRole: "member" });
    }
    let response = await context.app.inject({ method: "POST", url: "/v1/auth/register", payload: { ...payload, invitationToken } });
    let token: string | undefined;
    if (flow === "verified") {
      expect(response.statusCode).toBe(202);
      expect(context.store.exportMutableState().economy.accounts).toEqual(existingAccounts);
      token = new URLSearchParams(new URL(response.json().registrationLink).hash.slice(1)).get("registration")!;
      response = await context.app.inject({ method: "POST", url: "/v1/auth/register/verify", payload: { token } });
    }
    expect(response.statusCode).toBe(201);
    const userId = response.json().user.id as string;
    const originalEconomy = context.store.getPlayerEconomy(userId);
    expect(originalEconomy.inventory.map((item) => item.assetId)).toEqual(["desk-straight", "chair-office", "decor-monitor", "decor-coffee", "decor-laptop"]);
    expect(originalEconomy).toMatchObject({ coinBalance: 250, lifetimeEarned: 250, lifetimeSpent: 0 });
    const retry = await context.app.inject({
      method: "POST", url: token ? "/v1/auth/register/verify" : "/v1/auth/register",
      payload: token ? { token } : { ...payload, invitationToken },
    });
    expect(retry.statusCode).toBe(flow === "verified" ? 401 : flow === "setup" ? 403 : 409);
    expect(context.store.getPlayerEconomy(userId)).toEqual(originalEconomy);
    expect(context.store.exportMutableState().economy.accounts.filter((account) => account.userId !== userId)).toEqual(existingAccounts);
    expect((await database.loadWorkspaceState())!.store.economy.accounts.find((account) => account.userId === userId)!.inventory)
      .toEqual(originalEconomy.inventory);

    await context.app.close();
    const restarted = await application({ database });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const login = await restarted.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: payload.username, password: payload.password } });
      expect(login.statusCode).toBe(200);
      const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
      const bootstrap = await restarted.app.inject({ url: "/v1/bootstrap", headers: { cookie } });
      expect(bootstrap.statusCode).toBe(200);
      expect(bootstrap.json().economy).toEqual(originalEconomy);
    }
  }, 15_000);

  it("does not backfill a saved player's empty inventory at startup or sign-in", async () => {
    const database = new MemoryDatabase();
    await populateTestWorkspace(database);
    const saved = (await database.loadWorkspaceState())!;
    for (const account of saved.store.economy.accounts) account.inventory = [];
    saved.store.economy.transactions = saved.store.economy.transactions.filter((transaction) => transaction.kind === "welcome");
    await database.saveWorkspaceState(saved);
    const context = await application({ database });
    const response = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
    expect(response.statusCode).toBe(200);
    expect(context.store.getPlayerEconomy("user-maya").inventory).toEqual([]);
    expect(context.store.exportMutableState().economy).toEqual(saved.store.economy);
  });

  it("keeps a single starter set when a registration save fails and persistence is retried", async () => {
    const database = new MemoryDatabase();
    const context = await application({ database, fixture: true });
    const payload = { username: "retry-player", email: "retry@example.com", password: "retry-password" };
    const invitationToken = context.store.issueInvitation(payload.email, "member").token;
    vi.spyOn(database, "saveWorkspaceState").mockRejectedValueOnce(new Error("Database temporarily unavailable"));
    const failed = await context.app.inject({ method: "POST", url: "/v1/auth/register", payload: { ...payload, invitationToken } });
    expect(failed.statusCode).toBe(500);
    const member = context.store.getMembers().find((candidate) => candidate.email === payload.email)!;
    const inventory = context.store.getPlayerEconomy(member.id).inventory;
    expect(inventory.map((item) => item.assetId)).toEqual(["desk-straight", "chair-office", "decor-monitor", "decor-coffee", "decor-laptop"]);
    const retry = await context.app.inject({ method: "POST", url: "/v1/auth/register", payload: { ...payload, invitationToken } });
    expect(retry.statusCode).toBe(409);
    await context.app.close();

    const restarted = await application({ database });
    expect(restarted.store.getPlayerEconomy(member.id).inventory).toEqual(inventory);
    expect(restarted.store.getPlayerEconomy(member.id).coinBalance).toBe(250);
  });
});
