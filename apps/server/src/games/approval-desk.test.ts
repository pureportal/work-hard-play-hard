import { describe, expect, it } from "vitest";
import { APPROVAL_DESK_DAILY_COIN_CAP, APPROVAL_UPGRADES, DAILY_REWARD_AMOUNTS, GAME_REWARD_DAILY_CAP, WELCOME_COIN_REWARD, approvalCaseCoins, approvalCaseDurationMs, approvalCaseOutput, approvalUpgradeCost, newApprovalDeskPlayer } from "@workhard/shared";
import { EconomyStore } from "../economy/economy-store.js";
import { ApprovalDeskStore } from "./approval-desk.js";

const userId = "player-one";
const members = [{ id: userId, name: "Alex" }] as Parameters<ApprovalDeskStore["view"]>[1];

describe("Stampworks", () => {
  it("paces full upgrades beyond the first week in the wider coin economy", () => {
    const fullCost = APPROVAL_UPGRADES.reduce((sum, upgrade) => sum + Array.from({ length: 8 }, (_, level) => approvalUpgradeCost(upgrade.id, level)).reduce((subtotal, price) => subtotal + price, 0), 0);
    const maximumWeek = WELCOME_COIN_REWARD + 7 * (GAME_REWARD_DAILY_CAP + DAILY_REWARD_AMOUNTS.at(-1)! + APPROVAL_DESK_DAILY_COIN_CAP);
    expect(fullCost).toBeGreaterThan(maximumWeek);
    expect(fullCost).toBeLessThan(90 * APPROVAL_DESK_DAILY_COIN_CAP);
  });

  it("offers short coin cases, long form cases, and shared team boosts", () => {
    const levels = newApprovalDeskPlayer(userId).levels;
    expect(approvalCaseCoins("memo", 0) / 0.5).toBeGreaterThan(approvalCaseCoins("audit", 0) / 8);
    expect(approvalCaseOutput("audit", levels) / 8).toBeGreaterThan(approvalCaseOutput("memo", levels) / 0.5);
    expect(approvalCaseOutput("permit", levels, 500)).toBeGreaterThan(approvalCaseOutput("permit", levels, 499));
    expect(approvalCaseDurationMs("memo", 0, 10_000)).toBeLessThan(approvalCaseDurationMs("memo", 0, 9_999));
    expect(approvalCaseCoins("memo", 0, 50_000)).toBeGreaterThan(approvalCaseCoins("memo", 0, 49_999));
    expect(approvalCaseOutput("permit", levels, 250_000)).toBeGreaterThan(approvalCaseOutput("permit", levels, 249_999));
  });

  it("processes a case only once, pays wallet coins, and preserves progress", () => {
    const economy = new EconomyStore([userId]);
    const desk = new ApprovalDeskStore(economy);
    const started = new Date("2026-09-24T08:00:00.000Z");
    desk.start(userId, "memo", started);
    expect(() => desk.collect(userId, new Date("2026-09-24T08:29:59.000Z"))).toThrow("APPROVAL_CASE_NOT_READY");
    expect(desk.collect(userId, new Date("2026-09-24T08:30:00.000Z"))).toEqual({ forms: 18, coins: 3 });
    expect(() => desk.collect(userId, new Date("2026-09-24T08:30:01.000Z"))).toThrow("APPROVAL_CASE_NOT_READY");
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(253);
    expect(desk.view(userId, members).totalForms).toBe(18);
    const restored = new ApprovalDeskStore(economy);
    restored.restoreState(desk.exportState(), [userId]);
    expect(restored.view(userId, members).players[0]?.forms).toBe(18);
    expect(restored.view(userId, members).players[0]?.lastContribution).toEqual({ forms: 18, at: "2026-09-24T08:30:00.000Z" });
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
    for (let index = 0; index < 14; index += 1) {
      const start = new Date(first.getTime() + index * 30 * 60_000);
      desk.start(userId, "memo", start);
      desk.collect(userId, new Date(start.getTime() + 30 * 60_000));
    }
    expect(desk.view(userId, members, new Date("2026-09-24T23:00:00.000Z")).earnedToday).toBe(80);
    expect(APPROVAL_DESK_DAILY_COIN_CAP).toBe(80);
    expect(desk.view(userId, members).totalForms).toBe(14 * 18);
  });

  it("unlocks cases and rewards every stage contributor", () => {
    const secondUserId = "player-two";
    const thirdUserId = "player-three";
    const economy = new EconomyStore([userId, secondUserId, thirdUserId]);
    const desk = new ApprovalDeskStore(economy);
    const first = { ...desk.view(userId, members).player, forms: 90, stageForms: 20 };
    const second = { ...first, userId: secondUserId, forms: 9, stageForms: 9 };
    const third = { ...first, userId: thirdUserId, forms: 0, stageForms: 0 };
    desk.restoreState({ players: [first, second, third], totalForms: 99 }, [userId, secondUserId, thirdUserId]);
    expect(() => desk.start(userId, "permit")).toThrow("APPROVAL_CASE_LOCKED");
    desk.stamp(userId, new Date("2026-09-24T08:00:00.000Z"));
    expect(desk.view(userId, members).totalForms).toBe(100);
    expect(desk.view(userId, members).player.stageForms).toBe(0);
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(255);
    expect(economy.getPlayerEconomy(secondUserId).coinBalance).toBe(255);
    expect(economy.getPlayerEconomy(thirdUserId).coinBalance).toBe(250);
    desk.start(userId, "permit");
    desk.stamp(userId, new Date("2026-09-24T08:00:01.000Z"));
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(255);
    economy.validateStateForWorkspace(economy.exportState(), [userId, secondUserId, thirdUserId], [], []);
  });

  it("starts another project with a completion reward at one million", () => {
    const economy = new EconomyStore([userId]);
    const desk = new ApprovalDeskStore(economy);
    const player = { ...desk.view(userId, members).player, forms: 999_999, stageForms: 7_500 };
    desk.restoreState({ players: [player], totalForms: 999_999 }, [userId]);
    desk.stamp(userId, new Date("2026-09-24T08:00:00.000Z"));
    const view = desk.view(userId, members);
    expect(view.project).toBe(2);
    expect(view.goal).toBe(2_000_000);
    expect(view.stageStart).toBe(1_000_000);
    expect(view.milestone.forms).toBe(100);
    expect(economy.getPlayerEconomy(userId).coinBalance).toBe(280);
  });

  it("lets at most twenty stamps shorten an active case", () => {
    const desk = new ApprovalDeskStore(new EconomyStore([userId]));
    const started = new Date("2026-09-24T08:00:00.000Z");
    desk.start(userId, "memo", started);
    for (let index = 0; index < 21; index += 1) desk.stamp(userId, new Date(started.getTime() + index * 1_000));
    const activeCase = desk.view(userId, members).player.case;
    expect(activeCase?.stampsApplied).toBe(20);
    expect(activeCase?.readyAt).toBe("2026-09-24T08:15:00.000Z");
  });
});
