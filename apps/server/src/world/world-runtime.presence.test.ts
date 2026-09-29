import type { ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { createTestData } from "../testing/workspace-data.js";
import { WorldRuntime } from "./world-runtime.js";

function availabilityEvents(events: ServerEvent[], userId: string) {
  return events.filter((event): event is Extract<ServerEvent, { type: "presence.changed" }> =>
    event.type === "presence.changed" && event.member.id === userId);
}

describe("idle presence", () => {
  it("shows Away after inactivity and restores the saved availability after activity", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peerId = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    runtime.handleCommand(peerId, { type: "presence.set_idle", requestId: "idle", idle: true });

    expect(store.getVisibleMember("user-maya")?.availability).toBe("away");
    expect(store.getBootstrap("user-maya").members.find((member) => member.id === "user-maya")?.availability).toBe("away");
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")?.availability).toBe("away");
    expect(availabilityEvents(events, "user-maya").at(-1)?.member.availability).toBe("away");
    expect(store.exportMutableState().members.find((member) => member.id === "user-maya")?.availability).toBe("available");

    runtime.handleCommand(peerId, { type: "presence.set_idle", requestId: "active", idle: false });

    expect(store.getVisibleMember("user-maya")?.availability).toBe("available");
    expect(availabilityEvents(events, "user-maya").at(-1)?.member.availability).toBe("available");
    runtime.stop();
  });

  it("only marks a person Away when all connected sessions are idle", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const first = runtime.connect("user-maya", "floor-studio", () => {});
    const second = runtime.connect("user-maya", "floor-studio", () => {});

    runtime.handleCommand(first, { type: "presence.set_idle", requestId: "first-idle", idle: true });
    expect(store.getVisibleMember("user-maya")?.availability).toBe("available");

    runtime.handleCommand(second, { type: "presence.set_idle", requestId: "second-idle", idle: true });
    expect(store.getVisibleMember("user-maya")?.availability).toBe("away");

    runtime.disconnect(second);
    expect(store.getVisibleMember("user-maya")?.availability).toBe("away");

    const replacement = runtime.connect("user-maya", "floor-studio", () => {});
    expect(store.getVisibleMember("user-maya")?.availability).toBe("available");

    runtime.disconnect(replacement);
    runtime.disconnect(first);
    expect(store.getVisibleMember("user-maya")?.availability).toBe("available");
    runtime.stop();
  });

  it("preserves explicit Busy, Do Not Disturb, and Away states", () => {
    const store = new WorkspaceStore(createTestData());
    const runtime = new WorldRuntime(store);
    const peerId = runtime.connect("user-maya", "floor-studio", () => {});

    runtime.handleCommand(peerId, { type: "presence.set_idle", requestId: "initial-idle", idle: true });
    expect(store.getVisibleMember("user-maya")?.availability).toBe("away");

    for (const availability of ["busy", "dnd", "away"] as const) {
      runtime.handleCommand(peerId, { type: "presence.set_availability", requestId: availability, availability });
      expect(store.getVisibleMember("user-maya")?.availability).toBe(availability);
      runtime.handleCommand(peerId, { type: "presence.set_idle", requestId: `${availability}-idle`, idle: true });
      expect(store.getVisibleMember("user-maya")?.availability).toBe(availability);
      runtime.handleCommand(peerId, { type: "presence.set_idle", requestId: `${availability}-active`, idle: false });
      expect(store.getVisibleMember("user-maya")?.availability).toBe(availability);
    }

    runtime.stop();
  });
});
