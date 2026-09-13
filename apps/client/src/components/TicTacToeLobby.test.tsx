import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameLobbyState, Member, PlayerGameStatistics } from "@workhard/shared";
import { TIC_TAC_TOE_VARIANTS } from "@workhard/shared";
import { TicTacToeLobby } from "./TicTacToeLobby";

afterEach(cleanup);

describe("TicTacToeLobby", () => {
  it.each(["Easy", "Medium", "Hard"])("starts a solo game on %s without another player", (difficulty) => {
    const onStart = vi.fn();
    render(<TicTacToeLobby lobby={lobby(["user-maya"])} members={members} statistics={statistics} currentUserId="user-maya" onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: difficulty }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onStart).toHaveBeenCalledWith("classic", { difficulty: difficulty.toLowerCase() });
  });
  it.each(TIC_TAC_TOE_VARIANTS)("starts $name", ({ id, name }) => {
    const onStart = vi.fn();
    render(<TicTacToeLobby lobby={lobby(["user-maya", "user-leo"])} members={members} statistics={statistics} currentUserId="user-maya" onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(onStart).toHaveBeenCalledWith(id, { difficulty: "medium" });
  });

  it("waits for two players and starts the selected variant", () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <TicTacToeLobby
        lobby={lobby(["user-maya"])}
        members={members}
        statistics={statistics}
        currentUserId="user-maya"
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    expect(screen.getByRole("button", { name: "Waiting for player" })).toHaveProperty("disabled", true);

    rerender(
      <TicTacToeLobby
        lobby={lobby(["user-maya", "user-leo"])}
        members={members}
        statistics={statistics}
        currentUserId="user-maya"
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ultimate" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(onStart).toHaveBeenCalledWith("ultimate", undefined);
    expect(screen.getByLabelText("Your Tic-Tac-Toe statistics").textContent).toContain("3");
  });
});

const members: Member[] = [
  member("user-maya", "Maya Chen", "MC", "#ff7a66"),
  member("user-leo", "Leo Martins", "LM", "#5b8def"),
];

const statistics: PlayerGameStatistics[] = [{
  definitionId: "game-tic-tac-toe",
  userId: "user-maya",
  gamesPlayed: 7,
  multiplayerGamesPlayed: 7,
  multiplayerWins: 3,
  highestScore: 1,
  highestLines: 0,
  totalScore: 3,
  totalLines: 0,
}];

function lobby(participantIds: string[]): GameLobbyState {
  return {
    definitionId: "game-tic-tac-toe",
    objectId: "object-tic-tac-toe",
    floorId: "floor-studio",
    participantIds,
    capacity: 2,
  };
}

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
