import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { describe, expect, it, vi } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

function connect(runtime: WorldRuntime, userId: string, events: ServerEvent[]): string {
  return runtime.connect(userId, "floor-studio", (event) => events.push(event));
}

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function latestCall(events: ServerEvent[]) {
  return events.filter((event) => event.type === "call.state").at(-1);
}

function requestedKnock(events: ServerEvent[]) {
  return events.find((event) => event.type === "area.knock_requested");
}

function walkToFocusDoor(runtime: WorldRuntime, peerId: string): void {
  send(runtime, peerId, { type: "movement.set_destination", requestId: "approach-focus", x: 1265, y: 452 });
  for (let tick = 0; tick < 180; tick += 1) {
    runtime.runTickForTest();
  }
}

describe("WorldRuntime calls", () => {
  it("walks to a coworker on the public floor and connects automatically", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "movement.approach_user",
      requestId: "approach-leo",
      targetUserId: "user-leo",
    });
    for (let tick = 0; tick < 300; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestCall(mayaEvents)).toMatchObject({ state: "connected", direction: "outgoing", peerUserId: "user-leo" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "connected", direction: "incoming", peerUserId: "user-maya" });
    runtime.stop();
  });

  it("continues toward a coworker who moves during the approach", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", []);

    send(runtime, mayaPeer, {
      type: "movement.approach_user",
      requestId: "approach-moving-leo",
      targetUserId: "user-leo",
    });
    send(runtime, leoPeer, {
      type: "movement.set_destination",
      requestId: "move-leo",
      x: 650,
      y: 500,
    });
    for (let tick = 0; tick < 400; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestCall(mayaEvents)).toMatchObject({ state: "connected", peerUserId: "user-leo" });
    expect(mayaEvents.some((event) => event.type === "command.error" && event.requestId === "approach-moving-leo")).toBe(false);
    runtime.stop();
  });

  it("rings nearby coworkers and connects only after the recipient accepts", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-request",
      targetUserId: "user-leo",
    });

    const outgoing = latestCall(mayaEvents);
    const incoming = latestCall(leoEvents);
    expect(outgoing).toMatchObject({ state: "ringing", direction: "outgoing", peerUserId: "user-leo" });
    expect(incoming).toMatchObject({ state: "ringing", direction: "incoming", peerUserId: "user-maya" });

    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, {
      type: "call.respond",
      requestId: "call-response",
      callId: incoming.callId,
      accept: true,
    });

    expect(latestCall(mayaEvents)).toMatchObject({ state: "connected", direction: "outgoing" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "connected", direction: "incoming" });

    send(runtime, mayaPeer, {
      type: "call.end",
      requestId: "call-end",
      callId: incoming.callId,
    });
    expect(latestCall(mayaEvents)).toMatchObject({ state: "ended" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "ended" });
    runtime.stop();
  });

  it("lets the recipient decline a ringing call", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-request",
      targetUserId: "user-leo",
    });
    const incoming = latestCall(leoEvents);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, {
      type: "call.respond",
      requestId: "call-response",
      callId: incoming.callId,
      accept: false,
    });

    expect(latestCall(mayaEvents)).toMatchObject({ state: "declined" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "declined" });
    runtime.stop();
  });

  it("ends a connected call when either person changes floors", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-request",
      targetUserId: "user-leo",
    });
    const incoming = latestCall(leoEvents);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, {
      type: "call.respond",
      requestId: "call-response",
      callId: incoming.callId,
      accept: true,
    });
    send(runtime, leoPeer, {
      type: "floor.change",
      requestId: "floor-change",
      floorId: "floor-rooftop",
    });

    expect(latestCall(mayaEvents)).toMatchObject({ state: "ended" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "ended" });
    runtime.stop();
  });

  it("rejects calls to coworkers outside the nearby range", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-jonas", []);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-request",
      targetUserId: "user-jonas",
    });

    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "CALL_OUT_OF_RANGE" });
    runtime.stop();
  });

  it("marks an unanswered call as missed for both people", () => {
    vi.useFakeTimers();
    const runtime = new WorldRuntime(new DemoStore());
    try {
      const mayaEvents: ServerEvent[] = [];
      const leoEvents: ServerEvent[] = [];
      const mayaPeer = connect(runtime, "user-maya", mayaEvents);
      connect(runtime, "user-leo", leoEvents);

      send(runtime, mayaPeer, {
        type: "call.request",
        requestId: "unanswered-call",
        targetUserId: "user-leo",
      });
      vi.advanceTimersByTime(20_000);

      expect(latestCall(mayaEvents)).toMatchObject({ state: "missed", direction: "outgoing" });
      expect(latestCall(leoEvents)).toMatchObject({ state: "missed", direction: "incoming" });
    } finally {
      runtime.stop();
      vi.useRealTimers();
    }
  });

  it("declines a ringing call and cancels walk-up approaches when the recipient enables do not disturb", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "ring-leo",
      targetUserId: "user-leo",
    });
    send(runtime, leoPeer, {
      type: "presence.set_availability",
      requestId: "enable-dnd",
      availability: "dnd",
    });

    expect(latestCall(mayaEvents)).toMatchObject({ state: "declined", direction: "outgoing" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "declined", direction: "incoming" });

    send(runtime, leoPeer, {
      type: "presence.set_availability",
      requestId: "disable-dnd",
      availability: "available",
    });
    send(runtime, mayaPeer, {
      type: "movement.approach_user",
      requestId: "approach-leo",
      targetUserId: "user-leo",
    });
    send(runtime, leoPeer, {
      type: "presence.set_availability",
      requestId: "enable-dnd-again",
      availability: "dnd",
    });

    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "approach-leo",
      code: "PERSON_UNAVAILABLE",
    }));
    runtime.stop();
  });
});

describe("WorldRuntime interactions", () => {
  it("shares quick reactions with the current floor and throttles bursts", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const noahEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", leoEvents);
    connect(runtime, "user-noah", noahEvents);

    send(runtime, mayaPeer, { type: "interaction.react", requestId: "react-heart", reaction: "heart" });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "interaction.reaction",
      userId: "user-maya",
      reaction: "heart",
      scope: { type: "floor", floorId: "floor-studio" },
    });
    expect(leoEvents.at(-1)).toMatchObject({ type: "interaction.reaction", reaction: "heart" });
    expect(noahEvents.some((event) => event.type === "interaction.reaction")).toBe(false);

    send(runtime, mayaPeer, { type: "interaction.react", requestId: "react-burst", reaction: "clap" });
    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", requestId: "react-burst", code: "REACTION_RATE_LIMITED" });
    runtime.stop();
  });

  it("throttles repeated direct waves", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "interaction.wave", requestId: "wave-once", targetUserId: "user-leo" });
    send(runtime, mayaPeer, { type: "interaction.wave", requestId: "wave-again", targetUserId: "user-leo" });

    expect(leoEvents.filter((event) => event.type === "interaction.wave")).toHaveLength(1);
    expect(mayaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "wave-again",
      code: "REACTION_RATE_LIMITED",
    });
    runtime.stop();
  });

  it("keeps meeting reactions with active participants", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const jonasEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);
    connect(runtime, "user-jonas", jonasEvents);

    send(runtime, mayaPeer, { type: "meeting.join", requestId: "join-maya", meetingId: "meeting-product-crit" });
    send(runtime, leoPeer, { type: "meeting.join", requestId: "join-leo", meetingId: "meeting-product-crit" });
    const jonasEventCount = jonasEvents.length;
    send(runtime, mayaPeer, { type: "interaction.react", requestId: "react-meeting", reaction: "celebrate" });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "interaction.reaction",
      reaction: "celebrate",
      scope: { type: "meeting", meetingId: "meeting-product-crit" },
    });
    expect(leoEvents.at(-1)).toMatchObject({ type: "interaction.reaction", reaction: "celebrate" });
    expect(jonasEvents).toHaveLength(jonasEventCount);
    runtime.stop();
  });

  it("does not reveal reactions from a hidden room", () => {
    const store = new DemoStore();
    store.updateAreaSettings("area-focus", { type: "private", locked: true, visibility: "members" });
    const runtime = new WorldRuntime(store);
    const priyaEvents: ServerEvent[] = [];
    const jonasEvents: ServerEvent[] = [];
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);
    connect(runtime, "user-jonas", jonasEvents);

    send(runtime, priyaPeer, { type: "interaction.react", requestId: "private-reaction", reaction: "thumbs_up" });

    expect(priyaEvents.at(-1)).toMatchObject({ type: "interaction.reaction", reaction: "thumbs_up" });
    expect(jonasEvents.some((event) => event.type === "interaction.reaction")).toBe(false);
    runtime.stop();
  });

  it("turns nearby reciprocal waves into a high five", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 410, y: 650 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 460, y: 650 };
      }
      return player;
    }));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "interaction.react", requestId: "wave-maya", reaction: "wave" });
    send(runtime, leoPeer, { type: "interaction.react", requestId: "wave-leo", reaction: "wave" });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "interaction.high_five",
      userIds: ["user-maya", "user-leo"],
      floorId: "floor-studio",
    });
    expect(leoEvents.at(-1)).toMatchObject({ type: "interaction.high_five" });
    runtime.stop();
  });

  it("clears a pending high five when someone enters a meeting", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 410, y: 650 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 460, y: 650 };
      }
      return player;
    }));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "interaction.react", requestId: "wave-maya", reaction: "wave" });
    send(runtime, mayaPeer, { type: "meeting.join", requestId: "join-meeting", meetingId: "meeting-product-crit" });
    send(runtime, leoPeer, { type: "interaction.react", requestId: "wave-leo", reaction: "wave" });

    expect(mayaEvents.some((event) => event.type === "interaction.high_five")).toBe(false);
    expect(leoEvents.some((event) => event.type === "interaction.high_five")).toBe(false);
    runtime.stop();
  });

  it("does not high five across the room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", []);

    send(runtime, mayaPeer, { type: "interaction.react", requestId: "wave-maya", reaction: "wave" });
    send(runtime, leoPeer, { type: "interaction.react", requestId: "wave-leo", reaction: "wave" });

    expect(mayaEvents.some((event) => event.type === "interaction.high_five")).toBe(false);
    runtime.stop();
  });

  it("rejects waves that bypass unavailable and self-interaction controls", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-priya", priyaEvents);

    send(runtime, mayaPeer, { type: "interaction.wave", requestId: "wave-dnd", targetUserId: "user-priya" });
    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", requestId: "wave-dnd", code: "PERSON_UNAVAILABLE" });
    expect(priyaEvents.some((event) => event.type === "interaction.wave")).toBe(false);

    send(runtime, mayaPeer, { type: "interaction.wave", requestId: "wave-self", targetUserId: "user-maya" });
    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", requestId: "wave-self", code: "INTERACTION_INVALID" });
    runtime.stop();
  });
});

describe("WorldRuntime spatial meetings", () => {
  it("joins and leaves a public meeting at its circular floor area", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", x: 800, y: 760 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }
    expect(mayaEvents.find((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle"))
      .toMatchObject({ type: "meeting.joined", meeting: { status: "live" } });

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "leave-huddle", x: 590, y: 760 });
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
    }
    expect(mayaEvents.find((event) => event.type === "meeting.left" && event.meetingId === "meeting-open-huddle"))
      .toBeDefined();
    runtime.stop();
  });

  it("does not rejoin a spatial meeting after disconnecting inside it", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", x: 800, y: 760 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }
    expect(store.getMeeting("meeting-open-huddle")?.participantIds).toContain("user-maya");

    runtime.disconnect(mayaPeer);
    runtime.runTickForTest();

    expect(store.getMeeting("meeting-open-huddle")?.participantIds).not.toContain("user-maya");
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")?.connected).toBe(false);
    runtime.stop();
  });

  it("automatically joins the meeting assigned to an entered room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    send(runtime, jonasPeer, { type: "floor.change", requestId: "reset-floor", floorId: "floor-rooftop" });
    send(runtime, jonasPeer, { type: "floor.change", requestId: "return-floor", floorId: "floor-studio" });
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-daily", x: 735, y: 360 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }

    expect(jonasEvents.find((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-product-crit"))
      .toBeDefined();
    runtime.stop();
  });

  it("does not start a scheduled meeting when someone walks through its room", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    send(runtime, jonasPeer, { type: "floor.change", requestId: "go-rooftop", floorId: "floor-rooftop" });
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-workshop", x: 760, y: 290 });
    for (let tick = 0; tick < 400; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.areaId).toBe("area-workshop");
    expect(jonasEvents.some((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-planning")).toBe(false);
    expect(store.getMeeting("meeting-planning")?.status).toBe("scheduled");
    runtime.stop();
  });

  it("removes a remote participant when their meeting room becomes hidden", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaPeer = connect(runtime, "user-maya", []);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    send(runtime, jonasPeer, { type: "meeting.join", requestId: "join-product-crit", meetingId: "meeting-product-crit" });
    expect(store.getMeeting("meeting-product-crit")?.participantIds).toContain("user-jonas");
    jonasEvents.length = 0;

    send(runtime, mayaPeer, {
      type: "area.update_settings",
      requestId: "hide-daily-room",
      areaId: "area-daily",
      settings: { type: "meeting", locked: false, visibility: "members" },
    });

    expect(store.getMeeting("meeting-product-crit")?.participantIds).not.toContain("user-jonas");
    expect(jonasEvents).toContainEqual({ type: "meeting.left", meetingId: "meeting-product-crit" });
    expect(jonasEvents.some((event) => event.type === "meeting.updated")).toBe(false);
    runtime.stop();
  });

  it("keeps an explicit spatial-meeting leave suppressed across manual meetings", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", x: 800, y: 760 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, { type: "meeting.leave", requestId: "leave-spatial", meetingId: "meeting-open-huddle" });
    const huddleJoinsAfterLeave = mayaEvents.filter((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle").length;
    send(runtime, mayaPeer, { type: "meeting.join", requestId: "join-planning", meetingId: "meeting-planning" });
    send(runtime, mayaPeer, { type: "meeting.leave", requestId: "leave-planning", meetingId: "meeting-planning" });
    runtime.runTickForTest();
    expect(mayaEvents.filter((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle")).toHaveLength(huddleJoinsAfterLeave);

    send(runtime, mayaPeer, { type: "meeting.join", requestId: "join-manually", meetingId: "meeting-open-huddle" });
    send(runtime, mayaPeer, { type: "meeting.leave", requestId: "leave-manual", meetingId: "meeting-open-huddle" });
    const joinedBeforeTick = mayaEvents.filter((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle").length;

    runtime.runTickForTest();

    expect(mayaEvents.filter((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-open-huddle")).toHaveLength(joinedBeforeTick);
    runtime.stop();
  });
});

describe("WorldRuntime navigation boundaries", () => {
  it("keeps manual movement inside the floor", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaPeer = connect(runtime, "user-maya", []);

    send(runtime, mayaPeer, { type: "floor.change", requestId: "reset-rooftop", floorId: "floor-rooftop" });
    send(runtime, mayaPeer, { type: "floor.change", requestId: "reset-studio", floorId: "floor-studio" });
    send(runtime, mayaPeer, { type: "movement.input", sequence: 1, dx: 0, dy: 1 });
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, { type: "movement.input", sequence: 2, dx: 0, dy: 0 });

    const player = runtime.serializePlayers().find((candidate) => candidate.userId === "user-maya");
    expect(player?.y).toBeLessThanOrEqual(987);
    expect(player?.y).toBeGreaterThan(970);
    runtime.stop();
  });

  it("keeps multiple sessions on the same authoritative floor", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const firstEvents: ServerEvent[] = [];
    const secondEvents: ServerEvent[] = [];
    const firstPeer = connect(runtime, "user-maya", firstEvents);
    const secondPeer = connect(runtime, "user-maya", secondEvents);
    firstEvents.length = 0;
    secondEvents.length = 0;

    send(runtime, firstPeer, { type: "floor.change", requestId: "change-floor", floorId: "floor-rooftop" });

    expect(firstEvents).toContainEqual(expect.objectContaining({ type: "session.ready", floorId: "floor-rooftop" }));
    expect(secondEvents).toContainEqual(expect.objectContaining({ type: "session.ready", floorId: "floor-rooftop" }));
    expect(secondEvents).toContainEqual(expect.objectContaining({ type: "world.snapshot", floorId: "floor-rooftop" }));

    send(runtime, firstPeer, { type: "movement.input", sequence: 50, dx: 1, dy: 0 });
    runtime.runTickForTest();
    const movedRight = runtime.serializePlayers().find((player) => player.userId === "user-maya")?.x ?? 0;
    send(runtime, secondPeer, { type: "movement.input", sequence: 1, dx: -1, dy: 0 });
    runtime.runTickForTest();
    const movedLeft = runtime.serializePlayers().find((player) => player.userId === "user-maya")?.x ?? 0;

    expect(movedLeft).toBeLessThan(movedRight);
    runtime.stop();
  });

  it("uses the member's canonical floor when a reconnect requests a stale floor", () => {
    const store = new DemoStore();
    store.updateOnline("user-maya", false);
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];

    runtime.connect("user-maya", "floor-rooftop", (event) => events.push(event));

    expect(events).toContainEqual(expect.objectContaining({ type: "session.ready", floorId: "floor-studio" }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "world.snapshot",
      floorId: "floor-studio",
      players: expect.arrayContaining([expect.objectContaining({ userId: "user-maya", floorId: "floor-studio" })]),
    }));
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")?.floorId).toBe("floor-studio");
    runtime.stop();
  });

  it("resynchronizes mutable workspace data after a reconnect", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const firstEvents: ServerEvent[] = [];
    const firstPeer = connect(runtime, "user-jonas", firstEvents);
    runtime.disconnect(firstPeer);

    store.addMessage("conversation-team", "user-leo", "Sent while disconnected.");
    store.addScore({ definitionId: "game-stack", userId: "user-leo", score: 7200, lines: 12 });
    store.updateRole("user-jonas", "admin");

    const reconnectEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", reconnectEvents);

    const snapshot = reconnectEvents.find((event) => event.type === "workspace.snapshot");
    expect(snapshot?.type === "workspace.snapshot" && snapshot.data.messages).toContainEqual(
      expect.objectContaining({ body: "Sent while disconnected." }),
    );
    expect(snapshot?.type === "workspace.snapshot" && snapshot.data.scores).toContainEqual(
      expect.objectContaining({ score: 7200, userId: "user-leo" }),
    );
    expect(snapshot?.type === "workspace.snapshot" && snapshot.data.members).toContainEqual(
      expect.objectContaining({ id: "user-jonas", role: "admin", online: true }),
    );
    expect(snapshot?.type === "workspace.snapshot" && snapshot.data.layouts.flatMap((layout) => layout.areas)).toContainEqual(
      expect.objectContaining({ id: "area-quiet" }),
    );
    runtime.stop();
  });

  it("restores an active call and meeting in additional sessions", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", []);

    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-leo",
      targetUserId: "user-leo",
    });
    const callSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-maya", callSessionEvents);

    expect(latestCall(callSessionEvents)).toMatchObject({
      state: "ringing",
      direction: "outgoing",
      peerUserId: "user-leo",
    });
    expect(callSessionEvents).toContainEqual({ type: "area.access_snapshot", areaIds: [] });

    const activeCall = latestCall(mayaEvents);
    if (activeCall?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, mayaPeer, {
      type: "call.end",
      requestId: "end-call",
      callId: activeCall.callId,
    });
    send(runtime, mayaPeer, {
      type: "meeting.join",
      requestId: "join-meeting",
      meetingId: "meeting-product-crit",
    });
    const meetingSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-maya", meetingSessionEvents);

    expect(meetingSessionEvents).toContainEqual(expect.objectContaining({
      type: "meeting.joined",
      meeting: expect.objectContaining({ id: "meeting-product-crit" }),
    }));
    runtime.stop();
  });
});

describe("WorldRuntime layout safety", () => {
  it("prevents erasing the final door from an enclosed room", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const revision = store.getLayout("floor-studio")?.revision ?? 0;

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "erase-final-door",
      baseRevision: revision,
      tool: "erase",
      x: 735,
      y: 410,
    });

    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_REQUIRES_DOOR" });
    expect(store.getArea("area-daily")?.doors).toHaveLength(1);
    expect(store.getLayout("floor-studio")?.revision).toBe(revision);
    runtime.stop();
  });

  it("prevents placing a solid object across a room doorway", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "block-door",
      baseRevision: store.getLayout("floor-studio")?.revision ?? 0,
      tool: "wall",
      x: 735,
      y: 420,
    });

    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "SPACE_OCCUPIED" });
    runtime.stop();
  });

  it("sends filtered layout updates to people on other floors", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaPeer = connect(runtime, "user-maya", []);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    send(runtime, jonasPeer, { type: "floor.change", requestId: "go-rooftop", floorId: "floor-rooftop" });
    jonasEvents.length = 0;

    send(runtime, mayaPeer, {
      type: "area.update_settings",
      requestId: "hide-focus",
      areaId: "area-focus",
      settings: { type: "private", locked: true, visibility: "members" },
    });

    const update = jonasEvents.find((event) => event.type === "layout.updated" && event.layout.floorId === "floor-studio");
    expect(update).toBeDefined();
    expect(update?.type === "layout.updated" && update.layout.areas.some((area) => area.id === "area-focus")).toBe(false);
    runtime.stop();
  });

  it("refreshes meetings and conversations when room visibility changes", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaPeer = connect(runtime, "user-maya", []);
    const jonasEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", jonasEvents);
    jonasEvents.length = 0;

    send(runtime, mayaPeer, {
      type: "area.update_settings",
      requestId: "hide-daily",
      areaId: "area-daily",
      settings: { type: "meeting", locked: false, visibility: "members" },
    });

    const hiddenAccess = jonasEvents.find((event) => event.type === "workspace.access_updated");
    expect(hiddenAccess?.type === "workspace.access_updated" && hiddenAccess.access.meetings.some((meeting) => meeting.id === "meeting-product-crit")).toBe(false);
    expect(hiddenAccess?.type === "workspace.access_updated" && hiddenAccess.access.conversations.some((conversation) => conversation.id === "conversation-daily")).toBe(false);
    expect(hiddenAccess?.type === "workspace.access_updated" && hiddenAccess.access.messages.some((message) => message.conversationId === "conversation-daily")).toBe(false);

    runtime.stop();
  });

  it("does not reserve layout space for disconnected players and restores them safely", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaPeer = connect(runtime, "user-maya", []);
    runtime.disconnect(mayaPeer);
    const leoEvents: ServerEvent[] = [];
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, leoPeer, {
      type: "layout.apply",
      requestId: "place-after-disconnect",
      baseRevision: store.getLayout("floor-studio")?.revision ?? 0,
      tool: "plant",
      x: 410,
      y: 650,
    });

    expect(leoEvents.some((event) => event.type === "command.error" && event.requestId === "place-after-disconnect")).toBe(false);
    expect(store.getLayout("floor-studio")?.objects).toContainEqual(expect.objectContaining({ type: "plant", x: 416, y: 640 }));

    runtime.connect("user-maya", "floor-studio", () => undefined);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({ x: 770, y: 890 });
    runtime.stop();
  });
});

describe("WorldRuntime workspace access", () => {
  it("refreshes live access and removes a demoted member from a hidden room", () => {
    const store = new DemoStore();
    store.updateRole("user-jonas", "admin");
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    send(runtime, jonasPeer, { type: "floor.change", requestId: "go-rooftop", floorId: "floor-rooftop" });
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-quiet", x: 720, y: 480 });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }
    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.areaId).toBe("area-quiet");
    jonasEvents.length = 0;

    runtime.publishRoleChange(store.updateRole("user-jonas", "member"));

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.areaId).toBeUndefined();
    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "presence.changed",
      member: expect.objectContaining({ id: "user-jonas", role: "member" }),
    }));
    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "workspace.access_updated",
      access: expect.objectContaining({ invitations: [] }),
    }));
    const rooftopLayout = jonasEvents.find((event) => event.type === "layout.updated" && event.layout.floorId === "floor-rooftop");
    expect(rooftopLayout?.type === "layout.updated" && rooftopLayout.layout.areas.some((area) => area.id === "area-quiet")).toBe(false);
    runtime.stop();
  });

  it("publishes invitation changes to connected editors", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", leoEvents);
    mayaEvents.length = 0;
    leoEvents.length = 0;

    const invitation = store.addInvitation("new-person@example.com", "member");
    runtime.publishWorkspaceAccess();

    for (const events of [mayaEvents, leoEvents]) {
      expect(events).toContainEqual(expect.objectContaining({
        type: "workspace.access_updated",
        access: expect.objectContaining({
          invitations: expect.arrayContaining([expect.objectContaining({ id: invitation.id })]),
        }),
      }));
    }
    runtime.stop();
  });
});

describe("WorldRuntime private-area access", () => {
  it("blocks manual movement through a locked door", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "movement.input", sequence: 1, dx: 0, dy: -1 });
    for (let tick = 0; tick < 60; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, jonasPeer, { type: "movement.input", sequence: 2, dx: 0, dy: 0 });

    const player = runtime.serializePlayers().find((candidate) => candidate.userId === "user-jonas");
    expect(player?.areaId).not.toBe("area-focus");
    expect(player?.y).toBeGreaterThan(410);
    runtime.stop();
  });

  it("cancels click-to-move when a room locks during the walk", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const mayaPeer = connect(runtime, "user-maya", []);

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-daily", x: 735, y: 350 });
    for (let tick = 0; tick < 20; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, {
      type: "area.update_settings",
      requestId: "lock-daily",
      areaId: "area-daily",
      settings: { type: "meeting", locked: true, visibility: "public" },
    });
    for (let tick = 0; tick < 220; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.areaId).not.toBe("area-daily");
    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "enter-daily",
      code: "DESTINATION_BLOCKED",
    }));
    runtime.stop();
  });

  it("lets a current occupant admit a nearby coworker into a locked room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });

    const request = requestedKnock(priyaEvents);
    expect(request).toMatchObject({
      type: "area.knock_requested",
      knock: { areaId: "area-focus", requesterUserId: "user-jonas" },
    });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "pending" });
    if (request?.type !== "area.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, leoPeer, { type: "area.knock_respond", requestId: "outsider-response", knockId: request.knock.id, accept: true });
    expect(leoEvents.at(-1)).toMatchObject({ type: "command.error", code: "KNOCK_NOT_FOUND" });

    send(runtime, priyaPeer, { type: "area.knock_respond", requestId: "admit", knockId: request.knock.id, accept: true });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "accepted", responderUserId: "user-priya" });
    expect(priyaEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "accepted" });

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter", x: 1216, y: 256 });
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
    }
    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.areaId).toBe("area-focus");
    runtime.stop();
  });

  it("dismisses a knock for an occupant who leaves while keeping other recipients active", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, x: 1100, y: 250 }
      : player));
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const mayaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
    const request = requestedKnock(priyaEvents);
    expect(requestedKnock(mayaEvents)).toMatchObject({ type: "area.knock_requested" });
    if (request?.type !== "area.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "leave-focus", x: 900, y: 450 });
    for (let tick = 0; tick < 300; tick += 1) {
      runtime.runTickForTest();
    }

    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "area.knock_state",
      state: "expired",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    send(runtime, priyaPeer, { type: "area.knock_respond", requestId: "admit", knockId: request.knock.id, accept: true });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "accepted" });
    runtime.stop();
  });

  it("keeps a declined coworker outside the locked room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "area.knock_requested") {
      throw new Error("Knock was not delivered");
    }
    send(runtime, priyaPeer, { type: "area.knock_respond", requestId: "decline", knockId: request.knock.id, accept: false });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "declined" });

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter", x: 1216, y: 256 });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "command.error", code: "DESTINATION_BLOCKED" });
    runtime.stop();
  });

  it("does not create an access request when nobody is inside", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });

    expect(jonasEvents.at(-1)).toMatchObject({ type: "command.error", code: "KNOCK_NO_OCCUPANTS" });
    runtime.stop();
  });

  it("expires an unanswered access request", () => {
    vi.useFakeTimers();
    const runtime = new WorldRuntime(new DemoStore());
    try {
      const jonasEvents: ServerEvent[] = [];
      const priyaEvents: ServerEvent[] = [];
      const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
      connect(runtime, "user-priya", priyaEvents);

      walkToFocusDoor(runtime, jonasPeer);
      send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
      vi.advanceTimersByTime(20_000);

      expect(jonasEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "expired" });
      expect(priyaEvents.at(-1)).toMatchObject({ type: "area.knock_state", state: "expired" });
    } finally {
      runtime.stop();
      vi.useRealTimers();
    }
  });

  it("expires a knock when the requester walks away", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    connect(runtime, "user-priya", []);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "walk-away", x: 1230, y: 650 });
    for (let tick = 0; tick < 120; tick += 1) {
      runtime.runTickForTest();
    }

    expect(jonasEvents).toContainEqual(expect.objectContaining({ type: "area.knock_state", state: "expired" }));
    runtime.stop();
  });

  it("expires a pending knock when the requester loses room visibility", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);
    const mayaPeer = connect(runtime, "user-maya", []);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "area.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, mayaPeer, {
      type: "area.update_settings",
      requestId: "hide-focus",
      areaId: "area-focus",
      settings: { type: "private", locked: true, visibility: "members" },
    });

    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "area.knock_state",
      state: "expired",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    send(runtime, priyaPeer, {
      type: "area.knock_respond",
      requestId: "stale-response",
      knockId: request.knock.id,
      accept: true,
    });
    expect(priyaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "stale-response",
      code: "KNOCK_NOT_FOUND",
    });
    runtime.stop();
  });

  it("restores pending knocks and granted room access in additional sessions", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "area.knock", requestId: "knock", areaId: "area-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "area.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    const requesterSessionEvents: ServerEvent[] = [];
    const recipientSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", requesterSessionEvents);
    connect(runtime, "user-priya", recipientSessionEvents);
    expect(requesterSessionEvents).toContainEqual(expect.objectContaining({
      type: "area.knock_state",
      state: "pending",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    expect(recipientSessionEvents).toContainEqual(expect.objectContaining({
      type: "area.knock_requested",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));

    send(runtime, priyaPeer, {
      type: "area.knock_respond",
      requestId: "admit",
      knockId: request.knock.id,
      accept: true,
    });
    const grantedSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", grantedSessionEvents);
    expect(grantedSessionEvents).toContainEqual({
      type: "area.access_snapshot",
      areaIds: ["area-focus"],
    });
    runtime.stop();
  });
});

describe("WorldRuntime chat privacy", () => {
  it("delivers direct messages only to conversation participants", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const jonasEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    connect(runtime, "user-leo", leoEvents);
    connect(runtime, "user-jonas", jonasEvents);

    send(runtime, mayaPeer, {
      type: "chat.send",
      requestId: "private-message",
      conversationId: "conversation-leo",
      body: "Direct only.",
    });

    expect(mayaEvents).toContainEqual(expect.objectContaining({ type: "chat.message_created" }));
    expect(leoEvents).toContainEqual(expect.objectContaining({ type: "chat.message_created" }));
    expect(jonasEvents.some((event) => event.type === "chat.message_created")).toBe(false);
    runtime.stop();
  });

  it("rejects messages to a direct conversation the sender does not belong to", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    send(runtime, jonasPeer, {
      type: "chat.send",
      requestId: "forbidden-message",
      conversationId: "conversation-leo",
      body: "Should not send.",
    });

    expect(jonasEvents.at(-1)).toMatchObject({ type: "command.error", code: "CONVERSATION_FORBIDDEN" });
    runtime.stop();
  });
});

describe("WorldRuntime game lifecycle", () => {
  it("stops a game when its player closes it", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "game.start", requestId: "start-game", definitionId: "game-stack" });
    expect(mayaEvents).toContainEqual(expect.objectContaining({ type: "game.state" }));
    send(runtime, mayaPeer, { type: "game.end", requestId: "end-game" });
    send(runtime, mayaPeer, { type: "game.command", requestId: "move-after-close", command: "left" });

    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "GAME_NOT_STARTED" });
    runtime.stop();
  });
});
