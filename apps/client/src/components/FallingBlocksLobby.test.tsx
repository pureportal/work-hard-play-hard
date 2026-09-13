import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLING_BLOCKS_DEFINITION_ID } from "@workhard/shared";
import type { GameScore, Member, PlayerGameStatistics } from "@workhard/shared";
import { FallingBlocksLobby } from "./FallingBlocksLobby";

afterEach(cleanup);

const members: Member[] = [
  member("maya", "Maya Chen", "MC", "#ff7a66"),
  member("leo", "Leo Martins", "LM", "#5b8def"),
];

const statistics: PlayerGameStatistics[] = [
  {
    definitionId: FALLING_BLOCKS_DEFINITION_ID,
    userId: "maya",
    gamesPlayed: 4,
    multiplayerGamesPlayed: 3,
    multiplayerWins: 2,
    highestScore: 1_240,
    highestLines: 8,
    totalScore: 3_100,
    totalLines: 19,
  },
  {
    definitionId: FALLING_BLOCKS_DEFINITION_ID,
    userId: "leo",
    gamesPlayed: 2,
    multiplayerGamesPlayed: 2,
    multiplayerWins: 0,
    highestScore: 980,
    highestLines: 6,
    totalScore: 1_600,
    totalLines: 10,
  },
];

const scores: GameScore[] = [
  score("maya-score", "maya", 1_240),
  score("leo-score", "leo", 980),
];

describe("FallingBlocksLobby", () => {
  it("shows gathered players, persistent statistics, and starts the shared round", () => {
    const onStart = vi.fn();
    render(
      <FallingBlocksLobby
        lobby={{
          definitionId: FALLING_BLOCKS_DEFINITION_ID,
          objectId: "object-falling-blocks",
          floorId: "floor-studio",
          participantIds: ["maya", "leo"],
          capacity: 8,
        }}
        members={members}
        scores={scores}
        statistics={statistics}
        currentUserId="maya"
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    const lobby = screen.getByRole("complementary", { name: "Falling Blocks lobby" });
    expect(within(lobby).getByText("You")).toBeTruthy();
    expect(within(lobby).getAllByText("Leo Martins")).toHaveLength(2);
    expect(within(lobby).getByLabelText("Your Falling Blocks statistics").textContent).toContain("1,240");
    expect(within(lobby).getByLabelText("Your Falling Blocks statistics").textContent).toContain("19");

    fireEvent.click(within(lobby).getByRole("button", { name: "Play" }));
    expect(onStart).toHaveBeenCalledWith(false);
  });

  it("labels a one-player lobby as solo", () => {
    render(
      <FallingBlocksLobby
        lobby={{
          definitionId: FALLING_BLOCKS_DEFINITION_ID,
          objectId: "object-falling-blocks",
          floorId: "floor-studio",
          participantIds: ["maya"],
          capacity: 8,
        }}
        members={members}
        scores={scores}
        statistics={statistics}
        currentUserId="maya"
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });
});

function member(id: string, name: string, initials: string, color: string): Member {
  return {
    id,
    name,
    initials,
    character: { ...DEFAULT_CHARACTER_APPEARANCE },
    color,
    email: `${id}@example.com`,
    title: "",
    role: "member",
    permissions: [],
    availability: "available",
    online: true,
  };
}

function score(id: string, userId: string, value: number): GameScore {
  return {
    id,
    roundId: `${id}-round`,
    definitionId: FALLING_BLOCKS_DEFINITION_ID,
    userId,
    score: value,
    lines: 4,
    level: 1,
    mode: "solo",
    playerCount: 1,
    placement: 1,
    won: false,
    playedAt: "2026-09-02T12:00:00.000Z",
  };
}
