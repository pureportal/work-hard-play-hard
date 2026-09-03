import { getOutdoorBounds, getOutdoorWindowLights, type ClientCommand, type ServerEvent } from "@workhard/shared";
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
  return events.find((event) => event.type === "room.knock_requested");
}

function walkToFocusDoor(runtime: WorldRuntime, peerId: string): void {
  send(runtime, peerId, { type: "movement.set_destination", requestId: "approach-focus", floorId: "floor-studio", x: 1216, y: 480 });
  for (let tick = 0; tick < 180; tick += 1) {
    runtime.runTickForTest();
  }
}

function travelToFloor(runtime: WorldRuntime, peerId: string, events: ServerEvent[], userId: string, floorId: string): void {
  const destination = floorId === "floor-rooftop" ? { x: 640, y: 710 } : { x: 770, y: 890 };
  const readyCount = events.filter((event) => event.type === "session.ready" && event.floorId === floorId).length;
  send(runtime, peerId, {
    type: "movement.set_destination",
    requestId: `travel-${floorId}-${readyCount}`,
    floorId,
    ...destination,
  });
  for (let tick = 0; tick < 500; tick += 1) {
    runtime.runTickForTest();
    const player = runtime.serializePlayers().find((candidate) => candidate.userId === userId);
    if (
      player?.floorId === floorId
      && Math.hypot(player.x - destination.x, player.y - destination.y) < 0.01
    ) {
      return;
    }
  }
  throw new Error(`Travel to ${floorId} did not complete`);
}

describe("WorldRuntime calls", () => {
  it("walks to a coworker and rings until the recipient accepts", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, {
      type: "movement.approach_user",
      requestId: "approach-leo",
      targetUserId: "user-leo",
    });
    for (let tick = 0; tick < 300; tick += 1) {
      runtime.runTickForTest();
    }

    const incoming = latestCall(leoEvents);
    expect(latestCall(mayaEvents)).toMatchObject({ state: "ringing", direction: "outgoing", peerUserId: "user-leo" });
    expect(incoming).toMatchObject({ state: "ringing", direction: "incoming", peerUserId: "user-maya" });
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }

    send(runtime, leoPeer, {
      type: "call.respond",
      requestId: "accept-walk-up",
      callId: incoming.callId,
      accept: true,
    });

    expect(latestCall(mayaEvents)).toMatchObject({ state: "accepted", direction: "outgoing" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "accepted", direction: "incoming" });
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
      floorId: "floor-studio",
      x: 650,
      y: 500,
    });
    for (let tick = 0; tick < 400; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestCall(mayaEvents)).toMatchObject({ state: "ringing", peerUserId: "user-leo" });
    expect(mayaEvents.some((event) => event.type === "command.error" && event.requestId === "approach-moving-leo")).toBe(false);
    runtime.stop();
  });

  it("does not ring someone who is already in a meeting", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, leoPeer, {
      type: "meeting.join",
      requestId: "join-remote-meeting",
      meetingId: "meeting-open-huddle",
    });
    mayaEvents.length = 0;
    leoEvents.length = 0;
    send(runtime, mayaPeer, {
      type: "call.request",
      requestId: "call-meeting-participant",
      targetUserId: "user-leo",
    });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "call-meeting-participant",
      code: "PERSON_IN_MEETING",
    });
    expect(leoEvents.some((event) => event.type === "call.state")).toBe(false);
    runtime.stop();
  });

  it("rings nearby coworkers and changes state only after the recipient accepts", () => {
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

    expect(latestCall(mayaEvents)).toMatchObject({ state: "accepted", direction: "outgoing" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "accepted", direction: "incoming" });

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

  it("ends an accepted call when either person changes floors", () => {
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
    travelToFloor(runtime, leoPeer, leoEvents, "user-leo", "floor-rooftop");

    expect(latestCall(mayaEvents)).toMatchObject({ state: "ended" });
    expect(latestCall(leoEvents)).toMatchObject({ state: "ended" });
    runtime.stop();
  });

  it("keeps an accepted call active when someone enters a meeting area without opening it", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 690, y: 760 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 650, y: 760 };
      }
      return player;
    }));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "call.request", requestId: "call-leo", targetUserId: "user-leo" });
    const incoming = latestCall(leoEvents);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, { type: "call.respond", requestId: "accept", callId: incoming.callId, accept: true });
    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", floorId: "floor-studio", x: 800, y: 760 });
    for (let tick = 0; tick < 30; tick += 1) {
      runtime.runTickForTest();
    }

    expect(latestCall(mayaEvents)).toMatchObject({ state: "accepted", callId: incoming.callId });
    expect(mayaEvents.some((event) => event.type === "meeting.joined")).toBe(false);
    runtime.stop();
  });

  it("keeps an accepted call active when someone enters an open meeting room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => {
      if (player.userId === "user-maya") {
        return { ...player, x: 690, y: 500 };
      }
      if (player.userId === "user-leo") {
        return { ...player, x: 650, y: 500 };
      }
      return player;
    }));
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "call.request", requestId: "call-leo", targetUserId: "user-leo" });
    const incoming = latestCall(leoEvents);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, { type: "call.respond", requestId: "accept", callId: incoming.callId, accept: true });
    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "enter-daily-room",
      floorId: "floor-studio",
      x: 735,
      y: 350,
    });
    for (let tick = 0; tick < 30; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")?.roomId).toBe("room-daily");
    expect(latestCall(mayaEvents)).toMatchObject({ state: "accepted", callId: incoming.callId });
    expect(mayaEvents.some((event) => event.type === "meeting.joined")).toBe(false);
    runtime.stop();
  });

  it("keeps an accepted call active when a meeting join is rejected", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const mayaEvents: ServerEvent[] = [];
    const leoEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const leoPeer = connect(runtime, "user-leo", leoEvents);

    send(runtime, mayaPeer, { type: "call.request", requestId: "call-leo", targetUserId: "user-leo" });
    const incoming = latestCall(leoEvents);
    if (incoming?.type !== "call.state") {
      throw new Error("Call did not ring");
    }
    send(runtime, leoPeer, { type: "call.respond", requestId: "accept", callId: incoming.callId, accept: true });
    send(runtime, mayaPeer, { type: "meeting.join", requestId: "missing-meeting", meetingId: "missing" });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "missing-meeting",
      code: "MEETING_NOT_FOUND",
    });
    expect(latestCall(mayaEvents)).toMatchObject({ state: "accepted", callId: incoming.callId });
    expect(latestCall(leoEvents)).toMatchObject({ state: "accepted", callId: incoming.callId });
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

describe("WorldRuntime meeting entry", () => {
  it("does not join a public meeting when a player enters its area", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", floorId: "floor-studio", x: 800, y: 760 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }

    expect(mayaEvents.some((event) => event.type === "meeting.joined")).toBe(false);
    expect(store.getMeeting("meeting-open-huddle")?.participantIds).not.toContain("user-maya");
    runtime.stop();
  });

  it("does not join the meeting assigned to an entered room", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    travelToFloor(runtime, jonasPeer, jonasEvents, "user-jonas", "floor-rooftop");
    travelToFloor(runtime, jonasPeer, jonasEvents, "user-jonas", "floor-studio");
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-daily", floorId: "floor-studio", x: 735, y: 360 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).toBe("room-daily");
    expect(jonasEvents.some((event) => event.type === "meeting.joined")).toBe(false);
    expect(store.getMeeting("meeting-product-crit")?.participantIds).not.toContain("user-jonas");
    runtime.stop();
  });

  it("does not start a scheduled meeting when someone walks through its room", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    travelToFloor(runtime, jonasPeer, jonasEvents, "user-jonas", "floor-rooftop");
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-workshop", floorId: "floor-rooftop", x: 760, y: 290 });
    for (let tick = 0; tick < 400; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).toBe("room-workshop");
    expect(jonasEvents.some((event) => event.type === "meeting.joined" && event.meeting.id === "meeting-planning")).toBe(false);
    expect(store.getMeeting("meeting-planning")?.status).toBe("scheduled");
    runtime.stop();
  });

  it("joins only after an explicit request and does not rejoin after leaving", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "enter-huddle", floorId: "floor-studio", x: 800, y: 760 });
    for (let tick = 0; tick < 250; tick += 1) {
      runtime.runTickForTest();
    }
    expect(mayaEvents.some((event) => event.type === "meeting.joined")).toBe(false);

    send(runtime, mayaPeer, { type: "meeting.join", requestId: "open-meeting", meetingId: "meeting-open-huddle" });
    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "meeting.joined",
      meeting: expect.objectContaining({ id: "meeting-open-huddle" }),
    }));
    expect(store.getMeeting("meeting-open-huddle")?.participantIds).toContain("user-maya");

    send(runtime, mayaPeer, { type: "meeting.leave", requestId: "leave-meeting", meetingId: "meeting-open-huddle" });
    const joinsAfterLeave = mayaEvents.filter((event) => event.type === "meeting.joined").length;

    runtime.runTickForTest();

    expect(mayaEvents.filter((event) => event.type === "meeting.joined")).toHaveLength(joinsAfterLeave);
    expect(store.getMeeting("meeting-open-huddle")?.participantIds).not.toContain("user-maya");
    runtime.stop();
  });
});

describe("WorldRuntime navigation boundaries", () => {
  it("keeps manual movement inside the navigable outdoor bounds", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    travelToFloor(runtime, mayaPeer, mayaEvents, "user-maya", "floor-rooftop");
    travelToFloor(runtime, mayaPeer, mayaEvents, "user-maya", "floor-studio");
    send(runtime, mayaPeer, { type: "movement.input", sequence: 1, dx: 0, dy: 1 });
    for (let tick = 0; tick < 200; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, { type: "movement.input", sequence: 2, dx: 0, dy: 0 });

    const player = runtime.serializePlayers().find((candidate) => candidate.userId === "user-maya");
    const floor = store.getFloor("floor-studio")!;
    const bounds = getOutdoorBounds(floor);
    expect(player?.y).toBeLessThanOrEqual(bounds.y + bounds.height - 13);
    expect(player?.y).toBeGreaterThan(floor.height);
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

    travelToFloor(runtime, firstPeer, firstEvents, "user-maya", "floor-rooftop");

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
    runtime.disconnect(secondPeer);
    runtime.runTickForTest();
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")?.x).toBe(movedLeft);
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
    expect(events.at(-1)).toEqual({ type: "session.synced" });
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
    store.recordGameRound("round-reconnect", "game-tetris", [
      { userId: "user-leo", score: 7200, lines: 12, level: 2, order: 0 },
    ]);
    store.updateMemberAccess("user-jonas", "admin", []);

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
    expect(snapshot?.type === "workspace.snapshot" && snapshot.data.layouts.flatMap((layout) => layout.rooms)).toContainEqual(
      expect.objectContaining({ id: "room-quiet" }),
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
    expect(callSessionEvents).toContainEqual({ type: "room.access_snapshot", roomIds: [] });

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
  it("rejects stale room settings without overwriting the accepted update", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-maya", events);
    const baseRevision = store.getLayout("floor-studio")!.revision;

    send(runtime, peer, {
      type: "room.update_settings",
      requestId: "rename-room",
      baseRevision,
      roomId: "room-focus",
      settings: {
        name: "Focus One",
        color: "#d9cdf4",
        access: { mode: "open", assignedPersonIds: [], knockable: false },
      },
    });
    send(runtime, peer, {
      type: "room.update_settings",
      requestId: "stale-room-update",
      baseRevision,
      roomId: "room-focus",
      settings: {
        name: "Focus Two",
        color: "#d9cdf4",
        access: { mode: "open", assignedPersonIds: [], knockable: false },
      },
    });

    expect(store.getRoom("room-focus")?.name).toBe("Focus One");
    expect(events).toContainEqual(expect.objectContaining({
      type: "layout.updated",
      requestId: "rename-room",
    }));
    expect(events.at(-1)).toEqual({
      type: "layout.conflict",
      requestId: "stale-room-update",
      revision: baseRevision + 1,
    });
    runtime.stop();
  });

  it("opens a private room when its final door is removed", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const revision = store.getLayout("floor-studio")?.revision ?? 0;

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "erase-final-door",
      baseRevision: revision,
      edit: { tool: "erase", position: { x: 1216, y: 448 } },
    });

    expect(mayaEvents.some((event) => event.type === "command.error")).toBe(false);
    expect(store.getRoom("room-focus")).toMatchObject({
      privateEligible: false,
      doorIds: [],
      access: { mode: "open", knockable: false },
    });
    expect(mayaEvents).toContainEqual({ type: "room.access_revoked", roomId: "room-focus" });
    expect(store.getLayout("floor-studio")?.revision).toBe(revision + 1);

    send(runtime, mayaPeer, {
      type: "room.update_settings",
      requestId: "make-private-without-door",
      baseRevision: store.getLayout("floor-studio")!.revision,
      roomId: "room-focus",
      settings: {
        name: "Focus Suite",
        color: "#d9cdf4",
        access: { mode: "assigned", assignedPersonIds: ["user-maya", "user-priya"], knockable: true },
      },
    });
    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "ROOM_NOT_PRIVATE_ELIGIBLE" });
    runtime.stop();
  });

  it("places thin wall runs and detects the resulting room live", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const before = store.getLayout("floor-studio")!;

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "split-arcade",
      baseRevision: before.revision,
      edit: { tool: "wall", start: { x: 1408, y: 448 }, end: { x: 1408, y: 928 } },
    });

    const divided = store.getLayout("floor-studio")!;
    expect(divided.walls.at(-1)).toMatchObject({ start: { x: 1408, y: 448 }, end: { x: 1408, y: 928 } });
    expect(divided.rooms).toHaveLength(before.rooms.length + 1);
    expect(divided.rooms.find((room) => room.bounds.x === 1408)).toMatchObject({ privateEligible: false });

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "add-small-room-door",
      baseRevision: divided.revision,
      edit: { tool: "door", position: { x: 1408, y: 704 } },
    });
    expect(store.getLayout("floor-studio")?.rooms.find((room) => room.bounds.x === 1408)).toMatchObject({ privateEligible: true });
    runtime.stop();
  });

  it("keeps doors and windows clear of wall junctions", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "door-at-junction",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "door", position: { x: 960, y: 448 } },
    });

    expect(mayaEvents.at(-1)).toMatchObject({
      type: "command.error",
      requestId: "door-at-junction",
      code: "OPENING_AT_WALL_INTERSECTION",
    });
    runtime.stop();
  });

  it("adds an outdoor window with a floor-light source", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);
    const layout = store.getLayout("floor-studio")!;

    send(runtime, mayaPeer, {
      type: "layout.apply",
      requestId: "add-window",
      baseRevision: layout.revision,
      edit: { tool: "window", position: { x: 1100, y: 928 } },
    });

    const saved = store.getLayout("floor-studio")!;
    const window = saved.openings.find((opening) => opening.type === "window" && opening.wallId === "wall-studio-bottom" && opening.offset === 992);
    expect(window).toBeDefined();
    expect(getOutdoorWindowLights(saved, store.getFloor("floor-studio")!)).toContainEqual(expect.objectContaining({
      windowId: window?.id,
      roomId: "room-arcade",
    }));
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
      edit: { tool: "asset", assetId: "plant-floor", variantId: "forest", rotation: 0, position: { x: 410, y: 650 } },
    });

    expect(leoEvents.some((event) => event.type === "command.error" && event.requestId === "place-after-disconnect")).toBe(false);
    expect(store.getLayout("floor-studio")?.objects).toContainEqual(expect.objectContaining({ assetId: "plant-floor", x: 416, y: 656 }));

    runtime.connect("user-maya", "floor-studio", () => undefined);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({ x: 770, y: 890 });
    runtime.stop();
  });

  it("enforces build permission for every layout command", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = connect(runtime, "user-jonas", events);
    const initialRevision = store.getLayout("floor-studio")!.revision;
    const edit = { tool: "wall" as const, start: { x: 1408, y: 448 }, end: { x: 1408, y: 928 } };

    send(runtime, peer, { type: "layout.apply", requestId: "denied", baseRevision: initialRevision, edit });
    expect(events.at(-1)).toMatchObject({ type: "command.error", requestId: "denied", code: "EDIT_FORBIDDEN" });
    expect(store.getLayout("floor-studio")!.revision).toBe(initialRevision);

    store.updateMemberAccess("user-jonas", "member", ["build"]);
    events.length = 0;
    send(runtime, peer, { type: "layout.apply", requestId: "allowed", baseRevision: initialRevision, edit });
    expect(events.some((event) => event.type === "command.error" && event.requestId === "allowed")).toBe(false);
    expect(store.getLayout("floor-studio")!.revision).toBe(initialRevision + 1);

    store.updateMemberAccess("user-jonas", "member", []);
    events.length = 0;
    send(runtime, peer, {
      type: "layout.apply",
      requestId: "revoked",
      baseRevision: initialRevision + 1,
      edit: { tool: "erase", position: { x: 1408, y: 700 } },
    });
    expect(events.at(-1)).toMatchObject({ type: "command.error", requestId: "revoked", code: "EDIT_FORBIDDEN" });
    runtime.stop();
  });
});

describe("WorldRuntime workspace access", () => {
  it("evicts a person when they are removed from a private room", () => {
    const store = new DemoStore();
    store.updateRoomSettings("room-quiet", {
      name: "Quiet Corner",
      color: "#cbd3ed",
      access: { mode: "assigned", assignedPersonIds: ["user-aisha", "user-noah", "user-jonas"], knockable: true },
    });
    const runtime = new WorldRuntime(store);
    const mayaPeer = connect(runtime, "user-maya", []);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    travelToFloor(runtime, jonasPeer, jonasEvents, "user-jonas", "floor-rooftop");
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-quiet", floorId: "floor-rooftop", x: 720, y: 480 });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }
    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).toBe("room-quiet");
    jonasEvents.length = 0;

    send(runtime, mayaPeer, {
      type: "room.update_settings",
      requestId: "remove-jonas",
      baseRevision: store.getLayout("floor-rooftop")!.revision,
      roomId: "room-quiet",
      settings: {
        name: "Quiet Corner",
        color: "#cbd3ed",
        access: { mode: "assigned", assignedPersonIds: ["user-aisha", "user-noah"], knockable: true },
      },
    });

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).toBeUndefined();
    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "room.access_revoked",
      roomId: "room-quiet",
    }));
    const rooftopLayout = jonasEvents.find((event) => event.type === "layout.updated" && event.layout.floorId === "floor-rooftop");
    expect(rooftopLayout?.type === "layout.updated" && rooftopLayout.layout.rooms.some((room) => room.id === "room-quiet")).toBe(true);
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

    const { invitation } = store.issueInvitation("new-person@example.com", "member", []);
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

describe("WorldRuntime private-room access", () => {
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
    expect(player?.roomId).not.toBe("room-focus");
    expect(player?.y).toBeGreaterThan(410);
    runtime.stop();
  });

  it("cancels click-to-move when a room locks during the walk", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const mayaPeer = connect(runtime, "user-maya", []);

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter-daily", floorId: "floor-studio", x: 735, y: 350 });
    for (let tick = 0; tick < 20; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, {
      type: "room.update_settings",
      requestId: "lock-daily",
      baseRevision: store.getLayout("floor-studio")!.revision,
      roomId: "room-daily",
      settings: {
        name: "Daily Room",
        color: "#c6d7f5",
        access: { mode: "assigned", assignedPersonIds: ["user-amara"], knockable: true },
      },
    });
    for (let tick = 0; tick < 220; tick += 1) {
      runtime.runTickForTest();
    }

    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).not.toBe("room-daily");
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
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });

    const request = requestedKnock(priyaEvents);
    expect(request).toMatchObject({
      type: "room.knock_requested",
      knock: { roomId: "room-focus", requesterUserId: "user-jonas" },
    });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "pending" });
    if (request?.type !== "room.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, leoPeer, { type: "room.knock_respond", requestId: "outsider-response", knockId: request.knock.id, accept: true });
    expect(leoEvents.at(-1)).toMatchObject({ type: "command.error", code: "KNOCK_NOT_FOUND" });

    send(runtime, priyaPeer, { type: "room.knock_respond", requestId: "admit", knockId: request.knock.id, accept: true });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "accepted", responderUserId: "user-priya" });
    expect(priyaEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "accepted" });

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter", floorId: "floor-studio", x: 1216, y: 256 });
    for (let tick = 0; tick < 100; tick += 1) {
      runtime.runTickForTest();
    }
    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).toBe("room-focus");
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
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
    const request = requestedKnock(priyaEvents);
    expect(requestedKnock(mayaEvents)).toMatchObject({ type: "room.knock_requested" });
    if (request?.type !== "room.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "leave-focus", floorId: "floor-studio", x: 900, y: 520 });
    for (let tick = 0; tick < 300; tick += 1) {
      runtime.runTickForTest();
    }

    expect(mayaEvents).toContainEqual(expect.objectContaining({
      type: "room.knock_state",
      state: "expired",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    send(runtime, priyaPeer, { type: "room.knock_respond", requestId: "admit", knockId: request.knock.id, accept: true });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "accepted" });
    runtime.stop();
  });

  it("keeps a declined coworker outside the locked room", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "room.knock_requested") {
      throw new Error("Knock was not delivered");
    }
    send(runtime, priyaPeer, { type: "room.knock_respond", requestId: "decline", knockId: request.knock.id, accept: false });
    expect(jonasEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "declined" });

    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "enter", floorId: "floor-studio", x: 1216, y: 256 });
    for (let tick = 0; tick < 180; tick += 1) {
      runtime.runTickForTest();
    }
    expect(runtime.serializePlayers().find((player) => player.userId === "user-jonas")?.roomId).not.toBe("room-focus");
    runtime.stop();
  });

  it("does not create an access request when nobody is inside", () => {
    const runtime = new WorldRuntime(new DemoStore());
    const jonasEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });

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
      send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
      vi.advanceTimersByTime(20_000);

      expect(jonasEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "expired" });
      expect(priyaEvents.at(-1)).toMatchObject({ type: "room.knock_state", state: "expired" });
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
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
    send(runtime, jonasPeer, { type: "movement.set_destination", requestId: "walk-away", floorId: "floor-studio", x: 1230, y: 650 });
    for (let tick = 0; tick < 120; tick += 1) {
      runtime.runTickForTest();
    }

    expect(jonasEvents).toContainEqual(expect.objectContaining({ type: "room.knock_state", state: "expired" }));
    runtime.stop();
  });

  it("expires a pending knock when the requester loses room visibility", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const jonasEvents: ServerEvent[] = [];
    const priyaEvents: ServerEvent[] = [];
    const jonasPeer = connect(runtime, "user-jonas", jonasEvents);
    const priyaPeer = connect(runtime, "user-priya", priyaEvents);
    const mayaPeer = connect(runtime, "user-maya", []);

    walkToFocusDoor(runtime, jonasPeer);
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "room.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    send(runtime, mayaPeer, {
      type: "room.update_settings",
      requestId: "disable-focus-knocks",
      baseRevision: store.getLayout("floor-studio")!.revision,
      roomId: "room-focus",
      settings: {
        name: "Focus Suite",
        color: "#d9cdf4",
        access: { mode: "assigned", assignedPersonIds: ["user-priya", "user-maya"], knockable: false },
      },
    });

    expect(jonasEvents).toContainEqual(expect.objectContaining({
      type: "room.knock_state",
      state: "expired",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    send(runtime, priyaPeer, {
      type: "room.knock_respond",
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
    send(runtime, jonasPeer, { type: "room.knock", requestId: "knock", roomId: "room-focus" });
    const request = requestedKnock(priyaEvents);
    if (request?.type !== "room.knock_requested") {
      throw new Error("Knock was not delivered");
    }

    const requesterSessionEvents: ServerEvent[] = [];
    const recipientSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", requesterSessionEvents);
    connect(runtime, "user-priya", recipientSessionEvents);
    expect(requesterSessionEvents).toContainEqual(expect.objectContaining({
      type: "room.knock_state",
      state: "pending",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));
    expect(recipientSessionEvents).toContainEqual(expect.objectContaining({
      type: "room.knock_requested",
      knock: expect.objectContaining({ id: request.knock.id }),
    }));

    send(runtime, priyaPeer, {
      type: "room.knock_respond",
      requestId: "admit",
      knockId: request.knock.id,
      accept: true,
    });
    const grantedSessionEvents: ServerEvent[] = [];
    connect(runtime, "user-jonas", grantedSessionEvents);
    expect(grantedSessionEvents).toContainEqual({
      type: "room.access_snapshot",
      roomIds: ["room-focus"],
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
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, x: 1060, y: 700 }
      : player));
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = connect(runtime, "user-maya", mayaEvents);

    send(runtime, mayaPeer, { type: "movement.set_destination", requestId: "gather", floorId: "floor-studio", x: 1_050, y: 620 });
    for (let tick = 0; tick < 500; tick += 1) {
      runtime.runTickForTest();
    }
    send(runtime, mayaPeer, { type: "game.start", requestId: "start-game", definitionId: "game-tetris" });
    expect(mayaEvents).toContainEqual(expect.objectContaining({ type: "game.state" }));
    send(runtime, mayaPeer, { type: "game.end", requestId: "end-game" });
    send(runtime, mayaPeer, { type: "game.command", requestId: "move-after-close", command: "left" });

    expect(mayaEvents.at(-1)).toMatchObject({ type: "command.error", code: "GAME_NOT_STARTED" });
    runtime.stop();
  });
});
