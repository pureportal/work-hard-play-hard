import {
  APPROVAL_CASES, APPROVAL_DESK_DAILY_COIN_CAP, APPROVAL_DESK_GOAL, APPROVAL_UPGRADES,
  approvalCaseCoins, approvalCaseDurationMs, approvalCaseOutput, approvalDeskLevel, approvalStage,
  approvalUpgradeCost, getUtcDayKey, newApprovalDeskPlayer,
  type ApprovalCaseId, type ApprovalDeskPlayer, type ApprovalDeskState,
  type ApprovalDeskView, type ApprovalUpgradeId, type Member,
} from "@workhard/shared";
import type { EconomyStore } from "../economy/economy-store.js";

const MAX_UPGRADE_LEVEL = 8;
const STAMP_INTERVAL_MS = 750;

export class ApprovalDeskStore {
  private state: ApprovalDeskState = { players: [], totalForms: 0 };

  constructor(private readonly economy: EconomyStore) {}

  view(userId: string, members: Member[], now = new Date()): ApprovalDeskView {
    const player = this.state.players.find((entry) => entry.userId === userId) ?? newApprovalDeskPlayer(userId);
    const today = getUtcDayKey(now);
    const economy = this.economy.getPlayerEconomy(userId, now);
    const stage = approvalStage(this.state.totalForms);
    return {
      goal: (stage.project + 1) * APPROVAL_DESK_GOAL,
      totalForms: this.state.totalForms,
      project: stage.project + 1,
      stageStart: stage.stageStart,
      milestone: stage.milestone,
      contributionTarget: stage.target,
      players: members.map((member) => {
        const entry = this.state.players.find((candidate) => candidate.userId === member.id) ?? newApprovalDeskPlayer(member.id);
        return { userId: member.id, name: member.name, forms: entry.forms, stamps: entry.stamps, level: approvalDeskLevel(entry), ...(entry.lastContribution ? { lastContribution: entry.lastContribution } : {}) };
      }).sort((left, right) => right.forms - left.forms || left.name.localeCompare(right.name)),
      player: structuredClone(player),
      balance: economy.coinBalance,
      economy,
      earnedToday: player.earnedDay === today ? player.earnedToday : 0,
      dailyCoinCap: APPROVAL_DESK_DAILY_COIN_CAP,
      now: now.toISOString(),
    };
  }

  start(userId: string, caseId: ApprovalCaseId, now = new Date()): void {
    const selected = APPROVAL_CASES.find((item) => item.id === caseId);
    if (!selected) throw new Error("APPROVAL_CASE_INVALID");
    if (this.state.totalForms < selected.unlock) throw new Error("APPROVAL_CASE_LOCKED");
    const player = this.player(userId);
    if (player.case) throw new Error("APPROVAL_CASE_ACTIVE");
    player.case = {
      id: caseId,
      startedAt: now.toISOString(),
      readyAt: new Date(now.getTime() + approvalCaseDurationMs(caseId, player.levels.routing, this.state.totalForms)).toISOString(),
      stampsApplied: 0,
    };
  }

  collect(userId: string, now = new Date()): { forms: number; coins: number } {
    const player = this.player(userId);
    const activeCase = player.case;
    if (!activeCase || Date.parse(activeCase.readyAt) > now.getTime()) throw new Error("APPROVAL_CASE_NOT_READY");
    const forms = approvalCaseOutput(activeCase.id, player.levels, this.state.totalForms);
    const today = getUtcDayKey(now);
    const earnedToday = player.earnedDay === today ? player.earnedToday : 0;
    const coins = Math.min(approvalCaseCoins(activeCase.id, player.levels.printer, this.state.totalForms), APPROVAL_DESK_DAILY_COIN_CAP - earnedToday);
    this.economy.rewardStampworks(userId, `${userId}:${activeCase.startedAt}`, coins, now);
    this.addForms(player, forms, now);
    player.earnedDay = today;
    player.earnedToday = earnedToday + coins;
    delete player.case;
    return { forms, coins };
  }

  stamp(userId: string, now = new Date()): number {
    const player = this.player(userId);
    if (player.lastStampAt && now.getTime() - Date.parse(player.lastStampAt) < STAMP_INTERVAL_MS) {
      throw new Error("APPROVAL_STAMP_WAIT");
    }
    const forms = 1 + player.levels.stamp;
    if (player.case && Date.parse(player.case.readyAt) > now.getTime() && (player.case.stampsApplied ?? 0) < 20) {
      const duration = approvalCaseDurationMs(player.case.id, player.levels.routing, this.state.totalForms);
      const reduction = Math.round(duration / 40);
      player.case.readyAt = new Date(Math.max(now.getTime(), Date.parse(player.case.readyAt) - reduction)).toISOString();
      player.case.stampsApplied = (player.case.stampsApplied ?? 0) + 1;
    }
    player.stamps += 1;
    player.lastStampAt = now.toISOString();
    this.addForms(player, forms, now);
    return forms;
  }

  buy(userId: string, upgradeId: ApprovalUpgradeId, expectedLevel: number, now = new Date()): number {
    if (!APPROVAL_UPGRADES.some((item) => item.id === upgradeId)) throw new Error("APPROVAL_UPGRADE_INVALID");
    const player = this.player(userId);
    const level = player.levels[upgradeId];
    if (level !== expectedLevel) throw new Error("APPROVAL_UPGRADE_CHANGED");
    if (level >= MAX_UPGRADE_LEVEL) throw new Error("APPROVAL_UPGRADE_MAXED");
    const cost = approvalUpgradeCost(upgradeId, level);
    this.economy.buyApprovalUpgrade(userId, upgradeId, level, cost, now);
    player.levels[upgradeId] = level + 1;
    return cost;
  }

  exportState(): ApprovalDeskState {
    return structuredClone(this.state);
  }

  restoreState(state: ApprovalDeskState, memberIds: string[]): void {
    const allowed = new Set(memberIds);
    if (!Array.isArray(state.players) || !Number.isSafeInteger(state.totalForms) || state.totalForms < 0
      || new Set(state.players.map((player) => player.userId)).size !== state.players.length
      || state.players.some((player) => !allowed.has(player.userId) || !validPlayer(player))
      || state.players.reduce((sum, player) => sum + player.forms, 0) > state.totalForms
      || state.players.reduce((sum, player) => sum + (player.stageForms ?? 0), 0) > state.totalForms - approvalStage(state.totalForms).stageStart) {
      throw new Error("APPROVAL_STATE_INVALID");
    }
    this.state = structuredClone(state);
  }

  removePlayer(userId: string): void {
    this.state.players = this.state.players.filter((player) => player.userId !== userId);
  }

  private player(userId: string): ApprovalDeskPlayer {
    let player = this.state.players.find((entry) => entry.userId === userId);
    if (!player) {
      player = newApprovalDeskPlayer(userId);
      this.state.players.push(player);
    }
    return player;
  }

  private addForms(player: ApprovalDeskPlayer, forms: number, now: Date): void {
    player.forms += forms;
    player.lastContribution = { forms, at: now.toISOString() };
    let remaining = forms;
    while (remaining > 0) {
      const stage = approvalStage(this.state.totalForms);
      const stageEnd = stage.project * APPROVAL_DESK_GOAL + stage.milestone.forms;
      const contribution = Math.min(remaining, stageEnd - this.state.totalForms);
      player.stageForms = (player.stageForms ?? 0) + contribution;
      this.state.totalForms += contribution;
      remaining -= contribution;
      if (this.state.totalForms !== stageEnd) continue;
      for (const contributor of this.state.players) {
        if ((contributor.stageForms ?? 0) >= stage.target) {
          this.economy.rewardStampworks(contributor.userId, `stampworks:project-${stage.project + 1}:milestone-${stage.milestone.forms}`, stage.milestone.coins, now);
        }
        contributor.stageForms = 0;
      }
    }
  }
}

function validPlayer(player: ApprovalDeskPlayer): boolean {
  return Boolean(player && typeof player.userId === "string"
    && Number.isSafeInteger(player.forms) && player.forms >= 0
    && Number.isSafeInteger(player.stamps) && player.stamps >= 0
    && (player.stageForms === undefined || Number.isSafeInteger(player.stageForms) && player.stageForms >= 0 && player.stageForms <= player.forms)
    && Number.isSafeInteger(player.earnedToday) && player.earnedToday >= 0 && player.earnedToday <= APPROVAL_DESK_DAILY_COIN_CAP
    && APPROVAL_UPGRADES.every(({ id }) => Number.isSafeInteger(player.levels?.[id]) && player.levels[id] >= 0 && player.levels[id] <= MAX_UPGRADE_LEVEL)
    && (!player.case || APPROVAL_CASES.some(({ id }) => id === player.case?.id)
      && Number.isFinite(Date.parse(player.case.startedAt)) && Number.isFinite(Date.parse(player.case.readyAt))
      && (player.case.stampsApplied === undefined || Number.isSafeInteger(player.case.stampsApplied) && player.case.stampsApplied >= 0 && player.case.stampsApplied <= 20))
    && (!player.lastStampAt || Number.isFinite(Date.parse(player.lastStampAt)))
    && (!player.lastContribution || Number.isSafeInteger(player.lastContribution.forms) && player.lastContribution.forms > 0
      && player.lastContribution.forms <= player.forms
      && Number.isFinite(Date.parse(player.lastContribution.at)))
    && (!player.earnedDay || /^\d{4}-\d{2}-\d{2}$/.test(player.earnedDay)));
}
