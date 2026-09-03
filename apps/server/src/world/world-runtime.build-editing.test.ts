import type { ClientCommand, ServerEvent } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

describe("WorldRuntime build editing", () => {
  it("merges adjacent walls into a continuous segment", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [
      { id: "first", start: { x: 96, y: 96 }, end: { x: 128, y: 96 } },
      { id: "second", start: { x: 128, y: 96 }, end: { x: 160, y: 96 } },
    ];
    layout.openings = [];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "extend-wall",
      baseRevision: layout.revision,
      edit: { tool: "wall", start: { x: 160, y: 96 }, end: { x: 192, y: 96 } },
    });

    expect(commandError(events, "extend-wall")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.walls).toEqual([{
      id: "first",
      start: { x: 96, y: 96 },
      end: { x: 192, y: 96 },
    }]);
    runtime.stop();
  });

  it("replaces an overlapping door with a window", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [{ id: "wall", start: { x: 96, y: 96 }, end: { x: 320, y: 96 } }];
    layout.openings = [{ id: "door", wallId: "wall", offset: 64, width: 64, type: "door" }];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "replace-opening",
      baseRevision: layout.revision,
      edit: { tool: "window", position: { x: 192, y: 96 } },
    });

    expect(commandError(events, "replace-opening")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.openings).toEqual([
      expect.objectContaining({ wallId: "wall", offset: 64, type: "window" }),
    ]);

    const opening = store.getLayout("floor-studio")!.openings[0]!;
    send(runtime, peer, {
      type: "layout.apply",
      requestId: "move-opening",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "opening.move", openingId: opening.id, position: { x: 224, y: 96 } },
    });
    expect(commandError(events, "move-opening")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.openings).toContainEqual(expect.objectContaining({
      id: opening.id,
      wallId: "wall",
      offset: 96,
      type: "window",
    }));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "remove-opening",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "item.remove", item: { type: "opening", id: opening.id } },
    });
    expect(commandError(events, "remove-opening")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.openings).toEqual([]);
    runtime.stop();
  });

  it("moves and rotates a selected wall with its opening", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [{ id: "wall", start: { x: 96, y: 96 }, end: { x: 224, y: 96 } }];
    layout.openings = [{ id: "door", wallId: "wall", offset: 32, width: 64, type: "door" }];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "move-wall",
      baseRevision: layout.revision,
      edit: { tool: "wall.move", wallId: "wall", start: { x: 352, y: 96 }, end: { x: 352, y: 224 } },
    });

    expect(commandError(events, "move-wall")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.walls).toContainEqual({
      id: "wall",
      start: { x: 352, y: 96 },
      end: { x: 352, y: 224 },
    });
    expect(store.getLayout("floor-studio")?.openings).toContainEqual(expect.objectContaining({
      id: "door",
      wallId: "wall",
      offset: 32,
    }));
    runtime.stop();
  });

  it("places, moves, rotates, and removes an outdoor asset", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [];
    layout.openings = [];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "place-pool",
      baseRevision: layout.revision,
      edit: { tool: "asset", assetId: "outdoor-pool", variantId: "coastal", rotation: 0, position: { x: -256, y: 64 } },
    });
    const placed = store.getLayout("floor-studio")?.objects.find((object) => object.assetId === "outdoor-pool");
    expect(commandError(events, "place-pool")).toBeUndefined();
    expect(placed).toBeDefined();

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "move-pool",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset.move", objectId: placed!.id, position: { x: -224, y: 96 }, variantId: "slate", rotation: 90 },
    });
    expect(commandError(events, "move-pool")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.objects).toContainEqual(expect.objectContaining({
      id: placed!.id,
      x: -224,
      y: 96,
      variantId: "slate",
      rotation: 90,
    }));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "remove-pool",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "item.remove", item: { type: "asset", id: placed!.id } },
    });
    expect(commandError(events, "remove-pool")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.objects).toEqual([]);
    runtime.stop();
  });

  it("places Tetris through build editing", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [];
    layout.openings = [];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "place-tetris",
      baseRevision: layout.revision,
      edit: { tool: "asset", assetId: "equipment-tetris", variantId: "graphite", rotation: 0, position: { x: 1088, y: 576 } },
    });

    expect(commandError(events, "place-tetris")).toBeUndefined();
    expect(store.getLayout("floor-studio")?.objects).toContainEqual(expect.objectContaining({
      assetId: "equipment-tetris",
      x: 1088,
      y: 576,
    }));
    runtime.stop();
  });

  it("places themed floor tiles beneath furniture and validates their designs", () => {
    const store = new DemoStore();
    const layout = store.getLayout("floor-studio")!;
    layout.walls = [];
    layout.openings = [];
    layout.objects = [];
    layout.rooms = [];
    const runtime = new WorldRuntime(store);
    const events: ServerEvent[] = [];
    const peer = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "place-grass",
      baseRevision: layout.revision,
      edit: { tool: "asset", assetId: "floor-tile", variantId: "grass", rotation: 0, position: { x: -256, y: 128 } },
    });
    const tile = store.getLayout("floor-studio")!.objects.find((object) => object.assetId === "floor-tile")!;
    expect(tile).toMatchObject({ variantId: "grass", rotation: 0 });

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "place-chair-on-grass",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "chair-office", variantId: "blue", rotation: 90, position: { x: -240, y: 144 } },
    });
    expect(commandError(events, "place-chair-on-grass")).toBeUndefined();

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "change-to-stone",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset.move", objectId: tile.id, variantId: "stone", rotation: 90, position: { x: -256, y: 128 } },
    });
    expect(store.getObject(tile.id)).toMatchObject({ variantId: "stone", rotation: 90 });

    send(runtime, peer, {
      type: "layout.apply",
      requestId: "invalid-surface",
      baseRevision: store.getLayout("floor-studio")!.revision,
      edit: { tool: "asset", assetId: "floor-tile", variantId: "lava", rotation: 0, position: { x: -160, y: 128 } },
    });
    expect(commandError(events, "invalid-surface")).toMatchObject({ code: "ASSET_VARIANT_NOT_FOUND" });
    runtime.stop();
  });
});

function send(runtime: WorldRuntime, peerId: string, command: ClientCommand): void {
  runtime.handleCommand(peerId, command);
}

function commandError(events: ServerEvent[], requestId: string): ServerEvent | undefined {
  return events.find((event) => event.type === "command.error" && event.requestId === requestId);
}
