import { type ServerEvent, type Wall, type WallOpening } from "@workhard/shared";
import { describe, expect, it } from "vitest";
import { DemoStore } from "../store.js";
import { WorldRuntime } from "./world-runtime.js";

interface EditorSession {
  store: DemoStore;
  runtime: WorldRuntime;
  peerId: string;
  events: ServerEvent[];
}

function createEditorSession(walls: Wall[], openings: WallOpening[] = []): EditorSession {
  const store = new DemoStore();
  const layout = store.getLayout("floor-studio");
  if (!layout) {
    throw new Error("Test floor is missing");
  }
  layout.walls = structuredClone(walls);
  layout.openings = structuredClone(openings);
  layout.objects = [];
  layout.rooms = [];

  const runtime = new WorldRuntime(store);
  const events: ServerEvent[] = [];
  const peerId = runtime.connect("user-maya", "floor-studio", (event) => events.push(event));
  return { store, runtime, peerId, events };
}

function erase(session: EditorSession, x: number, y: number): void {
  const revision = session.store.getLayout("floor-studio")?.revision ?? 0;
  session.runtime.handleCommand(session.peerId, {
    type: "layout.apply",
    requestId: `erase-${x}-${y}`,
    baseRevision: revision,
    edit: { tool: "erase", position: { x, y } },
  });
}

describe("wall erasing at intersections", () => {
  const horizontal: Wall = {
    id: "horizontal",
    start: { x: 320, y: 448 },
    end: { x: 480, y: 448 },
  };
  const vertical: Wall = {
    id: "vertical",
    start: { x: 320, y: 160 },
    end: { x: 320, y: 736 },
  };

  it.each([
    {
      side: "above",
      position: { x: 320, y: 256 },
      retained: { id: "vertical", start: { x: 320, y: 448 }, end: { x: 320, y: 736 } },
    },
    {
      side: "below",
      position: { x: 320, y: 640 },
      retained: { id: "vertical", start: { x: 320, y: 160 }, end: { x: 320, y: 448 } },
    },
  ])("erases only the vertical section $side the crossing", ({ position, retained }) => {
    const session = createEditorSession([horizontal, vertical]);

    erase(session, position.x, position.y);

    expect(session.events.some((event) => event.type === "command.error")).toBe(false);
    expect(session.store.getLayout("floor-studio")?.walls).toEqual([horizontal, retained]);
    session.runtime.stop();
  });

  it("uses the crossing as a boundary for horizontal walls", () => {
    const verticalJunction: Wall = {
      id: "vertical-junction",
      start: { x: 448, y: 320 },
      end: { x: 448, y: 480 },
    };
    const longHorizontal: Wall = {
      id: "long-horizontal",
      start: { x: 96, y: 320 },
      end: { x: 800, y: 320 },
    };
    const session = createEditorSession([verticalJunction, longHorizontal]);

    erase(session, 256, 320);

    expect(session.store.getLayout("floor-studio")?.walls).toEqual([
      verticalJunction,
      { id: "long-horizontal", start: { x: 448, y: 320 }, end: { x: 800, y: 320 } },
    ]);
    session.runtime.stop();
  });

  it("preserves both outer sections and their openings when erasing between crossings", () => {
    const upperCrossing: Wall = {
      id: "upper-crossing",
      start: { x: 160, y: 320 },
      end: { x: 480, y: 320 },
    };
    const lowerCrossing: Wall = {
      id: "lower-crossing",
      start: { x: 160, y: 576 },
      end: { x: 480, y: 576 },
    };
    const longVertical: Wall = {
      id: "long-vertical",
      start: { x: 320, y: 96 },
      end: { x: 320, y: 800 },
    };
    const openings: WallOpening[] = [
      { id: "upper-door", wallId: longVertical.id, offset: 64, width: 64, type: "door" },
      { id: "lower-door", wallId: longVertical.id, offset: 544, width: 64, type: "door" },
    ];
    const session = createEditorSession([upperCrossing, lowerCrossing, longVertical], openings);

    erase(session, 320, 448);

    const saved = session.store.getLayout("floor-studio");
    const retainedVerticals = saved?.walls.filter((wall) => wall.start.x === 320 && wall.end.x === 320) ?? [];
    const lowerVertical = retainedVerticals.find((wall) => wall.start.y === 576);
    expect(saved?.walls).toEqual([
      upperCrossing,
      lowerCrossing,
      { id: "long-vertical", start: { x: 320, y: 96 }, end: { x: 320, y: 320 } },
      { id: expect.any(String), start: { x: 320, y: 576 }, end: { x: 320, y: 800 } },
    ]);
    expect(saved?.openings).toEqual([
      { id: "upper-door", wallId: "long-vertical", offset: 64, width: 64, type: "door" },
      { id: "lower-door", wallId: lowerVertical?.id, offset: 64, width: 64, type: "door" },
    ]);
    session.runtime.stop();
  });
});
