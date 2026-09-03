import { TETRIS_DEFINITION_ID } from "@workhard/shared";
import type { BootstrapData, ChatMessage, Conversation } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { mergeWorkspaceSnapshot } from "./workspace-state";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

function message(id: string, conversationId: string, userId: string, sequence: number): ChatMessage {
  return {
    id,
    conversationId,
    userId,
    body: id,
    createdAt: "2026-09-01T00:00:00.000Z",
    sequence,
  };
}

function data(conversations: Conversation[], messages: ChatMessage[]): BootstrapData {
  return {
    currentUserId: "maya",
    team: { id: "team", name: "Team", slug: "team", accent: "#000" },
    office: { id: "office", teamId: "team", name: "Office" },
    floors: [],
    members: [],
    layouts: [],
    miniGames: [],
    scores: [],
    gameStatistics: [],
    economy: createTestEconomy(),
    gameSettings: createTestGameSettings(),
    kidnapping: createTestKidnappingConfiguration(),
    invitations: [],
    meetings: [],
    conversations,
    messages,
  };
}

describe("mergeWorkspaceSnapshot", () => {
  it("applies authoritative data while preserving local unread state and counting missed messages", () => {
    const current = data(
      [{ id: "team-chat", name: "Team", type: "team", unread: 1 }],
      [message("known", "team-chat", "leo", 1)],
    );
    const snapshot = {
      ...data(
        [{ id: "team-chat", name: "Team", type: "team", unread: 9 }],
        [
          message("known", "team-chat", "leo", 1),
          message("missed", "team-chat", "leo", 2),
          message("own", "team-chat", "maya", 3),
        ],
      ),
      members: [{
        id: "leo",
        name: "Leo",
        initials: "LM",
        email: "leo@example.com",
        title: "Engineer",
        role: "member" as const,
        permissions: [],
        color: "#123",
        availability: "busy" as const,
        online: true,
      }],
      scores: [{
        id: "score",
        roundId: "round",
        definitionId: TETRIS_DEFINITION_ID,
        userId: "leo",
        score: 120,
        lines: 2,
        level: 1,
        mode: "solo" as const,
        playerCount: 1,
        placement: 1,
        won: false,
        playedAt: "2026-09-01T00:00:00.000Z",
      }],
    };

    const merged = mergeWorkspaceSnapshot(current, snapshot);

    expect(merged.conversations[0]?.unread).toBe(2);
    expect(merged.messages).toHaveLength(3);
    expect(merged.members[0]).toMatchObject({ id: "leo", availability: "busy" });
    expect(merged.scores[0]).toMatchObject({ id: "score", score: 120 });
  });

  it("keeps the open conversation read and does not count history from a newly visible conversation", () => {
    const current = data(
      [{ id: "open", name: "Open", type: "team", unread: 4 }],
      [message("known", "open", "leo", 1)],
    );
    const snapshot = data(
      [
        { id: "open", name: "Open", type: "team", unread: 8 },
        { id: "new", name: "New", type: "room", roomId: "room", unread: 0 },
      ],
      [
        message("known", "open", "leo", 1),
        message("new-open", "open", "leo", 2),
        message("history", "new", "leo", 1),
      ],
    );

    const merged = mergeWorkspaceSnapshot(current, snapshot, "open");

    expect(merged.conversations.find((conversation) => conversation.id === "open")?.unread).toBe(0);
    expect(merged.conversations.find((conversation) => conversation.id === "new")?.unread).toBe(0);
  });
});
