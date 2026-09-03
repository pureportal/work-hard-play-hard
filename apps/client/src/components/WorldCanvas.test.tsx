import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getOutdoorBounds, type Floor, type FloorLayout, type Member, type WorldPlayer } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldCanvas, type WorldCanvasProps } from "./WorldCanvas";

const pixiState = vi.hoisted(() => ({ applications: [] as unknown[] }));

vi.mock("pixi.js", async (importOriginal) => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    globalCompositeOperation: "source-over",
    getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  const pixi = await importOriginal<typeof import("pixi.js")>();

  class Application {
    readonly stage = new pixi.Container();
    readonly canvas = document.createElement("canvas");
    readonly screen = { width: 800, height: 600 };
    readonly ticker = {
      callback: undefined as (() => void) | undefined,
      add: (callback: () => void) => {
        this.ticker.callback = callback;
      },
      remove: (callback: () => void) => {
        if (this.ticker.callback === callback) {
          this.ticker.callback = undefined;
        }
      },
    };
    private readonly capturedPointers = new Set<number>();

    constructor() {
      this.canvas.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        right: 800,
        bottom: 600,
        left: 0,
        width: 800,
        height: 600,
        toJSON: () => undefined,
      });
      this.canvas.setPointerCapture = (pointerId) => this.capturedPointers.add(pointerId);
      this.canvas.hasPointerCapture = (pointerId) => this.capturedPointers.has(pointerId);
      this.canvas.releasePointerCapture = (pointerId) => this.capturedPointers.delete(pointerId);
      pixiState.applications.push(this);
    }

    async init(): Promise<void> {}

    destroy(): void {}
  }

  return { ...pixi, Application };
});

beforeEach(() => {
  pixiState.applications.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("WorldCanvas camera", () => {
  it.each([
    { name: "normal mode", editing: false, editingTool: null },
    { name: "build select mode", editing: true, editingTool: null },
    { name: "wall tool mode", editing: true, editingTool: "wall" as const },
    { name: "door tool mode", editing: true, editingTool: "door" as const },
    { name: "window tool mode", editing: true, editingTool: "window" as const },
    { name: "asset tool mode", editing: true, editingTool: "asset" as const },
    { name: "erase tool mode", editing: true, editingTool: "erase" as const },
  ])("pans with the left mouse button in $name", async ({ editing, editingTool }) => {
    const onDestination = vi.fn();
    const onEdit = vi.fn();
    const onBuildItemSelect = vi.fn();
    const { container } = render(
      <WorldCanvas
        {...createProps()}
        editing={editing}
        editingTool={editingTool}
        onDestination={onDestination}
        onEdit={onEdit}
        onBuildItemSelect={onBuildItemSelect}
      />,
    );
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100);
    dispatchPointer(canvas, "pointermove", 132, 118);
    dispatchPointer(canvas, "pointerup", 132, 118);

    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
    expect(onDestination).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onBuildItemSelect).not.toHaveBeenCalled();
  });

  it.each([
    { name: "normal mode", editing: false, editingTool: null },
    { name: "build select mode", editing: true, editingTool: null },
    { name: "wall tool mode", editing: true, editingTool: "wall" as const },
    { name: "door tool mode", editing: true, editingTool: "door" as const },
    { name: "window tool mode", editing: true, editingTool: "window" as const },
    { name: "asset tool mode", editing: true, editingTool: "asset" as const },
    { name: "erase tool mode", editing: true, editingTool: "erase" as const },
  ])("pans with one finger in $name", async ({ editing, editingTool }) => {
    const onDestination = vi.fn();
    const onEdit = vi.fn();
    const onBuildItemSelect = vi.fn();
    const { container } = render(
      <WorldCanvas
        {...createProps()}
        editing={editing}
        editingTool={editingTool}
        onDestination={onDestination}
        onEdit={onEdit}
        onBuildItemSelect={onBuildItemSelect}
      />,
    );
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100, { pointerType: "touch" });
    dispatchPointer(canvas, "pointermove", 132, 118, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", 132, 118, { pointerType: "touch" });

    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
    expect(onDestination).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onBuildItemSelect).not.toHaveBeenCalled();
  });

  it("keeps a left click as a movement action", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 200, 200);
    dispatchPointer(canvas, "pointerup", 200, 200);

    expect(onDestination).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("keeps a short pointer wobble as a click", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 200, 200);
    dispatchPointer(canvas, "pointermove", 205, 203);
    dispatchPointer(canvas, "pointerup", 205, 203);

    expect(onDestination).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("handles a drag represented only by down and up events", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100);
    dispatchPointer(canvas, "pointerup", 140, 100);

    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
    expect(onDestination).not.toHaveBeenCalled();
  });

  it("uses a touch tap as a movement action", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 200, 200, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", 200, 200, { pointerType: "touch" });

    expect(onDestination).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("previews touch asset placement until it is confirmed", async () => {
    const onEdit = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} editing editingTool="asset" onEdit={onEdit} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 600, 400, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", 600, 400, { pointerType: "touch" });

    const confirm = await screen.findByRole("button", { name: "Place" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.click(confirm);

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it.each(["mouse", "touch"] as const)("creates walls with two %s endpoint taps while reserving drag for the camera", async (pointerType) => {
    const onEdit = vi.fn();
    const { container } = render(
      <WorldCanvas {...createProps()} editing editingTool="wall" onEdit={onEdit} />,
    );
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 200, 200, { pointerType });
    dispatchPointer(canvas, "pointerup", 200, 200, { pointerType });
    dispatchPointer(canvas, "pointermove", 264, 200, { pointerType });
    expect(onEdit).not.toHaveBeenCalled();

    dispatchPointer(canvas, "pointerdown", 264, 200, { pointerType });
    dispatchPointer(canvas, "pointerup", 264, 200, { pointerType });

    expect(onEdit).toHaveBeenCalledWith({
      tool: "wall",
      start: { x: 256, y: 256 },
      end: { x: 352, y: 256 },
    });
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("keeps middle-button panning available", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100, { button: 1 });
    dispatchPointer(canvas, "pointermove", 130, 120, { button: 1 });
    dispatchPointer(canvas, "pointerup", 130, 120, { button: 1 });

    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
    expect(onDestination).not.toHaveBeenCalled();
  });

  it("ignores unsupported mouse buttons", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100, { button: 2 });
    dispatchPointer(canvas, "pointermove", 140, 100, { button: 2 });
    dispatchPointer(canvas, "pointerup", 140, 100, { button: 2 });

    expect(onDestination).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });

  it("keeps the camera fixed in Free mode and follows the player again after Follow", async () => {
    const props = createProps();
    const { container, rerender } = render(<WorldCanvas {...props} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);

    dispatchPointer(canvas, "pointerdown", 100, 100);
    dispatchPointer(canvas, "pointermove", 140, 100);
    dispatchPointer(canvas, "pointerup", 140, 100);
    runFrames(application, 100);
    const freePosition = getWorldX(application);

    rerender(<WorldCanvas {...props} players={[{ ...props.players[0]!, x: 400 }]} />);
    runFrames(application, 100);
    expect(getWorldX(application)).toBeCloseTo(freePosition, 4);

    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Follow" })).toBeNull());
    runFrames(application, 100);
    expect(getWorldX(application)).not.toBeCloseTo(freePosition, 1);
  });

  it("pinch-zooms without triggering a click or build action", async () => {
    const onDestination = vi.fn();
    const onEdit = vi.fn();
    const { container } = render(
      <WorldCanvas {...createProps()} editing editingTool="erase" onDestination={onDestination} onEdit={onEdit} />,
    );
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    const initialZoom = getWorldScale(application);

    dispatchPointer(canvas, "pointerdown", 300, 300, { pointerId: 1, pointerType: "touch" });
    dispatchPointer(canvas, "pointerdown", 500, 300, { pointerId: 2, pointerType: "touch", isPrimary: false });
    dispatchPointer(canvas, "pointermove", 600, 300, { pointerId: 2, pointerType: "touch", isPrimary: false });
    dispatchPointer(canvas, "pointerup", 300, 300, { pointerId: 1, pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", 600, 300, { pointerId: 2, pointerType: "touch", isPrimary: false });

    expect(getWorldScale(application)).toBeGreaterThan(initialZoom);
    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
    expect(onDestination).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps the world point under the mouse fixed while wheel-zooming", async () => {
    const { container } = render(<WorldCanvas {...createProps()} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    dispatchPointer(canvas, "pointerdown", 100, 100);
    dispatchPointer(canvas, "pointermove", 140, 100);
    dispatchPointer(canvas, "pointerup", 140, 100);
    const pointer = { x: 620, y: 380 };
    const before = getWorldPoint(application, pointer.x, pointer.y);

    fireEvent.wheel(canvas, { clientX: pointer.x, clientY: pointer.y, deltaY: -120, deltaMode: 0 });

    const after = getWorldPoint(application, pointer.x, pointer.y);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
  });

  it("keeps following the player when wheel zoom does not pan the camera", async () => {
    const props = createProps();
    const { container, rerender } = render(<WorldCanvas {...props} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    const beforeMove = getWorldX(application);

    fireEvent.wheel(canvas, { clientX: 620, clientY: 380, deltaY: -120, deltaMode: 0 });
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();

    rerender(<WorldCanvas {...props} players={[{ ...props.players[0]!, x: 400 }]} />);
    runFrames(application, 100);
    expect(getWorldX(application)).not.toBeCloseTo(beforeMove, 1);
  });

  it("ignores a zero wheel delta and clamps wheel zoom", async () => {
    const { container } = render(<WorldCanvas {...createProps()} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    const initialZoom = getWorldScale(application);

    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 0 });
    expect(getWorldScale(application)).toBe(initialZoom);
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();

    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 1_000_000 });
    expect(getWorldScale(application)).toBe(0.5);
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: -1_000_000 });
    expect(getWorldScale(application)).toBe(1.45);
  });

  it("keeps the rendered outdoor map inside the viewport while panning", async () => {
    const { container } = render(<WorldCanvas {...createProps()} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    const bounds = getOutdoorBounds(floor);
    runFrames(application, 100);

    dispatchPointer(canvas, "pointerdown", 400, 300);
    dispatchPointer(canvas, "pointermove", 5_000, 5_000);
    dispatchPointer(canvas, "pointerup", 5_000, 5_000);

    expect(getWorldX(application) + bounds.x * getWorldScale(application)).toBeGreaterThanOrEqual(-0.001);
    expect(getWorldY(application) + bounds.y * getWorldScale(application)).toBeGreaterThanOrEqual(-0.001);

    dispatchPointer(canvas, "pointerdown", 400, 300);
    dispatchPointer(canvas, "pointermove", -5_000, -5_000);
    dispatchPointer(canvas, "pointerup", -5_000, -5_000);

    expect(getWorldX(application) + (bounds.x + bounds.width) * getWorldScale(application)).toBeLessThanOrEqual(800.001);
    expect(getWorldY(application) + (bounds.y + bounds.height) * getWorldScale(application)).toBeLessThanOrEqual(600.001);
  });

  it("maps pointer coordinates through the canvas CSS scale", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    canvas.getBoundingClientRect = () => createRect(400, 300);

    dispatchPointer(canvas, "pointerdown", 200, 150);
    dispatchPointer(canvas, "pointerup", 200, 150);

    expect(onDestination).toHaveBeenCalledOnce();
    expect(onDestination.mock.calls[0]![0]).toBeCloseTo(player.x, 3);
    expect(onDestination.mock.calls[0]![1]).toBeCloseTo(player.y, 3);
  });

  it("uses a touch-sized target for players at minimum zoom", async () => {
    const onPlayerSelect = vi.fn();
    const otherMember: Member = { ...member, id: "other", name: "Other Player", email: "other@example.com" };
    const otherPlayer: WorldPlayer = { ...player, userId: otherMember.id, x: 300 };
    const { container } = render(
      <WorldCanvas
        {...createProps()}
        members={[member, otherMember]}
        players={[player, otherPlayer]}
        onPlayerSelect={onPlayerSelect}
      />,
    );
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY: 1_000_000 });
    const playerScreen = getScreenPoint(application, otherPlayer.x, otherPlayer.y);

    dispatchPointer(canvas, "pointerdown", playerScreen.x + 21, playerScreen.y, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", playerScreen.x + 21, playerScreen.y, { pointerType: "touch" });

    expect(onPlayerSelect).toHaveBeenCalledWith(otherPlayer.userId, expect.any(Object));
  });

  it("uses touch-sized targets when selecting build items", async () => {
    const onBuildItemSelect = vi.fn();
    const buildLayout: FloorLayout = {
      ...layout,
      walls: [{ id: "wall", start: { x: 96, y: 288 }, end: { x: 512, y: 288 } }],
    };
    const { container } = render(
      <WorldCanvas
        {...createProps()}
        layout={buildLayout}
        editing
        onBuildItemSelect={onBuildItemSelect}
      />,
    );
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    const target = getScreenPoint(application, 288, 313);

    dispatchPointer(canvas, "pointerdown", target.x, target.y, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", target.x, target.y, { pointerType: "touch" });

    expect(onBuildItemSelect).toHaveBeenCalledWith({ type: "wall", id: "wall" });
  });

  it("aligns a near-wall touch when placing an opening", async () => {
    const onEdit = vi.fn();
    const buildLayout: FloorLayout = {
      ...layout,
      walls: [{ id: "wall", start: { x: 96, y: 288 }, end: { x: 512, y: 288 } }],
    };
    const { container } = render(
      <WorldCanvas
        {...createProps()}
        layout={buildLayout}
        editing
        editingTool="door"
        onEdit={onEdit}
      />,
    );
    const canvas = await findCanvas(container);
    const application = getApplication();
    runFrames(application, 100);
    const target = getScreenPoint(application, 288, 313);

    dispatchPointer(canvas, "pointerdown", target.x, target.y, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", target.x, target.y, { pointerType: "touch" });

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit.mock.calls[0]![0]).toMatchObject({ tool: "door" });
    expect((onEdit.mock.calls[0]![0] as { position: { y: number } }).position.y).toBe(288);
  });

  it("focuses the world application when a pointer interaction begins", async () => {
    const { container } = render(<WorldCanvas {...createProps()} />);
    const canvas = await findCanvas(container);
    const worldApplication = container.querySelector<HTMLElement>(".world-canvas");

    dispatchPointer(canvas, "pointerdown", 100, 100);

    expect(document.activeElement).toBe(worldApplication);
    dispatchPointer(canvas, "pointerup", 100, 100);
  });

  it("recovers after pointer capture is lost", async () => {
    const onDestination = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} onDestination={onDestination} />);
    const canvas = await findCanvas(container);

    dispatchPointer(canvas, "pointerdown", 100, 100);
    dispatchPointer(canvas, "lostpointercapture", 100, 100);
    dispatchPointer(canvas, "pointerup", 100, 100);
    expect(onDestination).not.toHaveBeenCalled();

    dispatchPointer(canvas, "pointerdown", 200, 200, { pointerId: 2 });
    dispatchPointer(canvas, "pointerup", 200, 200, { pointerId: 2 });
    expect(onDestination).toHaveBeenCalledOnce();
  });
});

function createProps(): WorldCanvasProps {
  return {
    floor,
    layout,
    members: [member],
    meetings: [],
    players: [player],
    reactions: [],
    highFives: [],
    gongRings: [],
    currentUserId: player.userId,
    editingTool: null,
    editingAssetId: "chair-office",
    editingAssetVariantId: "white",
    editingAssetRotation: 0,
    colorTheme: "light",
    editing: false,
    inputEnabled: true,
    onDestination: vi.fn(),
    onPlayerSelect: vi.fn(),
    onEdit: vi.fn(),
    onObjectSelect: vi.fn(),
    onBuildItemSelect: vi.fn(),
    onAssetRotationChange: vi.fn(),
    onPlacementCancel: vi.fn(),
    onGongOffscreen: vi.fn(),
    onDirectionalInput: vi.fn(),
  };
}

async function findCanvas(container: HTMLElement): Promise<HTMLCanvasElement> {
  await waitFor(() => expect(container.querySelector("canvas")).toBeTruthy());
  return container.querySelector("canvas")!;
}

interface PointerOptions {
  pointerId?: number;
  pointerType?: "mouse" | "pen" | "touch";
  button?: number;
  isPrimary?: boolean;
  shiftKey?: boolean;
}

function dispatchPointer(
  canvas: HTMLCanvasElement,
  type: string,
  clientX: number,
  clientY: number,
  options: PointerOptions = {},
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: options.button ?? 0,
    clientX,
    clientY,
    shiftKey: options.shiftKey ?? false,
  });
  Object.defineProperties(event, {
    isPrimary: { value: options.isPrimary ?? true },
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
  });
  canvas.dispatchEvent(event);
}

interface TestApplication {
  stage: { children: Array<{ x: number; y: number; scale: { x: number } }> };
  ticker: { callback?: () => void };
}

function getApplication(): TestApplication {
  return pixiState.applications[0] as TestApplication;
}

function runFrames(application: TestApplication, count: number): void {
  for (let index = 0; index < count; index += 1) {
    application.ticker.callback?.();
  }
}

function getWorldX(application: TestApplication): number {
  return application.stage.children[0]!.x;
}

function getWorldY(application: TestApplication): number {
  return application.stage.children[0]!.y;
}

function getWorldScale(application: TestApplication): number {
  return application.stage.children[0]!.scale.x;
}

function getWorldPoint(application: TestApplication, screenX: number, screenY: number): { x: number; y: number } {
  const scale = getWorldScale(application);
  return {
    x: (screenX - getWorldX(application)) / scale,
    y: (screenY - getWorldY(application)) / scale,
  };
}

function getScreenPoint(application: TestApplication, worldX: number, worldY: number): { x: number; y: number } {
  const scale = getWorldScale(application);
  return {
    x: getWorldX(application) + worldX * scale,
    y: getWorldY(application) + worldY * scale,
  };
}

function createRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    width,
    height,
    toJSON: () => undefined,
  };
}

const floor: Floor = {
  id: "floor",
  officeId: "office",
  name: "Studio",
  level: 1,
  width: 800,
  height: 600,
  spawn: { x: 100, y: 100 },
  background: "#ffffff",
};

const layout: FloorLayout = {
  floorId: floor.id,
  revision: 1,
  walls: [],
  openings: [],
  tiles: [],
  objects: [],
  rooms: [],
};

const member: Member = {
  id: "player",
  name: "Player One",
  initials: "PO",
  email: "player@example.com",
  title: "Developer",
  role: "member",
  permissions: [],
  color: "#6757e8",
  availability: "available",
  online: true,
  floorId: floor.id,
};

const player: WorldPlayer = {
  userId: member.id,
  floorId: floor.id,
  x: 100,
  y: 100,
  facing: "down",
  availability: "available",
  connected: true,
};
