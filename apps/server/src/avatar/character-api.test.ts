import { CHARACTER_FACES, CHARACTER_HAIRSTYLES, CHARACTER_HEADWEAR, CHARACTER_OUTFITS, DEFAULT_CHARACTER_APPEARANCE, type Member } from "@workhard/shared";
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
    for (const payload of [{ ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "../../evil" }, { face: "calm" }, { ...DEFAULT_CHARACTER_APPEARANCE, userId: "user-leo" }, { ...DEFAULT_CHARACTER_APPEARANCE, breastSize: "flat" }, { ...DEFAULT_CHARACTER_APPEARANCE, gender: "female" }]) {
      const response = await context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("CHARACTER_INVALID");
    }
    expect(context.store.getMember("user-maya")?.character).toEqual(initial);
  });

  it("persists the complete appearance, publishes it and restores it after restart", async () => {
    const first = await application();
    const publish = vi.spyOn(first.context.runtime, "publishMember");
    const character = { ...DEFAULT_CHARACTER_APPEARANCE, face: "fierce" as const, hairstyle: "hime" as const, lowerBody: "ranger" as const, shoes: "arcane" as const, headwear: "witch" as const };
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

  it("saves and reloads every statement piece in mixed outfits", async () => {
    const { context, cookie, database } = await application();
    const outfits = ["cyber", "pirate", "astronaut", "dragon", "jester", "frog", "biker", "velvet", "starlight", "sunset"] as const;
    for (const [index, upperBody] of outfits.entries()) {
      const character = { ...DEFAULT_CHARACTER_APPEARANCE, upperBody, lowerBody: outfits[(index + 3) % outfits.length]!, shoes: outfits[(index + 7) % outfits.length]! };
      const response = await context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload: character });
      expect(response.statusCode).toBe(200);
      expect(response.json().character).toEqual(character);
      expect((await database.loadWorkspaceState())?.store.members.find(member => member.id === "user-maya")?.character).toEqual(character);
      const bootstrap = await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie } });
      expect(bootstrap.json().members.find((member: Member) => member.id === "user-maya").character).toEqual(character);
    }
  });

  it("persists every new face, hairstyle, headwear and runway piece in mixed appearances", async () => {
    const { context, cookie, database } = await application();
    const faces = CHARACTER_FACES.slice(6);
    const hairstyles = CHARACTER_HAIRSTYLES.slice(14);
    const headwear = CHARACTER_HEADWEAR.slice(8);
    const outfits = CHARACTER_OUTFITS.slice(18);
    for (const [index, face] of faces.entries()) {
      const character = {
        face, hairstyle: hairstyles[index]!, headwear: headwear[index]!,
        upperBody: outfits[index % outfits.length]!, lowerBody: outfits[(index + 2) % outfits.length]!, shoes: outfits[(index + 4) % outfits.length]!,
      };
      const response = await context.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload: character });
      expect(response.statusCode).toBe(200);
      expect(response.json().character).toEqual(character);
      expect((await database.loadWorkspaceState())?.store.members.find(member => member.id === "user-maya")?.character).toEqual(character);
      const bootstrap = await context.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie } });
      expect(bootstrap.json().members.find((member: Member) => member.id === "user-maya").character).toEqual(character);
    }
  });
});
