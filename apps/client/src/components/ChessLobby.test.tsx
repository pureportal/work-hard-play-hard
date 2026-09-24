import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChessLobbyState, ChessMatchSettings, ChessMatchSummary, Member } from "@workhard/shared";
import { ChessLobby } from "./ChessLobby";

afterEach(cleanup);

describe("ChessLobby", () => {
  it("keeps solo games untimed when switching from multiplayer setup", () => {
    const onCreate = vi.fn();
    render(<ChessLobby lobby={lobby([])} members={members} currentUserId="user-maya" onCreate={onCreate} onJoin={vi.fn()} onOpen={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    fireEvent.click(screen.getByRole("button", { name: "New game" }));
    fireEvent.click(screen.getByRole("radio", { name: /24 hours/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pause weekends (UTC)" }));
    fireEvent.click(screen.getByRole("button", { name: "Bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Hard" }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onCreate).toHaveBeenCalledWith({ timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "hard" } });
  });

  it("resumes the active bot game instead of creating a duplicate", () => {
    const onCreate = vi.fn();
    const onOpen = vi.fn();
    const saved = match("saved-bot", "user-maya", "game-bot", { timeControl: "standard", pauseWeekends: false, access: "locked", bot: { difficulty: "easy" } }, "active");
    render(<ChessLobby lobby={lobby([saved])} members={members} currentUserId="user-maya" onCreate={onCreate} onJoin={vi.fn()} onOpen={onOpen} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onOpen).toHaveBeenCalledWith("saved-bot");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates a locked daily game with weekend pauses", () => {
    const onCreate = vi.fn();
    render(
      <ChessLobby
        lobby={lobby([])}
        members={members}
        currentUserId="user-maya"
        onCreate={onCreate}
        onJoin={vi.fn()}
        onOpen={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    fireEvent.click(screen.getByRole("button", { name: "New game" }));
    fireEvent.click(screen.getByRole("radio", { name: /24 hours/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pause weekends (UTC)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Locked" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Opponent" }), { target: { value: "user-priya" } });
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));

    expect(onCreate).toHaveBeenCalledWith({
      timeControl: "daily",
      pauseWeekends: true,
      access: "locked",
      opponentUserId: "user-priya",
    });
  });

  it("separates owned games, invitations, and open seats", () => {
    const onJoin = vi.fn();
    const onOpen = vi.fn();
    const onCancel = vi.fn();
    render(
      <ChessLobby
        lobby={lobby([
          match("owned-waiting", "user-maya", undefined, { timeControl: "standard", pauseWeekends: false, access: "open" }),
          match("owned-active", "user-maya", "user-leo", { timeControl: "rapid", pauseWeekends: false, access: "open" }, "active"),
          match("invitation", "user-leo", undefined, {
            timeControl: "daily",
            pauseWeekends: true,
            access: "locked",
            opponentUserId: "user-maya",
          }, "waiting", "user-maya"),
          match("open-seat", "user-priya", undefined, { timeControl: "standard", pauseWeekends: false, access: "open" }),
        ])}
        members={members}
        currentUserId="user-maya"
        onCreate={vi.fn()}
        onJoin={onJoin}
        onOpen={onOpen}
        onCancel={onCancel}
      />,
    );

    const owned = screen.getByRole("heading", { name: "Your games" }).closest("section")!;
    const invitations = screen.getByRole("heading", { name: "Invitations" }).closest("section")!;
    const openGames = screen.getByRole("heading", { name: "Open games" }).closest("section")!;

    fireEvent.click(within(owned).getByRole("button", { name: "Play game" }));
    fireEvent.click(within(owned).getByRole("button", { name: "Cancel game" }));
    fireEvent.click(within(invitations).getByRole("button", { name: "Join" }));
    fireEvent.click(within(openGames).getByRole("button", { name: "Join" }));

    expect(onOpen).toHaveBeenCalledWith("owned-active");
    expect(onCancel).toHaveBeenCalledWith("owned-waiting");
    expect(onJoin.mock.calls).toEqual([["invitation"], ["open-seat"]]);
    expect(within(invitations).getByText("24 hours · Weekends paused")).toBeTruthy();
  });

  it("lets a player create another game while an invitation is waiting", () => {
    const onCreate = vi.fn();
    const waiting = match("waiting-one", "user-maya", undefined, { timeControl: "standard", pauseWeekends: false, access: "open" });
    const props = { members, currentUserId: "user-maya", onCreate, onJoin: vi.fn(), onOpen: vi.fn(), onCancel: vi.fn() };
    const view = render(<ChessLobby {...props} lobby={lobby([waiting])} />);
    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    fireEvent.click(screen.getByRole("button", { name: "New game" }));
    fireEvent.click(screen.getByRole("button", { name: "Create game" }));
    expect(onCreate).toHaveBeenCalledWith({ timeControl: "standard", pauseWeekends: false, access: "open" });

    const second = match("waiting-two", "user-maya", undefined, { timeControl: "standard", pauseWeekends: false, access: "open" });
    view.rerender(<ChessLobby {...props} lobby={lobby([waiting, second])} />);
    expect(screen.getByRole("button", { name: "New game" })).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Your games" }).closest("section")!).getAllByRole("button", { name: "Cancel game" })).toHaveLength(2);
  });

  it("separates completed games and opens the shared statistics views", () => {
    const completed = {
      ...match("past", "user-maya", "user-leo", { timeControl: "rapid" as const, pauseWeekends: false, access: "open" as const }, "completed"),
      outcome: { result: "checkmate" as const, winnerUserId: "user-maya" },
    };
    const onOpen = vi.fn();
    render(<ChessLobby lobby={{ ...lobby([completed]), statistics: [
      { userId: "user-maya", games: 1, wins: 1, draws: 0 },
      { userId: "user-leo", games: 1, wins: 0, draws: 0 },
    ] }} members={members} currentUserId="user-maya" onCreate={vi.fn()} onJoin={vi.fn()} onOpen={onOpen} onCancel={vi.fn()} />);
    const history = screen.getByRole("heading", { name: "History" }).closest("section")!;
    expect(within(history).getByText("Rapid · You won")).toBeTruthy();
    fireEvent.click(within(history).getByRole("button", { name: "Review game" }));
    expect(onOpen).toHaveBeenCalledWith("past");
    fireEvent.click(screen.getByRole("button", { name: "Statistics" }));
    expect(screen.getByRole("dialog", { name: "Chess" }).textContent).toContain("1");
    fireEvent.click(screen.getByRole("tab", { name: "Rankings" }));
    expect(screen.getByRole("tabpanel", { name: "Rankings" }).textContent).toContain("Leo Martins");
    fireEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(screen.getByRole("tabpanel", { name: "History" }).textContent).toContain("Win");
  });
});

function lobby(matches: ChessMatchSummary[]): ChessLobbyState {
  return {
    definitionId: "game-chess",
    objectId: "object-chess",
    floorId: "floor-studio",
    matches,
    statistics: [],
  };
}

function match(
  id: string,
  whiteUserId: string,
  blackUserId: string | undefined,
  settings: ChessMatchSettings,
  status: ChessMatchSummary["status"] = "waiting",
  reservedBlackUserId?: string,
): ChessMatchSummary {
  return {
    id,
    creatorUserId: whiteUserId,
    whiteUserId,
    ...(blackUserId ? { blackUserId } : {}),
    ...(reservedBlackUserId ? { reservedBlackUserId } : {}),
    settings,
    status,
    ...(status === "active" ? { turn: "white" as const } : {}),
    updatedAt: "2026-09-04T12:00:00.000Z",
  };
}

const members: Member[] = [
  member("user-maya", "Maya Chen", "MC", "#ff7a66"),
  member("user-leo", "Leo Martins", "LM", "#5b8def"),
  member("user-priya", "Priya Shah", "PS", "#8c6cd9"),
];

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
