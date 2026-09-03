import type { ClientCommand, Room, ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { createSeedData } from "../seed.js";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

interface RuntimeContext {
  store: DemoStore;
  runtime: WorldRuntime;
  mayaEvents: ServerEvent[];
  leoEvents: ServerEvent[];
  mayaPeer: string;
  leoPeer: string;
}

function createRuntime(rooms: Room[] = []): RuntimeContext {
  const data = createSeedData();
  for (const member of data.members) {
    member.online = member.id === "user-maya" || member.id === "user-leo";
    if (member.id === "user-leo") {
      member.role = "member";
      member.permissions = [];
    }
    if (member.online) {
      member.floorId = "floor-studio";
      member.position = member.id === "user-maya" ? { x: 100, y: 100 } : { x: 200, y: 100 };
    }
  }
  const layout = data.layouts.find((candidate) => candidate.floorId === "floor-studio")!;
  layout.walls = [];
  layout.openings = [];
  layout.objects = [];
  layout.rooms = rooms;
  const store = new DemoStore(data);
  const runtime = new WorldRuntime(store);
  const mayaEvents: ServerEvent[] = [];
  const leoEvents: ServerEvent[] = [];
  const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
  const leoPeer = runtime.connect("user-leo", "floor-studio", (event) => leoEvents.push(event));
  mayaEvents.length = 0;
  leoEvents.length = 0;
  return { store, runtime, mayaEvents, leoEvents, mayaPeer, leoPeer };
}

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function player(runtime: WorldRuntime, userId: string) {
  return runtime.serializePlayers().find((candidate) => candidate.userId === userId)!;
}

function startKidnapping(context: RuntimeContext): void {
  send(context.runtime, context.mayaPeer, {
    type: "kidnapping.start",
    requestId: "kidnap-leo",
    targetUserId: "user-leo",
  });
}

function runUntilPickedUp(context: RuntimeContext): void {
  for (let tick = 0; tick < 200; tick += 1) {
    context.runtime.runTickForTest();
    if (context.mayaEvents.some((event) => event.type === "kidnapping.started")) {
      return;
    }
  }
  throw new Error("Pickup did not complete");
}

function room(id: string, bounds: Room["bounds"], assignedPersonIds: string[] = []): Room {
  return {
    id,
    floorId: "floor-studio",
    name: id,
    color: "#ffffff",
    capacity: 8,
    bounds,
    footprint: [bounds],
    boundary: [],
    doorIds: [],
    windowIds: [],
    privateEligible: true,
    access: assignedPersonIds.length > 0
      ? { mode: "assigned", assignedPersonIds, knockable: false }
      : { mode: "open", assignedPersonIds: [], knockable: false },
  };
}

describe("WorldRuntime kidnapping movement", () => {
  it("walks to the target before pickup and moves both players without teleporting", () => {
    const context = createRuntime();
    const initialCarrier = player(context.runtime, "user-maya");
    const initialTarget = player(context.runtime, "user-leo");

    startKidnapping(context);

    expect(player(context.runtime, "user-maya")).toMatchObject(initialCarrier);
    expect(player(context.runtime, "user-leo")).toMatchObject(initialTarget);
    expect(context.mayaEvents.some((event) => event.type === "kidnapping.started")).toBe(false);

    context.runtime.runTickForTest();
    expect(player(context.runtime, "user-maya").x).toBeGreaterThan(initialCarrier.x);
    expect(player(context.runtime, "user-maya").x).toBeLessThan(initialTarget.x);
    expect(player(context.runtime, "user-leo")).toMatchObject(initialTarget);

    runUntilPickedUp(context);
    const pickupPosition = player(context.runtime, "user-maya");
    expect(player(context.runtime, "user-leo")).toMatchObject({ x: pickupPosition.x, y: pickupPosition.y });

    send(context.runtime, context.mayaPeer, {
      type: "movement.set_destination",
      requestId: "carry-leo",
      floorId: "floor-studio",
      x: 420,
      y: 100,
    });
    context.runtime.runTickForTest();

    const carrierAfterOneTick = player(context.runtime, "user-maya");
    const targetAfterOneTick = player(context.runtime, "user-leo");
    expect(carrierAfterOneTick.x).toBeGreaterThan(pickupPosition.x);
    expect(carrierAfterOneTick.x).toBeLessThan(420);
    expect(targetAfterOneTick).toMatchObject({ x: carrierAfterOneTick.x, y: carrierAfterOneTick.y });
    context.runtime.stop();
  });

  it.each([
    ["click-to-move", { type: "movement.set_destination", requestId: "escape", floorId: "floor-studio", x: 200, y: 260 } as const],
    ["WASD", { type: "movement.input", sequence: 1, dx: 0, dy: 1 } as const],
  ])("lets the carried player cancel immediately with %s", (_name, command) => {
    const context = createRuntime();
    startKidnapping(context);
    runUntilPickedUp(context);
    context.mayaEvents.length = 0;
    context.leoEvents.length = 0;

    send(context.runtime, context.leoPeer, command);

    expect(context.leoEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.ended",
      carrierUserId: "user-maya",
      carriedUserId: "user-leo",
      reason: "cancelled",
    }));
    const carrierBeforeTick = player(context.runtime, "user-maya");
    context.runtime.runTickForTest();
    expect(player(context.runtime, "user-maya")).toMatchObject(carrierBeforeTick);
    expect(player(context.runtime, "user-leo").y).toBeGreaterThan(carrierBeforeTick.y);
    context.runtime.stop();
  });

  it("lets the target cancel while the carrier is still approaching", () => {
    const context = createRuntime();
    startKidnapping(context);
    context.runtime.runTickForTest();
    context.mayaEvents.length = 0;

    send(context.runtime, context.leoPeer, { type: "movement.input", sequence: 1, dx: 0, dy: 1 });

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "kidnap-leo",
      code: "KIDNAPPING_CANCELLED",
    }));
    for (let tick = 0; tick < 30; tick += 1) {
      context.runtime.runTickForTest();
    }
    expect(context.mayaEvents.some((event) => event.type === "kidnapping.started")).toBe(false);
    expect(player(context.runtime, "user-leo").y).toBeGreaterThan(100);
    context.runtime.stop();
  });

  it("ends the carry when either player disconnects", () => {
    const context = createRuntime();
    startKidnapping(context);
    runUntilPickedUp(context);
    context.mayaEvents.length = 0;

    context.runtime.disconnect(context.leoPeer);

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.ended",
      reason: "interrupted",
    }));
    context.runtime.stop();
  });

  it("rejects a destination the carried player cannot enter", () => {
    const restricted = room("restricted", { x: 340, y: 40, width: 140, height: 140 }, ["user-maya"]);
    const context = createRuntime([restricted]);
    startKidnapping(context);
    runUntilPickedUp(context);
    const pickupPosition = player(context.runtime, "user-maya");
    context.mayaEvents.length = 0;

    send(context.runtime, context.mayaPeer, {
      type: "movement.set_destination",
      requestId: "restricted-destination",
      floorId: "floor-studio",
      x: 400,
      y: 100,
    });

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "restricted-destination",
      code: "DESTINATION_BLOCKED",
    }));
    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.ended",
      reason: "access_revoked",
    }));
    context.runtime.runTickForTest();
    expect(player(context.runtime, "user-maya")).toMatchObject(pickupPosition);
    expect(player(context.runtime, "user-leo")).toMatchObject({ x: pickupPosition.x, y: pickupPosition.y });
    context.runtime.stop();
  });

  it("does not approach a target the carrier cannot reach", () => {
    const targetRoom = room("target-room", { x: 170, y: 40, width: 100, height: 140 }, ["user-leo"]);
    const context = createRuntime([targetRoom]);

    startKidnapping(context);

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "kidnap-leo",
      code: "DESTINATION_BLOCKED",
    }));
    context.runtime.runTickForTest();
    expect(player(context.runtime, "user-maya")).toMatchObject({ x: 100, y: 100 });
    expect(context.mayaEvents.some((event) => event.type === "kidnapping.started")).toBe(false);
    context.runtime.stop();
  });

  it("rejects routes through a room inaccessible to either player", () => {
    const barrier = room("barrier", { x: 240, y: -600, width: 64, height: 2_200 }, ["user-maya"]);
    const context = createRuntime([barrier]);
    startKidnapping(context);
    runUntilPickedUp(context);
    context.mayaEvents.length = 0;

    send(context.runtime, context.mayaPeer, {
      type: "movement.set_destination",
      requestId: "blocked-route",
      floorId: "floor-studio",
      x: 420,
      y: 100,
    });

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "blocked-route",
      code: "DESTINATION_BLOCKED",
    }));
    context.runtime.stop();
  });

  it("stops before entering a room that becomes restricted during the carry", () => {
    const destinationRoom = room("changing-room", { x: 340, y: 40, width: 140, height: 140 });
    const context = createRuntime([destinationRoom]);
    startKidnapping(context);
    runUntilPickedUp(context);
    send(context.runtime, context.mayaPeer, {
      type: "movement.set_destination",
      requestId: "changing-access",
      floorId: "floor-studio",
      x: 400,
      y: 100,
    });
    const layout = structuredClone(context.store.getLayout("floor-studio")!);
    layout.revision += 1;
    layout.rooms[0]!.access = { mode: "assigned", assignedPersonIds: ["user-maya"], knockable: false };
    context.store.replaceLayout(layout);
    context.mayaEvents.length = 0;

    for (let tick = 0; tick < 100; tick += 1) {
      context.runtime.runTickForTest();
      if (context.mayaEvents.some((event) => event.type === "kidnapping.ended")) {
        break;
      }
    }

    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.ended",
      reason: "access_revoked",
    }));
    expect(player(context.runtime, "user-leo").roomId).toBeUndefined();
    context.runtime.stop();
  });

  it("moves into a meeting room without joining its call", () => {
    const meetingRoom = room("room-daily", { x: 340, y: 40, width: 140, height: 140 });
    const context = createRuntime([meetingRoom]);
    const initialParticipants = context.store.getMeeting("meeting-product-crit")!.participantIds;
    startKidnapping(context);
    runUntilPickedUp(context);
    context.mayaEvents.length = 0;
    context.leoEvents.length = 0;

    send(context.runtime, context.mayaPeer, {
      type: "movement.set_destination",
      requestId: "meeting-room",
      floorId: "floor-studio",
      x: 400,
      y: 100,
    });
    for (let tick = 0; tick < 100; tick += 1) {
      context.runtime.runTickForTest();
    }

    expect(player(context.runtime, "user-maya").roomId).toBe("room-daily");
    expect(player(context.runtime, "user-leo").roomId).toBe("room-daily");
    expect([...context.mayaEvents, ...context.leoEvents].some((event) => event.type === "meeting.joined")).toBe(false);
    expect(context.store.getMeeting("meeting-product-crit")?.participantIds).toEqual(initialParticipants);
    context.runtime.stop();
  });

  it("keeps both players together through a floor portal", () => {
    const store = new DemoStore();
    const runtime = new WorldRuntime(store);
    const mayaEvents: ServerEvent[] = [];
    const mayaPeer = runtime.connect("user-maya", "floor-studio", (event) => mayaEvents.push(event));
    runtime.connect("user-leo", "floor-studio", () => undefined);
    mayaEvents.length = 0;
    send(runtime, mayaPeer, {
      type: "kidnapping.start",
      requestId: "portal-pickup",
      targetUserId: "user-leo",
    });
    for (let tick = 0; tick < 400 && !mayaEvents.some((event) => event.type === "kidnapping.started"); tick += 1) {
      runtime.runTickForTest();
    }
    expect(mayaEvents.some((event) => event.type === "kidnapping.started")).toBe(true);

    send(runtime, mayaPeer, {
      type: "movement.set_destination",
      requestId: "portal-carry",
      floorId: "floor-rooftop",
      x: 640,
      y: 710,
    });
    for (let tick = 0; tick < 1_000; tick += 1) {
      runtime.runTickForTest();
      const maya = player(runtime, "user-maya");
      const leo = player(runtime, "user-leo");
      if (
        maya.floorId === "floor-rooftop"
        && leo.floorId === "floor-rooftop"
        && Math.hypot(maya.x - 640, maya.y - 710) < 0.01
        && Math.hypot(leo.x - 640, leo.y - 710) < 0.01
      ) {
        break;
      }
    }

    expect(player(runtime, "user-maya")).toMatchObject({ floorId: "floor-rooftop", x: 640, y: 710 });
    expect(player(runtime, "user-leo")).toMatchObject({ floorId: "floor-rooftop", x: 640, y: 710 });
    runtime.stop();
  });
});

describe("WorldRuntime kidnapping consent", () => {
  it("applies global and player allow/block lists with Allow All defaults", () => {
    const store = new DemoStore();
    expect(store.canKidnap("user-maya", "user-leo")).toBe(true);

    store.updateGlobalKidnappingSettings({
      enabled: true,
      targetPolicy: { mode: "allow_list", userIds: ["user-leo"] },
    });
    expect(store.canKidnap("user-maya", "user-leo")).toBe(true);
    expect(store.canKidnap("user-maya", "user-jonas")).toBe(false);

    store.updateGlobalKidnappingSettings({
      enabled: true,
      targetPolicy: { mode: "block_list", userIds: ["user-leo"] },
    });
    expect(store.canKidnap("user-maya", "user-leo")).toBe(false);
    expect(store.canKidnap("user-maya", "user-jonas")).toBe(true);

    store.updateGlobalKidnappingSettings({
      enabled: true,
      targetPolicy: { mode: "allow_all", userIds: [] },
    });
    store.updatePlayerKidnappingSettings("user-leo", {
      carrierPolicy: { mode: "allow_list", userIds: ["user-maya"] },
    });
    expect(store.canKidnap("user-maya", "user-leo")).toBe(true);
    expect(store.canKidnap("user-jonas", "user-leo")).toBe(false);

    store.updatePlayerKidnappingSettings("user-leo", {
      carrierPolicy: { mode: "block_list", userIds: ["user-maya"] },
    });
    expect(store.canKidnap("user-maya", "user-leo")).toBe(false);
    expect(store.canKidnap("user-jonas", "user-leo")).toBe(true);
  });

  it("enforces the global switch and admin-only global updates", () => {
    const context = createRuntime();
    context.store.updateGlobalKidnappingSettings({
      enabled: false,
      targetPolicy: { mode: "allow_all", userIds: [] },
    });
    startKidnapping(context);
    expect(context.mayaEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "kidnap-leo",
      code: "KIDNAPPING_DISABLED",
    }));

    send(context.runtime, context.leoPeer, {
      type: "kidnapping.global_settings_update",
      requestId: "admin-only",
      settings: { enabled: true, targetPolicy: { mode: "allow_all", userIds: [] } },
    });
    expect(context.leoEvents).toContainEqual(expect.objectContaining({
      type: "command.error",
      requestId: "admin-only",
      code: "KIDNAPPING_SETTINGS_FORBIDDEN",
    }));

    send(context.runtime, context.mayaPeer, {
      type: "kidnapping.global_settings_update",
      requestId: "enable",
      settings: { enabled: true, targetPolicy: { mode: "allow_all", userIds: [] } },
    });
    expect(context.store.getGlobalKidnappingSettings().enabled).toBe(true);
    context.runtime.stop();
  });

  it("ends an active carry as soon as consent is withdrawn", () => {
    const context = createRuntime();
    startKidnapping(context);
    runUntilPickedUp(context);
    context.leoEvents.length = 0;

    send(context.runtime, context.leoPeer, {
      type: "kidnapping.player_settings_update",
      requestId: "opt-out",
      settings: { carrierPolicy: { mode: "allow_none", userIds: [] } },
    });

    expect(context.leoEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.player_settings_updated",
      settings: { carrierPolicy: { mode: "allow_none", userIds: [] } },
    }));
    expect(context.leoEvents).toContainEqual(expect.objectContaining({
      type: "kidnapping.ended",
      reason: "access_revoked",
    }));
    context.runtime.stop();
  });
});
