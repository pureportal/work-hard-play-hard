import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime movement", () => {
  it("moves directional input at the player movement speed", () => {
    const runtime = new WorldRuntime(new DemoStore());
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-maya"
      ? { ...player, floorId: "floor-studio", x: 770, y: 890 }
      : player));
    const peerId = runtime.connect("user-maya", "floor-studio", () => undefined);

    runtime.handleCommand(peerId, { type: "movement.input", sequence: 1, dx: 1, dy: 0 });
    runtime.runTickForTest(100);

    expect(runtime.serializePlayers().find((player) => player.userId === "user-maya")).toMatchObject({
      x: 796,
      y: 890,
    });
    runtime.stop();
  });
});
