import { DEFAULT_CHARACTER_APPEARANCE, type Member } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

const applications: Awaited<ReturnType<typeof createTestApplication>>[] = [];
afterEach(async () => { await Promise.all(applications.splice(0).map(({ app }) => app.close())); });

async function application(database = new MemoryDatabase()) {
  const context = await createTestApplication({ database, fixture: true });
  applications.push(context);
  const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
  return { context, database, cookie: login.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") };
}

describe("character appearance API", () => {
  it("requires sign-in and rejects unknown parts, missing selections and extra fields", async () => {
    const { context, cookie } = await application();
    const initial = context.store.getMember("user-maya")!.character;
    expect((await context.app.inject({ method: "PUT", url: "/v1/members/me/character", payload: DEFAULT_CHARACTER_APPEARANCE })).statusCode).toBe(401);
    for (const payload of [{ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "../../evil" }, { gender: "female" }, { ...DEFAULT_CHARACTER_APPEARANCE, userId: "user-leo" }, { ...DEFAULT_CHARACTER_APPEARANCE, breastSize: "flat" }]) {
      const response = await context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("CHARACTER_INVALID");
    }
    expect(context.store.getMember("user-maya")?.character).toEqual(initial);
  });

  it("persists the complete appearance, publishes it and restores it after restart", async () => {
    const first = await application();
    const publish = vi.spyOn(first.context.runtime, "publishMember");
    const character = { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male" as const, face: "fierce" as const, hairstyle: "hime" as const, lowerBody: "ranger" as const, shoes: "arcane" as const, headwear: "witch" as const };
    const response = await first.context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie: first.cookie }, payload: character });
    expect(response.statusCode).toBe(200);
    expect(response.json().character).toEqual(character);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ id: "user-maya", character }));
    expect((await first.database.loadWorkspaceState())?.store.members.find((member) => member.id === "user-maya")?.character).toEqual(character);
    await first.context.app.close();
    applications.splice(applications.indexOf(first.context), 1);
    const restored = await application(first.database);
    const bootstrap = await restored.context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie: restored.cookie } });
    expect(bootstrap.json().members.find((member: Member) => member.id === "user-maya").character).toEqual(character);
  });

  it("does not expose photo upload, removal or image-serving routes", async () => {
    const { context, cookie, database } = await application();
    await context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload: DEFAULT_CHARACTER_APPEARANCE });
    for (const method of ["PUT", "DELETE"] as const) {
      expect((await context.app.inject({ method, url: "/v1/members/me/avatar", headers: { cookie } })).statusCode).toBe(404);
    }
    expect((await context.app.inject({ method: "GET", url: "/v1/members/user-maya/avatar.webp?v=old", headers: { cookie } })).statusCode).toBe(404);
    expect((await database.loadWorkspaceState())?.store.members.find((member) => member.id === "user-maya")?.character).toEqual(DEFAULT_CHARACTER_APPEARANCE);
  }, 30_000);
});
