import { describe, expect, it } from "vitest";
import { APPROVAL_DESK_DAILY_COIN_CAP, APPROVAL_UPGRADES, DAILY_REWARD_AMOUNTS, GAME_REWARD_DAILY_CAP, WELCOME_COIN_REWARD, approvalCaseOutput, approvalUpgradeCost } from "@workhard/shared";
import { EconomyStore } from "../economy/economy-store.js";
import { ApprovalDeskStore } from "./approval-desk.js";

const userId = "player-one";
const members = [{ id: userId, name: "Alex" }] as Parameters<ApprovalDeskStore["view"]>[1];

describe("Approval Desk", () => {
  it("paces full upgrades beyond the first week in the wider coin economy", () => {
    const fullCost = APPROVAL_UPGRADES.reduce((sum, upgrade) => sum + Array.from({ length: 8 }, (_, level) => approvalUpgradeCost(upgrade.id, level)).reduce((subtotal, price) => subtotal + price, 0), 0);
    const maximumWeek = WELCOME_COIN_REWARD + 7 * (GAME_REWARD_DAILY_CAP + DAILY_REWARD_AMOUNTS.at(-1)! + APPROVAL_DESK_DAILY_COIN_CAP);
    expect(fullCost).toBeGreaterThan(maximumWeek);
    expect(fullCost).toBeLessThan(90 * APPROVAL_DESK_DAILY_COIN_CAP);
  });

  it("processes a case only once, pays wallet coins, and preserves progress", () => {
    const economy = new EconomyStore([userId]);
    const desk = new ApprovalDeskStore(economy);
    const started = new Date("2026-09-24T08:00:00.000Z");
    desk.start(userId, "memo", started);
    expect(() => desk.collect(userId, new Date("2026-09-24T09:59:59.000Z"))).toThrow("APPROVAL_CASE_NOT_READY");
    expect(desk.collect(userId, new Date("2026-09-24T10:00:00.000Z"))).toEqual({ forms: 36, coins: 5 });
    expect(() => desk.collect(userId, new Date("2026-09-24T10:00:01.000Z"))).toThrow("APPROVAL_CASE_NOT_READY");
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(255);
    expect(desk.view(userId, members).totalForms).toBe(36);
    const restored = new ApprovalDeskStore(economy);
    restored.restoreState(desk.exportState(), [userId]);
    expect(restored.view(userId, members).players[0]?.forms).toBe(36);
    expect(restored.view(userId, members).players[0]?.lastContribution).toEqual({ forms: 36, at: "2026-09-24T10:00:00.000Z" });
    economy.validateStateForWorkspace(economy.exportState(), [userId], [], []);
  });

  it("shows the most recent stamp as a team contribution", () => {
    const desk = new ApprovalDeskStore(new EconomyStore([userId]));
    const at = new Date("2026-09-24T08:00:00.000Z");
    desk.stamp(userId, at);
    expect(desk.view(userId, members, at).players[0]?.lastContribution).toEqual({ forms: 1, at: at.toISOString() });
  });

  it("spends real wallet coins on upgrades and rejects repeat purchases", () => {
    const economy = new EconomyStore([userId]);
    const desk = new ApprovalDeskStore(economy);
    expect(desk.buy(userId, "clerk", 0)).toBe(approvalUpgradeCost("clerk", 0));
    expect(() => desk.buy(userId, "clerk", 0)).toThrow("APPROVAL_UPGRADE_CHANGED");
    expect(desk.view(userId, members).player.levels.clerk).toBe(1);
    expect(approvalCaseOutput("audit", desk.view(userId, members).player.levels)).toBeGreaterThan(360);
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(215);
    economy.validateStateForWorkspace(economy.exportState(), [userId], [], []);
  });

  it("keeps shared progress when a player leaves", () => {
    const economy = new EconomyStore([userId, "player-two"]);
    const desk = new ApprovalDeskStore(economy);
    desk.stamp(userId, new Date("2026-09-24T08:00:00.000Z"));
    desk.removePlayer(userId);
    const restored = new ApprovalDeskStore(economy);
    restored.restoreState(desk.exportState(), ["player-two"]);
    expect(restored.view("player-two", [{ ...members[0]!, id: "player-two", name: "Sam" }]).totalForms).toBe(1);
  });

  it("caps daily case coins while preserving form output", () => {
    const economy = new EconomyStore([userId]);
    const desk = new ApprovalDeskStore(economy);
    for (let level = 0; level < 3; level += 1) desk.buy(userId, "printer", level);
    const first = new Date("2026-09-24T00:00:00.000Z");
    for (let index = 0; index < 11; index += 1) {
      const start = new Date(first.getTime() + index * 2 * 3_600_000);
      desk.start(userId, "memo", start);
      desk.collect(userId, new Date(start.getTime() + 2 * 3_600_000));
    }
    expect(desk.view(userId, members, new Date("2026-09-24T23:00:00.000Z")).earnedToday).toBe(80);
    expect(APPROVAL_DESK_DAILY_COIN_CAP).toBe(80);
    expect(desk.view(userId, members).totalForms).toBe(11 * 36);
  });
});
