import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "./auth-store.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { populateTestWorkspace } from "../testing/application.js";

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const database = new MemoryDatabase();
  await populateTestWorkspace(database);
  const auth = await AuthStore.create({ database });
  return { auth, database };
}

describe("authentication token security", () => {
  it("stores only a hash of reset tokens and consumes one reset under concurrent requests", async () => {
    const { auth, database } = await fixture();
    const original = await auth.authenticate("maya", "northstar");
    const other = await auth.authenticate("jonas", "northstar");
    const magic = await auth.createMagicLink("maya@northstar.studio");
    const reset = await auth.createPasswordReset(" MAYA@northstar.studio ");
    expect(reset?.token).toHaveLength(43);
    expect((await database.loadAuthState())?.passwordResets).toEqual([{
      tokenHash: createHash("sha256").update(reset!.token).digest("hex"),
      userId: "user-maya", expiresAt: reset!.expiresAt,
    }]);
    expect(await auth.consumeMagicLink(reset!.token)).toBeUndefined();
    expect(await auth.resetPassword(magic!.token, "new-secure-password")).toBeUndefined();
    const results = await Promise.all([
      auth.resetPassword(reset!.token, "new-secure-password"),
      auth.resetPassword(reset!.token, "attacker-password"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(auth.getUserFromSession(original!.sessionToken)).toBeUndefined();
    expect(auth.getUserFromSession(other!.sessionToken)?.id).toBe("user-jonas");
    expect(await auth.consumeMagicLink(magic!.token)).toBeUndefined();
    expect(await auth.authenticate("maya", "northstar")).toBeUndefined();
    expect(await auth.authenticate("maya", "new-secure-password")).toBeDefined();
    const state = await database.loadAuthState();
    expect(state?.passwordResets).toEqual([]);
    expect(state?.accounts.find((account) => account.id === "user-maya")?.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
    const restored = await AuthStore.create({ database });
    expect(restored.getUserFromSession(original!.sessionToken)).toBeUndefined();
    expect(await restored.resetPassword(reset!.token, "replayed-password")).toBeUndefined();
  }, 15_000);

  it("rotates and expires reset tokens without changing the password or sessions", async () => {
    const { auth } = await fixture();
    const session = await auth.authenticate("maya", "northstar");
    const first = await auth.createPasswordReset("maya@northstar.studio");
    const second = await auth.createPasswordReset("maya@northstar.studio");
    expect(await auth.resetPassword(first!.token, "new-password")).toBeUndefined();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(second!.expiresAt));
    expect(await auth.resetPassword(second!.token, "new-password")).toBeUndefined();
    expect(auth.getUserFromSession(session!.sessionToken)).toBeDefined();
    expect(await auth.authenticate("maya", "northstar")).toBeDefined();
  });

  it("keeps the old password and the unused token when a reset cannot be persisted", async () => {
    const { auth, database } = await fixture();
    const session = await auth.authenticate("maya", "northstar");
    const reset = await auth.createPasswordReset("maya@northstar.studio");
    vi.spyOn(database, "saveAuthState").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(auth.resetPassword(reset!.token, "new-password")).rejects.toThrow("database unavailable");
    expect(auth.getUserFromSession(session!.sessionToken)).toBeDefined();
    expect(await auth.authenticate("maya", "new-password")).toBeUndefined();
    expect(await auth.authenticate("maya", "northstar")).toBeDefined();
    expect(await auth.resetPassword(reset!.token, "new-password")).toBeDefined();
  }, 15_000);

  it("does not issue an old-password session behind a password reset", async () => {
    const { auth } = await fixture();
    const reset = await auth.createPasswordReset("maya@northstar.studio");
    const results = await Promise.all([
      auth.resetPassword(reset!.token, "new-password"),
      auth.authenticate("maya", "northstar"),
    ]);
    expect(results[0]).toBeDefined();
    expect(results[1]).toBeUndefined();
  });

  it("keeps failed registrations out of memory and persistence", async () => {
    const { auth, database } = await fixture();
    const before = await database.loadAuthState();
    vi.spyOn(database, "saveAuthState").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(auth.register("new-user", "new@example.com", "new-password")).rejects.toThrow();
    expect(await database.loadAuthState()).toEqual(before);
    expect(await auth.authenticate("new-user", "new-password")).toBeUndefined();
    expect(await auth.register("new-user", "new@example.com", "new-password")).toBeDefined();
  });

  it("keeps pending registrations separate from accounts and verifies the latest link only", async () => {
    const { auth, database } = await fixture();
    const first = await auth.createRegistrationLink("new-user", "new@example.com", "new-password");
    const second = await auth.createRegistrationLink("new-user", "new@example.com", "new-password");
    expect(await auth.authenticate("new-user", "new-password")).toBeUndefined();
    expect(await auth.createMagicLink("new@example.com")).toBeUndefined();
    expect(await auth.createPasswordReset("new@example.com")).toBeUndefined();
    expect(await auth.consumeRegistrationLink(first.token, () => undefined)).toBeUndefined();
    expect((await database.loadAuthState())?.registrationLinks[0]?.passwordHash).not.toBe("new-password");
    const restored = await AuthStore.create({ database });
    const allowed = vi.fn();
    const verified = await restored.consumeRegistrationLink(second.token, allowed);
    expect(allowed).toHaveBeenCalledWith("new@example.com");
    expect(verified?.user.email).toBe("new@example.com");
    expect(await restored.consumeRegistrationLink(second.token, allowed)).toBeUndefined();
    expect((await database.loadAuthState())?.registrationLinks).toEqual([]);
  }, 15_000);
});
