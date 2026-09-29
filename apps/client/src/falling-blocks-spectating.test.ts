import { describe, expect, it } from "vitest";
import { selectSpectatorUserId } from "./falling-blocks-spectating";

const participants = [
  { userId: "low", status: "playing" as const, score: 10, lines: 0, level: 1 },
  { userId: "high", status: "playing" as const, score: 40, lines: 0, level: 1 },
  { userId: "finished", status: "finished" as const, score: 100, lines: 0, level: 1 },
];

describe("selectSpectatorUserId", () => {
  it("starts with the highest scoring active player and keeps a manual selection", () => {
    expect(selectSpectatorUserId(participants)).toBe("high");
    expect(selectSpectatorUserId(participants, "low")).toBe("low");
  });

  it("switches away when the selected player finishes", () => {
    expect(selectSpectatorUserId(participants.map((player) => player.userId === "low" ? { ...player, status: "finished" as const } : player), "low")).toBe("high");
    expect(selectSpectatorUserId(participants.map((player) => ({ ...player, status: "finished" as const })))).toBeUndefined();
  });
});
