import { REACTION_KINDS, type ReactionKind, type ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store.js";
import { createTestData } from "../testing/workspace-data.js";
import { WorldRuntime } from "./world-runtime.js";

function setup(devDummyUserIds: ReadonlySet<string> = new Set(["user-leo"]), nearby = true, dummyY = 650) {
  const runtime = new WorldRuntime(new WorkspaceStore(createTestData()), { devDummyUserIds });
  if (nearby) {
    runtime.restorePlayers(runtime.serializePlayers().map((player) => player.userId === "user-leo"
      ? { ...player, x: 460, y: dummyY }
      : player));
  }
  const events: ServerEvent[] = [];
  const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
  return { runtime, peer, events };
}

function react(runtime: WorldRuntime, peer: string, reaction: ReactionKind) {
  runtime.handleCommand(peer, { type: "interaction.react", requestId: `react-${reaction}`, reaction });
}

describe("dev dummy reactions", () => {
  it.each(REACTION_KINDS)("echoes %s through the normal floor reaction event", (reaction) => {
    const { runtime, peer, events } = setup();
    try {
      react(runtime, peer, reaction);
      const reactions = events.filter((event) => event.type === "interaction.reaction");
      expect(reactions).toEqual([
        expect.objectContaining({ userId: "user-maya", reaction, scope: { type: "floor", floorId: "floor-studio" } }),
        expect.objectContaining({ userId: "user-leo", reaction, scope: { type: "floor", floorId: "floor-studio" } }),
      ]);
      expect(reactions[0]?.id).not.toBe(reactions[1]?.id);
    } finally {
      runtime.stop();
    }
  });

  it.each([["wave", "high_five"], ["heart", "love"]] as const)("pairs a dummy %s with the player for %s", (reaction, kind) => {
    const { runtime, peer, events } = setup();
    try {
      react(runtime, peer, reaction);
      expect(events).toContainEqual(expect.objectContaining({
        type: "interaction.group_reaction", kind, userIds: ["user-maya", "user-leo"],
      }));
    } finally {
      runtime.stop();
    }
  });

  it("matches a dummy at the edge of the nearby interaction area", () => {
    const { runtime, peer, events } = setup(new Set(["user-leo"]), true, 750);
    try {
      react(runtime, peer, "wave");
      expect(events).toContainEqual(expect.objectContaining({
        type: "interaction.group_reaction", kind: "high_five", userIds: ["user-maya", "user-leo"],
      }));
    } finally {
      runtime.stop();
    }
  });

  it("ignores distant, unmarked, and live players", () => {
    const cases = [
      setup(new Set(["user-leo"]), false),
      setup(new Set()),
      setup(),
    ];
    cases[2]!.runtime.connect("user-leo", "floor-studio", () => undefined);
    try {
      for (const { runtime, peer, events } of cases) {
        react(runtime, peer, "clap");
        expect(events.filter((event) => event.type === "interaction.reaction").map((event) => event.userId)).toEqual(["user-maya"]);
      }
    } finally {
      for (const { runtime } of cases) runtime.stop();
    }
  });
});
