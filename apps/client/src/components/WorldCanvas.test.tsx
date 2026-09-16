import { createOrganisation } from "@workhard/shared";
import { ASSET_ROTATIONS, DEFAULT_CHARACTER_APPEARANCE, getPlacedAssetBounds, getPlacedAssetInteractions, requireAssetDefinition } from "@workhard/shared";
import type { Container, Sprite } from "pixi.js";
import { Graphics } from "pixi.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getOutdoorBounds, type Floor, type FloorLayout, type Member, type WorldPlayer } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorldCanvas, type WorldCanvasProps } from "./WorldCanvas";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { getWorldAssetArtwork, getWorldAssetSurfaceHeight } from "../world-asset-artwork";
import * as characterRenderer from "../character-renderer";
import { MusicIndicator } from "../spotify/music-indicator";
import { CharacterSprite } from "../character-sprite";
import { CHARACTER_ATLAS_SIZE, CHARACTER_ATLAS_HEIGHT } from "@workhard/shared";

const pixiState = vi.hoisted(() => ({ applications: [] as unknown[] }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});

vi.mock("pixi.js", async (importOriginal) => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    globalCompositeOperation: "source-over",
    getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
    measureText: vi.fn((text: string) => ({ width: text.length * 6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: text.length * 6, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 })),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  const pixi = await importOriginal<typeof import("pixi.js")>();

  class Application {
    readonly stage = new pixi.Container();
    readonly canvas = document.createElement("canvas");
    readonly screen = { width: 800, height: 600 };
    readonly ticker = {
      deltaMS: 1000 / 60,
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
  vi.stubGlobal("CanvasRenderingContext2D", class {});
});

afterEach(() => {
  cleanup();
});

describe("WorldCanvas modal input", () => {
  it("stops held movement when a confirmation opens and blocks movement behind it", async () => {
    const onDirectionalInput = vi.fn();
    const props = { ...createProps(), onDirectionalInput };
    const view = (confirming: boolean) => <>
      <WorldCanvas {...props} />
      {confirming && <ConfirmationDialog title="Leave game?" confirmLabel="Leave" onCancel={vi.fn()} onConfirm={vi.fn()} />}
    </>;
    const { container, rerender } = render(view(false));
    const canvas = await findCanvas(container);
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(onDirectionalInput).toHaveBeenLastCalledWith(1, 0, 1);
    rerender(view(true));
    expect(onDirectionalInput).toHaveBeenLastCalledWith(2, 0, 0);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyUp(document.activeElement!, { key: "ArrowDown" });
    expect(onDirectionalInput).toHaveBeenCalledTimes(2);
    rerender(view(false));
    fireEvent.keyDown(canvas, { key: "ArrowDown" });
    expect(onDirectionalInput).toHaveBeenLastCalledWith(3, 0, 1);
  });
});

describe("WorldCanvas start point", () => {
  it.each(["mouse", "touch"] as const)("previews and moves the snapped start point with %s", async (pointerType) => {
    const onEdit = vi.fn();
    const { container } = render(<WorldCanvas {...createProps()} editing editingTool="spawn" onEdit={onEdit} />);
    const canvas = await findCanvas(container);
    const point = getScreenPoint(getApplication(), 325, 314);
    dispatchPointer(canvas, "pointerdown", point.x, point.y, { pointerType });
    dispatchPointer(canvas, "pointerup", point.x, point.y, { pointerType });
    if (pointerType === "touch") {
      expect(onEdit).not.toHaveBeenCalled();
      await waitFor(() => expect((screen.getByRole("button", { name: "Move here" }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    }
    expect(onEdit).toHaveBeenCalledWith({ tool: "spawn", position: { x: 320, y: 320 } });
    expect(screen.queryByRole("button", { name: "Rotate asset clockwise" })).toBeNull();
  });

  it("blocks wall placement and keeps start points unavailable in player asset mode", async () => {
    const onEdit = vi.fn();
    const props = createProps();
    const blocked = { ...props.layout, walls: [{ id: "wall", start: { x: 256, y: 320 }, end: { x: 384, y: 320 } }] };
    const { container, rerender } = render(<WorldCanvas {...props} layout={blocked} editing editingTool="spawn" onEdit={onEdit} />);
    const canvas = await findCanvas(container);
    const point = getScreenPoint(getApplication(), 320, 320);
    dispatchPointer(canvas, "pointerdown", point.x, point.y);
    dispatchPointer(canvas, "pointerup", point.x, point.y);
    expect(onEdit).not.toHaveBeenCalled();
    rerender(<WorldCanvas {...props} editing editingTool="spawn" onEdit={onEdit} playerAssetPlacement={{ userId: "player", organisation: createOrganisation(), officeBuilder: false, settings: { roomAccess: { mode: "open", assignedPersonIds: [] }, roomBuild: { mode: "open", assignedPersonIds: [] } } }} />);
    dispatchPointer(canvas, "pointerdown", point.x, point.y);
    dispatchPointer(canvas, "pointerup", point.x, point.y);
    expect(onEdit).not.toHaveBeenCalled();
  });
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

  it("blocks board placement over a standing player", async () => {
    const props = createProps();
    const onEdit = vi.fn();
    const { container } = render(<WorldCanvas {...props} editing editingTool="asset" editingAssetId="equipment-whiteboard"
      editingAssetVariantId="graphite" onEdit={onEdit} />);
    const canvas = await findCanvas(container);
    const player = props.players[0]!;
    const point = getScreenPoint(getApplication(), player.x, player.y);
    dispatchPointer(canvas, "pointerdown", point.x, point.y, { pointerType: "touch" });
    dispatchPointer(canvas, "pointerup", point.x, point.y, { pointerType: "touch" });
    const confirm = await screen.findByRole("button", { name: "Place" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(onEdit).not.toHaveBeenCalled();
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

describe("WorldCanvas raised asset outlines", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(ASSET_ROTATIONS)("outlines the visible laptop when selecting and moving it at %s degrees", async (rotation) => {
    const desk = { id: "desk", floorId: "floor", assetId: "desk-straight", variantId: "sage", rotation: 0 as const, x: 256, y: 256 };
    const laptop = { ...desk, id: "laptop", assetId: "decor-laptop", variantId: "graphite", rotation, x: 272 };
    const buildLayout = { ...layout, objects: [desk, laptop] };
    const artwork = getWorldAssetArtwork(requireAssetDefinition(laptop.assetId), laptop.variantId, rotation).bounds;
    const offset = -getWorldAssetSurfaceHeight(desk.assetId) / Math.SQRT2;
    const outline = [laptop.x + artwork.x - 1, expect.closeTo(laptop.y + artwork.y + offset - 1), artwork.width + 2, artwork.height + 2];
    const rectangle = vi.spyOn(Graphics.prototype, "rect");
    const circle = vi.spyOn(Graphics.prototype, "circle");
    const props = { ...createProps(), layout: buildLayout, editing: true, players: [], members: [] };
    const { container, rerender } = render(<WorldCanvas {...props} selectedBuildItem={{ type: "asset", id: laptop.id }} />);
    const canvas = await findCanvas(container);
    expect(rectangle.mock.calls).toContainEqual(outline);
    const origin = { x: laptop.x + artwork.x + artwork.width / 2, y: laptop.y + artwork.y + offset + artwork.height / 2 };
    const marker = circle.mock.calls.find(([, , radius]) => radius === 10)!;
    expect(marker).toBeDefined();
    expect(Math.hypot(marker[0] - origin.x, marker[1] - origin.y) * getWorldScale(getApplication())).toBeGreaterThanOrEqual(43.99);
    for (const deltaY of [100_000, -100_000]) {
      circle.mockClear();
      fireEvent.wheel(canvas, { clientX: 400, clientY: 300, deltaY });
      const zoomedMarker = circle.mock.calls.find(([, , radius]) => radius === 10)!;
      expect(zoomedMarker).toBeDefined();
      expect(Math.hypot(zoomedMarker[0] - origin.x, zoomedMarker[1] - origin.y) * getWorldScale(getApplication())).toBeGreaterThanOrEqual(43.99);
    }

    rerender(<WorldCanvas {...props} movingBuildItem={{ type: "asset", id: laptop.id }} editingAssetId={laptop.assetId} editingAssetVariantId={laptop.variantId} editingAssetRotation={rotation} />);
    rectangle.mockClear();
    const footprint = getPlacedAssetBounds(laptop);
    const point = getScreenPoint(getApplication(), footprint.x + footprint.width / 2, footprint.y + footprint.height / 2 + offset);
    dispatchPointer(canvas, "pointermove", point.x, point.y);
    expect(rectangle.mock.calls).toContainEqual(outline);
  });
});

describe("WorldCanvas artwork", () => {
  const object = { id: "artwork-fixture", floorId: "floor", assetId: "storage-credenza", variantId: "ink", rotation: 90 as const, x: 96, y: 64 };
  const artwork = getWorldAssetArtwork(requireAssetDefinition(object.assetId), object.variantId, object.rotation);
  let images: HTMLImageElement[];

  beforeEach(() => {
    images = [];
    vi.stubGlobal("Image", vi.fn(function () {
      const image = document.createElement("img");
      Object.defineProperties(image, {
        naturalWidth: { value: artwork.atlasWidth },
        naturalHeight: { value: artwork.atlasHeight },
      });
      images.push(image);
      return image;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the selected design and rotation at the placed object's origin", async () => {
    const { container } = render(<WorldCanvas {...createProps()} players={[]} members={[]} layout={{ ...layout, objects: [object] }} />);
    await findCanvas(container);
    expect(images).toHaveLength(1);
    expect(images[0]!.getAttribute("src")).toBe("/world-assets/storage-credenza/ink.png");
    images[0]!.dispatchEvent(new Event("load"));
    const placed = getApplication().stage.getChildByLabel("world-asset:artwork-fixture", true)!;
    const body = placed.getChildByLabel("artwork")!;
    const sprite = body.children[1] as Sprite;
    await waitFor(() => expect(sprite.visible).toBe(true));
    expect([placed.x, placed.y]).toEqual([96, 64]);
    expect(sprite.texture.frame.x).toBe(artwork.frame.x);
    expect(sprite.width).toBeCloseTo(artwork.bounds.width);
    expect(sprite.height).toBeCloseTo(artwork.bounds.height);
  });

  it("offers recovery when an artwork file fails to load", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<WorldCanvas {...createProps()} players={[]} members={[]} layout={{ ...layout, objects: [object] }} />);
    await findCanvas(container);
    images[0]!.dispatchEvent(new Event("error"));
    expect((await screen.findByRole("alert")).textContent).toContain("Artwork could not load.");
    expect(screen.getByText("Artwork could not load.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(errorLog).toHaveBeenCalled();
  });

  it("offers recovery when a character atlas fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(characterRenderer, "renderCharacter").mockRejectedValueOnce(new Error("Character could not load. Try again."));
    render(<WorldCanvas {...createProps()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Artwork could not load.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });

  it("ignores failed artwork for an appearance that has been replaced", async () => {
    let rejectAppearance!: (error: Error) => void;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const renderCharacter = vi.spyOn(characterRenderer, "renderCharacter")
      .mockImplementation(() => new Promise(() => undefined))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectAppearance = reject; }));
    const { container, rerender } = render(<WorldCanvas {...createProps()} />);
    await findCanvas(container);
    rerender(<WorldCanvas {...createProps()} members={[{ ...member, character: { ...member.character, hairstyle: "spiky" } }]} />);
    await waitFor(() => expect(renderCharacter).toHaveBeenCalledTimes(2));
    rejectAppearance(new Error("Old appearance failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps decorations with their supporting furniture and ground art below the depth layer", async () => {
    const objects = [
      { ...object, id: "near", y: 144, rotation: 0 as const },
      { ...object, id: "surface", assetId: "decor-coffee", variantId: "graphite", y: 64, rotation: 0 as const },
      { ...object, id: "back", assetId: "desk-straight", variantId: "sage", y: 64, rotation: 0 as const },
      { ...object, id: "ground", assetId: "rug-round", variantId: "oak", y: 144 },
    ];
    const { container } = render(<WorldCanvas {...createProps()} players={[]} members={[]} layout={{ ...layout, objects }} />);
    await findCanvas(container);
    const placed = getApplication().stage.getChildByLabel("world-asset:near", true)!;
    const order = placed.parent!.children.filter((child) => child.label.startsWith("world-asset:")).map((child) => child.label);
    expect(order).toEqual(["world-asset:back", "world-asset:surface", "world-asset:near"]);
    const ground = getApplication().stage.getChildByLabel("world-asset:ground", true)!;
    const world = placed.parent!.parent!;
    expect(world.getChildIndex(ground.parent!)).toBeLessThan(world.getChildIndex(placed.parent!));
  });
});

describe("WorldCanvas Spotify indicators", () => {
  it("keeps matching avatars renderable when one leaves during account connection", () => {
    const atlas = document.createElement("canvas");
    atlas.width = CHARACTER_ATLAS_SIZE;
    atlas.height = CHARACTER_ATLAS_HEIGHT;
    const leaving = new CharacterSprite(atlas);
    const remaining = new CharacterSprite(atlas);
    leaving.sprite.destroy();
    remaining.update(1000, "idle", "down");
    expect(remaining.sprite.texture.source.destroyed).toBe(false);
    expect(remaining.sprite.texture.source.style).toBeTruthy();
    remaining.sprite.destroy();
  });

  it("attaches listening notes to the player and removes them when sharing stops", async () => {
    const activity = {
      userId: player.userId, trackId: "4iV5W9uYEdYUVa79Axb7Rh", title: "Test song", artist: "Test artist",
      album: "Test album", artworkUrl: null, trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
      expiresAt: Date.now() + 30_000, jamUrl: null,
    };
    const { container, rerender } = render(<WorldCanvas {...createProps()} listeningActivities={{ [player.userId]: activity }} />);
    await findCanvas(container);
    const application = getApplication();
    runFrames(application, 1);
    const avatar = application.stage.getChildByLabel(`world-player:${player.userId}`, true)!;
    const notes = avatar.getChildByLabel("spotify-notes")!;
    expect(notes.visible).toBe(true);
    rerender(<WorldCanvas {...createProps()} listeningActivities={{}} />);
    runFrames(application, 1);
    expect(notes.visible).toBe(false);
  });

  it("animates notes over the head, honors reduced motion and clears expired or reacting indicators", () => {
    const notes = new MusicIndicator();
    notes.update(1000, 5000, -48, false, false);
    expect(notes.container.visible).toBe(true);
    expect(notes.container.y).toBe(-62);
    const positions = notes.container.children.map((note) => note.y);
    notes.update(1500, 5000, -38, false, false);
    expect(notes.container.children.map((note) => note.y)).not.toEqual(positions);
    expect(notes.container.y).toBe(-52);
    notes.update(1600, 5000, -48, true, false);
    expect(notes.container.children.every((note) => note.y === 0 && note.rotation === 0)).toBe(true);
    notes.update(1700, 5000, -48, false, true);
    expect(notes.container.visible).toBe(false);
    notes.update(5000, 5000, -48, false, false);
    expect(notes.container.visible).toBe(false);
    notes.container.destroy({ children: true });
  });
});

describe("WorldCanvas depth", () => {
  const rearMember = { ...member, id: "rear", name: "Rear Player" };
  const rearPlayer = { ...player, userId: rearMember.id, y: 64 };

  function drawOrder(): string[] {
    return getApplication().stage.getChildByLabel("world-depth", true)!.children.map((child) => child.label);
  }

  it("draws overlapping avatars by their feet and updates order at the interpolated crossing", async () => {
    const props = { ...createProps(), members: [member, rearMember], players: [player, rearPlayer] };
    const { container, rerender } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    expect(drawOrder()).toEqual(["world-player:rear", "world-player:player"]);

    rerender(<WorldCanvas {...props} players={[{ ...player, y: 0 }, rearPlayer]} />);
    runFrames(getApplication(), 1);
    expect(drawOrder()).toEqual(["world-player:rear", "world-player:player"]);
    runFrames(getApplication(), 20);
    expect(drawOrder()).toEqual(["world-player:player", "world-player:rear"]);

    rerender(<WorldCanvas {...props} players={[rearPlayer, { ...player, y: 0 }]} />);
    expect(drawOrder()).toEqual(["world-player:player", "world-player:rear"]);
  });

  it("breaks equal-depth ties consistently across joining and snapshot order", async () => {
    const coincident = { ...rearPlayer, x: player.x, y: player.y };
    const props = { ...createProps(), members: [member, rearMember], players: [coincident, player] };
    const { container, rerender } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    expect(drawOrder()).toEqual(["world-player:player", "world-player:rear"]);
    rerender(<WorldCanvas {...props} players={[player]} />);
    expect(drawOrder()).toEqual(["world-player:player"]);
    rerender(<WorldCanvas {...props} players={[player, coincident]} />);
    expect(drawOrder()).toEqual(["world-player:player", "world-player:rear"]);
  });

  it.each(ASSET_ROTATIONS)("walks behind and in front of a desk rotated %s degrees", async (rotation) => {
    const object = { id: "desk", floorId: floor.id, assetId: "desk-straight", variantId: "sage", rotation, x: 64, y: 64 };
    const bounds = getPlacedAssetBounds(object);
    const back = { ...player, x: bounds.x + bounds.width / 2, y: bounds.y - 12 };
    const front = { ...back, y: bounds.y + bounds.height + 12 };
    const props = { ...createProps(), players: [back], layout: { ...layout, objects: [object] } };
    const { container, rerender } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    expect(drawOrder()).toEqual(["world-player:player", "world-asset:desk"]);
    rerender(<WorldCanvas {...props} players={[front]} />);
    runFrames(getApplication(), 1);
    expect(drawOrder()).toEqual(["world-player:player", "world-asset:desk"]);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-asset:desk", "world-player:player"]);
    rerender(<WorldCanvas {...props} />);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-player:player", "world-asset:desk"]);
  });

  it.each(ASSET_ROTATIONS)("orders a chair and its occupant from the rotated seat at %s degrees", async (rotation) => {
    const chair = { id: "chair", floorId: floor.id, assetId: "chair-office", variantId: "white", rotation, x: 96, y: 64 };
    const interaction = getPlacedAssetInteractions(chair)[0]!;
    const seated = { ...player, ...interaction.center, facing: "down" as const, seat: { objectId: chair.id, interactionId: interaction.id } };
    const props = { ...createProps(), layout: { ...layout, objects: [chair] }, members: [member, rearMember], players: [seated, { ...rearPlayer, y: 100 }] };
    const { container, rerender } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    const seatedOrder = rotation === 180
      ? ["world-player:player", "world-asset:chair"]
      : ["world-asset:chair", "world-player:player"];
    expect(drawOrder()).toEqual([...seatedOrder, "world-player:rear"]);
    const playerView = getApplication().stage.getChildByLabel("world-player:player", true)!;
    expect([playerView.x, playerView.y]).toEqual([interaction.center.x, interaction.center.y]);

    rerender(<WorldCanvas {...props} colorTheme="dark" />);
    expect(drawOrder()).toEqual([...seatedOrder, "world-player:rear"]);
    expect(getApplication().stage.getChildByLabel("world-player:player", true)).toBe(playerView);

    rerender(<WorldCanvas {...props} players={[{ ...player, x: interaction.center.x, y: 120 }, rearPlayer]} />);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-player:rear", "world-asset:chair", "world-player:player"]);
  });

  it("uses the individual seat direction on a corner sofa", async () => {
    const sofa = { id: "sofa", floorId: floor.id, assetId: "sofa-corner", variantId: "white", rotation: 90 as const, x: 96, y: 64 };
    const interaction = getPlacedAssetInteractions(sofa).find((seat) => seat.direction === "up")!;
    const props = { ...createProps(), layout: { ...layout, objects: [sofa] }, players: [{ ...player, ...interaction.center, seat: { objectId: sofa.id, interactionId: interaction.id } }] };
    const { container } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    expect(drawOrder()).toEqual(["world-player:player", "world-asset:sofa"]);
  });

  it("keeps carried players at the carrier's depth instead of the raised sprite position", async () => {
    const carriedMember = { ...member, id: "carried", name: "Carried Player" };
    const carried = { ...player, userId: carriedMember.id, carriedByUserId: player.userId };
    const props = { ...createProps(), members: [member, rearMember, carriedMember], players: [carried, player, rearPlayer] };
    const { container, rerender } = render(<WorldCanvas {...props} />);
    await findCanvas(container);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-player:rear", "world-player:carried", "world-player:player"]);
    rerender(<WorldCanvas {...props} players={[carried, { ...player, y: 32 }, rearPlayer]} />);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-player:carried", "world-player:player", "world-player:rear"]);
    rerender(<WorldCanvas {...props} players={[carried, rearPlayer]} />);
    runFrames(getApplication(), 50);
    expect(drawOrder()).toEqual(["world-player:rear", "world-player:carried"]);
  });
});

describe("world keyboard focus", () => {
  it("leaves arrow keys available to scroll focused interface content", async () => {
    const onDirectionalInput = vi.fn();
    const { container } = render(<>
      <WorldCanvas {...createProps()} onDirectionalInput={onDirectionalInput} />
      <aside><div tabIndex={0} aria-label="Scrollable content" /></aside>
    </>);
    const canvas = await findCanvas(container);
    const scrollArea = screen.getByLabelText("Scrollable content");
    scrollArea.focus();
    expect(fireEvent.keyDown(scrollArea, { key: "ArrowDown" })).toBe(true);
    expect(onDirectionalInput).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(canvas, { key: "ArrowDown" })).toBe(false);
    expect(onDirectionalInput).toHaveBeenLastCalledWith(1, 0, 1);
    fireEvent.keyUp(canvas, { key: "ArrowDown" });
    expect(onDirectionalInput).toHaveBeenLastCalledWith(2, 0, 0);
  });
});

function createProps(): WorldCanvasProps {
  return {
    floor,
    layout,
    members: [member],
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
  stage: Container;
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
  initials: "PO", character: { ...DEFAULT_CHARACTER_APPEARANCE },
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
