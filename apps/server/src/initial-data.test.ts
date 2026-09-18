import { describe, expect, it } from "vitest";
import { createApplication } from "./app.js";
import { MemoryDatabase } from "./persistence/memory-database.js";
import { WorkspaceStore } from "./store.js";
import { createTestData } from "./testing/workspace-data.js";

describe("workspace initialization", () => {
  it("starts with an open starter house and no fabricated activity", () => {
    const store = new WorkspaceStore();
    const state = store.exportMutableState();
    expect(store.needsSetup()).toBe(true);
    expect(state.floors).toHaveLength(1);
    expect(state.layouts[0]!.rooms.map((room) => room.name).sort()).toEqual(["Kitchen", "Lounge", "Meeting room", "Studio"]);
    for (const room of state.layouts[0]!.rooms) {
      expect(room.access).toEqual({ mode: "open", assignedPersonIds: [], knockable: false });
    }
    for (const records of [state.members, state.messages, state.invitations, state.scores, state.gameStatistics,
      state.organisation.units, state.organisation.assignments, state.economy.accounts, state.economy.transactions]) expect(records).toEqual([]);
    expect(state.meetings).toEqual([expect.objectContaining({ title: "Meeting room", status: "idle", participantIds: [], location: { type: "room", roomId: "room-meeting" } })]);
    expect(state.conversations).toEqual([
      { id: "conversation-team", name: "Team", type: "team", unread: 0 },
      expect.objectContaining({ name: "Meeting room", type: "meeting", meetingId: state.meetings[0]!.id, unread: 0 }),
    ]);
  });

  it("restores saved floors without rebuilding a preset office", () => {
    const original = new WorkspaceStore();
    const state = original.exportMutableState();
    state.floors = [{ id: "custom-floor", officeId: "office", name: "Engineering", level: 3,
      width: 1024, height: 768, spawn: { x: 512, y: 384 }, background: "#eeeeee" }];
    state.layouts = [{ floorId: "custom-floor", revision: 2, walls: [], openings: [], tiles: [], objects: [], rooms: [] }];
    original.restoreMutableState(state);
    expect(original.getFloors()).toEqual(state.floors);
    expect(original.getFloor("floor-main")).toBeUndefined();
    expect(original.exportMutableState()).toEqual(state);
  });

  it("does not create login credentials for persisted members when authentication data is missing", async () => {
    const database = new MemoryDatabase();
    const store = new WorkspaceStore(createTestData());
    await database.saveWorkspaceState({ players: [], store: store.exportMutableState() });
    const context = await createApplication({ database });
    try {
      const response = await context.app.inject({ method: "POST", url: "/v1/auth/login", payload: { identifier: "maya", password: "northstar" } });
      expect(response.statusCode).toBe(401);
      expect(await database.loadAuthState()).toMatchObject({ accounts: [], sessions: [] });
    } finally {
      await context.app.close();
    }
  });
});
