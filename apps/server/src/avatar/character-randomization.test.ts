import { characterAppearanceKey, DEFAULT_CHARACTER_APPEARANCE, randomCharacterAppearance } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "../app.js";
import { MemoryDatabase } from "../persistence/memory-database.js";
import { createInitialData } from "../initial-data.js";
import { createTestData } from "../testing/workspace-data.js";
import { WorkspaceStore } from "../store.js";
import { WorldRuntime } from "../world/world-runtime.js";
import { characterAppearanceSchema } from "./character-schema.js";

afterEach(() => vi.restoreAllMocks());

describe("initial character appearance", () => {
  it("randomizes every customization slot and returns independent appearances", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const first = randomCharacterAppearance();
    random.mockReturnValue(0.999999);
    const second = randomCharacterAppearance();
    expect(first).toEqual({ gender: "female", face: "calm", hairstyle: "bob", upperBody: "street", lowerBody: "street", shoes: "street", headwear: "none" });
    expect(second).toEqual({ gender: "male", face: "shy", hairstyle: "longbraid", upperBody: "festival", lowerBody: "festival", shoes: "festival", headwear: "goggles" });
    expect(first).not.toBe(second);
  });

  it("creates characters for the first owner, registrations and invited members", () => {
    const store = new WorkspaceStore(createInitialData());
    const owner = store.addInitialMember({ id: "owner", username: "owner", email: "owner@example.com" });
    store.updateRegistrationSettings({ enabled: true, invitationRequired: false, whitelistedDomains: [], defaultRole: "member" });
    const registered = store.addRegisteredMember({ id: "registered", username: "registered", email: "registered@example.com" });
    const invited = store.addMember({ id: "invited", username: "invited", email: "invited@example.com" });
    for (const member of [owner, registered, invited]) expect(characterAppearanceSchema.safeParse(member.character).success).toBe(true);
    const restored = new WorkspaceStore(createInitialData());
    restored.restoreMutableState(store.exportMutableState());
    expect(restored.getMembers()).toEqual(store.getMembers());
  });

  it("assigns varied characters to seeded testing players and includes them in the world", () => {
    let seed = 17;
    vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    try {
      const members = store.getMembers();
      expect(new Set(members.map((member) => characterAppearanceKey(member.character))).size).toBe(members.length);
      for (const player of runtime.serializePlayers()) {
        expect(characterAppearanceSchema.safeParse(store.getMember(player.userId)?.character).success).toBe(true);
      }
      expect(runtime.serializePlayers().length).toBeGreaterThan(1);
    } finally {
      runtime.stop();
    }
  });

  it("persists registration appearance before returning and keeps later customization after restart", async () => {
    const database = new MemoryDatabase();
    const first = await createApplication({ database });
    const registration = await first.app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "new-player", email: "new@example.com", password: "correct-horse" } });
    try {
      expect(registration.statusCode).toBe(201);
      const userId = registration.json().user.id as string;
      const character = first.store.getMember(userId)!.character;
      expect(characterAppearanceSchema.safeParse(character).success).toBe(true);
      expect((await database.loadWorkspaceState())?.store.members.find((member) => member.id === userId)?.character).toEqual(character);
      const cookie = registration.cookies.map((item) => `${item.name}=${item.value}`).join("; ");
      for (let reload = 0; reload < 3; reload++) {
        const bootstrap = await first.app.inject({ method: "GET", url: "/v1/bootstrap", headers: { cookie } });
        expect(bootstrap.json().members.find((member: { id: string }) => member.id === userId).character).toEqual(character);
      }
      const customized = { ...DEFAULT_CHARACTER_APPEARANCE, gender: "male", hairstyle: "swept", headwear: "cap" };
      expect((await first.app.inject({ method: "PUT", url: "/v1/members/me/character", headers: { cookie }, payload: customized })).statusCode).toBe(200);
      await first.app.close();
      const restored = await createApplication({ database });
      try {
        expect(restored.store.getMember(userId)?.character).toEqual(customized);
      } finally {
        await restored.app.close();
      }
    } finally {
      await first.app.close();
    }
  });
});
