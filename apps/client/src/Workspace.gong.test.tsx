import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Availability,
  BootstrapData,
  ClientCommand,
  FloorLayout,
  ServerEvent,
  WorldObject,
  WorldSnapshot,
} from "@workhard/shared";
import type { DisplayGongRing } from "./gong";
import type { DisplayReaction } from "./reactions";
import { Workspace } from "./App";
import { createTestEconomy, createTestGameSettings, createTestKidnappingConfiguration } from "./test-fixtures";

const realtime = vi.hoisted(() => ({
  handler: undefined as ((event: ServerEvent) => void) | undefined,
  send: vi.fn<(command: ClientCommand) => boolean>(),
  snapshot: undefined as WorldSnapshot | undefined,
}));

const audio = vi.hoisted(() => ({
  play: vi.fn(),
  prepare: vi.fn(() => Promise.resolve()),
}));

const canvas = vi.hoisted(() => ({
  props: undefined as {
    gongRings: DisplayGongRing[];
    reactions: DisplayReaction[];
    onGongOffscreen: (ring: DisplayGongRing) => void;
  } | undefined,
}));

vi.mock("./hooks/useRealtime", () => ({
  useRealtime: ({ onEvent }: { onEvent: (event: ServerEvent) => void }) => {
    realtime.handler = onEvent;
    return { connection: "online" as const, snapshot: realtime.snapshot, send: realtime.send };
  },
}));

vi.mock("./gong-audio", () => ({
  playGongChime: audio.play,
  prepareGongChime: audio.prepare,
}));

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: (props: {
    layout: FloorLayout;
    gongRings: DisplayGongRing[];
    reactions: DisplayReaction[];
    onObjectSelect: (object: WorldObject, interactionId: string | undefined, anchor: { x: number; y: number }) => void;
    onGongOffscreen: (ring: DisplayGongRing) => void;
  }) => {
    canvas.props = props;
    const gong = props.layout.objects[0]!;
    return (
      <div>
        <button onClick={() => props.onObjectSelect(gong, undefined, { x: 300, y: 200 })}>Select gong</button>
        {props.gongRings[0] && (
          <button onClick={() => props.onGongOffscreen(props.gongRings[0]!)}>Report gong offscreen</button>
        )}
      </div>
    );
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-03T10:00:00.000Z"));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
  realtime.snapshot = snapshot(100, 400);
  realtime.send.mockReset();
  realtime.send.mockReturnValue(true);
  audio.play.mockReset();
  audio.prepare.mockClear();
  canvas.props = undefined;
});

afterEach(() => {
  cleanup();
  realtime.handler = undefined;
  vi.useRealTimers();
});

describe("Workspace celebration gong", () => {
  it("walks to a distant gong and sends a ring request once in range", () => {
    const view = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Select gong" }));

    fireEvent.click(screen.getByRole("button", { name: "Walk to gong" }));
    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "movement.set_destination",
      floorId: "floor-studio",
    }));
    expect(screen.queryByLabelText("Selected place")).toBeNull();

    realtime.snapshot = snapshot(430, 152);
    view.rerender(<Workspace initialData={workspace()} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Select gong" }));
    fireEvent.click(screen.getByRole("button", { name: "Ring gong" }));

    expect(realtime.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "interaction.ring_gong",
      objectId: "gong",
    }));
    expect(audio.prepare).toHaveBeenCalled();
    expect(screen.queryByLabelText("Selected place")).toBeNull();
  });

  it("renders a received celebration, chimes, announces an offscreen ringer, and exposes the cooldown", () => {
    realtime.snapshot = snapshot(430, 152);
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Select gong" }));

    const rungAt = Date.now();
    emit({
      type: "interaction.gong_rang",
      ring: {
        id: "ring-one",
        objectId: "gong",
        userId: "user-leo",
        floorId: "floor-studio",
        rungAt,
        cooldownUntil: rungAt + 30_000,
      },
    });
    emit({
      type: "interaction.reaction",
      id: "reaction-one",
      userId: "user-leo",
      reaction: "celebrate",
      scope: { type: "floor", floorId: "floor-studio" },
    });

    expect(canvas.props?.gongRings).toHaveLength(1);
    expect(canvas.props?.reactions).toEqual([
      expect.objectContaining({ userId: "user-leo", reaction: "celebrate" }),
    ]);
    expect(audio.play).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Ready in 30s" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Report gong offscreen" }));
    expect(screen.getByText("Leo Martins rang the gong.")).toBeDefined();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("button", { name: "Ring gong" })).toBeDefined();
  });

  it("keeps the visual celebration but suppresses chimes and offscreen notices in Do Not Disturb", () => {
    realtime.snapshot = snapshot(430, 152, "dnd");
    renderWorkspace("dnd");

    const rungAt = Date.now();
    emit({
      type: "interaction.gong_rang",
      ring: {
        id: "ring-dnd",
        objectId: "gong",
        userId: "user-leo",
        floorId: "floor-studio",
        rungAt,
        cooldownUntil: rungAt + 30_000,
      },
    });

    expect(canvas.props?.gongRings).toHaveLength(1);
    expect(audio.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Report gong offscreen" }));
    expect(screen.queryByText("Leo Martins rang the gong.")).toBeNull();
  });
});

function renderWorkspace(availability: Availability = "available") {
  return render(
    <Workspace initialData={workspace(availability)} onSignOut={vi.fn()} onSessionExpired={vi.fn()} />,
  );
}

function emit(event: ServerEvent): void {
  act(() => realtime.handler?.(event));
}

function workspace(availability: Availability = "available"): BootstrapData {
  return {
    currentUserId: "user-maya",
    team: { id: "team", name: "Northstar", slug: "northstar", accent: "#6c5ce7" },
    office: { id: "office", teamId: "team", name: "Studio" },
    floors: [{
      id: "floor-studio",
      officeId: "office",
      name: "Studio",
      level: 1,
      width: 1_600,
      height: 960,
      spawn: { x: 100, y: 400 },
      background: "#f5f2ed",
    }],
    members: [{
      id: "user-maya",
      name: "Maya Chen",
      initials: "MC",
      email: "maya@example.com",
      title: "Product Lead",
      role: "owner",
      permissions: ["manage_members", "build"],
      color: "#ff7a66",
      availability,
      online: true,
      floorId: "floor-studio",
    }, {
      id: "user-leo",
      name: "Leo Martins",
      initials: "LM",
      email: "leo@example.com",
      title: "Design Engineer",
      role: "member",
      permissions: [],
      color: "#5b8def",
      availability: "available",
      online: true,
      floorId: "floor-studio",
    }],
    layouts: [{
      floorId: "floor-studio",
      revision: 1,
      walls: [],
      openings: [],
      tiles: [],
      rooms: [],
      objects: [{
        id: "gong",
        floorId: "floor-studio",
        assetId: "equipment-gong",
        x: 448,
        y: 112,
        rotation: 0,
        variantId: "graphite",
      }],
    }],
    miniGames: [],
    scores: [],
    gameStatistics: [],
    economy: createTestEconomy(),
    gameSettings: createTestGameSettings(),
    kidnapping: createTestKidnappingConfiguration(),
    invitations: [],
    meetings: [],
    conversations: [{ id: "team-chat", name: "Team", type: "team", unread: 0 }],
    messages: [],
  };
}

function snapshot(x: number, y: number, availability: Availability = "available"): WorldSnapshot {
  return {
    type: "world.snapshot",
    tick: 1,
    floorId: "floor-studio",
    layoutRevision: 1,
    players: [{
      userId: "user-maya",
      floorId: "floor-studio",
      x,
      y,
      facing: "down",
      availability,
      connected: true,
    }, {
      userId: "user-leo",
      floorId: "floor-studio",
      x: 600,
      y: 200,
      facing: "left",
      availability: "available",
      connected: true,
    }],
  };
}
