import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapData, Meeting, WorldPlayer, WorldSnapshot } from "@workhard/shared";
import type { DisplayHighFive, DisplayReaction } from "./reactions";
import type { DisplayGongRing } from "./gong";
import { Workspace } from "./App";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  snapshot: undefined as WorldSnapshot | undefined,
}));

const canvasRenders = vi.hoisted(() => [] as Array<{
  meetings: Meeting[];
  players: WorldPlayer[];
  reactions: DisplayReaction[];
  highFives: DisplayHighFive[];
  gongRings: DisplayGongRing[];
}>);

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: () => ({
    connection: "online" as const,
    snapshot: realtime.snapshot,
    send: () => true,
  }),
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: (props: {
    meetings: Meeting[];
    players: WorldPlayer[];
    reactions: DisplayReaction[];
    highFives: DisplayHighFive[];
    gongRings: DisplayGongRing[];
  }) => {
    canvasRenders.push(props);
    return null;
  },
}));

const meeting: Meeting = {
  id: "meeting-one",
  title: "Review",
  startsAt: "2026-09-02T09:00:00.000Z",
  durationMinutes: 30,
  status: "live",
  participantIds: [],
  location: { type: "public", floorId: "floor-one", x: 300, y: 300, radius: 80 },
};

const workspace: BootstrapData = {
  currentUserId: "user-one",
  team: { id: "team-one", name: "Team", slug: "team", accent: "#000000" },
  office: { id: "office-one", teamId: "team-one", name: "Office" },
  floors: [{
    id: "floor-one",
    officeId: "office-one",
    name: "Main",
    level: 1,
    width: 800,
    height: 600,
    spawn: { x: 100, y: 100 },
    background: "#ffffff",
  }],
  members: [{
    id: "user-one",
    name: "Maya",
    initials: "MC",
    email: "maya@example.com",
    title: "Lead",
    role: "owner",
    permissions: ["manage_members", "build"],
    color: "#ff7a66",
    availability: "available",
    online: true,
    floorId: "floor-one",
  }],
  layouts: [{
    floorId: "floor-one",
    revision: 1,
    walls: [],
    openings: [],
    tiles: [],
    objects: [],
    rooms: [],
  }],
  miniGames: [],
  scores: [],
  gameStatistics: [],
  economy: createTestEconomy(),
  gameSettings: createTestGameSettings(),
  kidnapping: createTestKidnappingConfiguration(),
  invitations: [],
  meetings: [meeting],
  conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
  messages: [],
};

function snapshot(tick: number, x: number): WorldSnapshot {
  return {
    type: "world.snapshot",
    tick,
    floorId: "floor-one",
    layoutRevision: 1,
    players: [{
      userId: "user-one",
      floorId: "floor-one",
      x,
      y: 100,
      facing: "right",
      availability: "available",
      connected: true,
    }],
  };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  canvasRenders.length = 0;
  realtime.snapshot = snapshot(1, 100);
});

afterEach(cleanup);

describe("Workspace snapshot rendering", () => {
  it("keeps static canvas collections stable when only player positions change", () => {
    const onSignOut = vi.fn();
    const onSessionExpired = vi.fn();
    const { rerender } = render(
      <Workspace initialData={workspace} onSignOut={onSignOut} onSessionExpired={onSessionExpired} />,
    );
    const initial = canvasRenders.at(-1)!;

    realtime.snapshot = snapshot(2, 120);
    rerender(<Workspace initialData={workspace} onSignOut={onSignOut} onSessionExpired={onSessionExpired} />);
    const updated = canvasRenders.at(-1)!;

    expect(updated.players).not.toBe(initial.players);
    expect(updated.meetings).toBe(initial.meetings);
    expect(updated.reactions).toBe(initial.reactions);
    expect(updated.highFives).toBe(initial.highFives);
    expect(updated.gongRings).toBe(initial.gongRings);
  });
});
