import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime movement", () => {
  it.each(["direction", "destination"])("preserves %s movement when another connection opens and closes", (kind) => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, floorId: "floor-studio", x: 770, y: 890 } : player));
    const peer = runtime.connect("user-maya", "floor-studio", () => undefined);
    runtime.handleCommand(peer, kind === "direction"
      ? { type: "movement.input", sequence: 1, dx: 1, dy: 0 }
      : { type: "movement.set_destination", requestId: "walk", floorId: "floor-studio", x: 900, y: 890 });
    const secondPeer = runtime.connect("user-maya", "floor-studio", () => undefined);
    runtime.disconnect(secondPeer);
    runtime.runTickForTest(100);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x).toBeGreaterThan(770);
    runtime.disconnect(peer);
    const stoppedX = runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x;
    runtime.runTickForTest(100);
    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")!.x).toBe(stoppedX);
    runtime.stop();
  });

  it("moves directional input at the player movement speed", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, floorId: "floor-studio", x: 770, y: 890 }
      : player));
    const peerId = runtime.connect("user-maya", "floor-studio", () => undefined);

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest(100);

    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({
      x: 779.6,
      y: 890,
    });
    runtime.stop();
  });
});
