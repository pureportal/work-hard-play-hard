import { describe, expect, it } from "vitest";
import type { ServerEvent } from "@workhard/shared";
import { createTestApplication } from "../testing/application.js";
import { MemoryDatabase } from "../persistence/memory-database.js";

describe("Stampworks routes", () => {
  it("hides the game and its route when the flag is off", async () => {
    const context = await createTestApplication({ fixture: true, approvalDeskEnabled: false });
    try {
      const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
      const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
      const bootstrap = await context.app.inject({ url: "/v1/bootstrap", headers: { cookie } });
      expect(bootstrap.json().features.approvalDesk).toBe(false);
      const events: ServerEvent[] = [];
      context.runtime.connect("user-maya", "floor-studio", (event) => { events.push(event); });
      expect(events).toContainEqual(expect.objectContaining({
        type: "workspace.snapshot",
        data: expect.objectContaining({ features: { approvalDesk: false } }),
      }));
      expect((await context.app.inject({ url: "/v1/approval-desk", headers: { cookie } })).statusCode).toBe(404);
    } finally {
      await context.app.close();
    }
  });

  it("spends wallet coins, starts a case, and restores the game", async () => {
    const database = new MemoryDatabase();
    const context = await createTestApplication({ fixture: true, approvalDeskEnabled: true, database });
    const login = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    try {
      expect((await context.app.inject({ url: "/v1/bootstrap", headers: { cookie } })).json().features.approvalDesk).toBe(true);
      const events: ServerEvent[] = [];
      context.runtime.connect("user-maya", "floor-studio", (event) => { events.push(event); });
      expect(events).toContainEqual(expect.objectContaining({
        type: "workspace.snapshot",
        data: expect.objectContaining({ features: { approvalDesk: true } }),
      }));
      const initial = await context.app.inject({ url: "/v1/approval-desk", headers: { cookie } });
      expect(initial.statusCode).toBe(200);
      expect(initial.json().players).toHaveLength(context.store.getMembers().length);
      const buy = await context.app.inject({ method: "POST", url: "/v1/approval-desk", headers: { cookie }, payload: { action: "buy", upgradeId: "stamp", expectedLevel: 0 } });
      expect(buy.statusCode).toBe(200);
      expect(buy.json().view.balance).toBe(initial.json().balance - 15);
      expect(buy.json().view.economy.recentTransactions[0].kind).toBe("approval_upgrade");
      expect((await context.app.inject({ method: "POST", url: "/v1/approval-desk", headers: { cookie }, payload: { action: "buy", upgradeId: "stamp", expectedLevel: 0 } })).statusCode).toBe(400);
      const start = await context.app.inject({ method: "POST", url: "/v1/approval-desk", headers: { cookie }, payload: { action: "start", caseId: "memo" } });
      expect(start.json().view.player.case.id).toBe("memo");
      expect((await context.app.inject({ method: "POST", url: "/v1/approval-desk", headers: { cookie }, payload: { action: "collect" } })).statusCode).toBe(409);
    } finally {
      await context.app.close();
    }
    const restored = await createTestApplication({ approvalDeskEnabled: true, database });
    try {
      const state = await restored.app.inject({ url: "/v1/approval-desk", headers: { cookie } });
      expect(state.json().player.levels.stamp).toBe(1);
      expect(state.json().player.case.id).toBe("memo");
      expect(state.json().balance).toBe(235);
    } finally {
      await restored.app.close();
    }
  });
});
