import { StrictMode, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, type GameGuideState } from "@workhard/shared";
import { fetchGameGuideState, saveGameGuideStatus } from "../../api";
import { createTestEconomy, createTestGameSettings } from "../../test-fixtures";
import { GameGuide } from "./GameGuide";

vi.mock("../../api", () => ({ fetchGameGuideState: vi.fn(), saveGameGuideStatus: vi.fn() }));
vi.mock("react-joyride", () => ({
  EVENTS: { TOUR_END: "tour:end", TARGET_NOT_FOUND: "error:target_not_found", ERROR: "error" },
  Joyride: ({ onEvent }: { onEvent: (event: { type: string; status?: string }) => void }) => <div role="dialog" aria-label="Guide">
    <button onClick={() => onEvent({ type: "tour:end", status: "skipped" })}>Skip guide</button>
    <button onClick={() => onEvent({ type: "tour:end", status: "finished" })}>Finish guide</button>
    <button onClick={() => onEvent({ type: "error:target_not_found" })}>Missing target</button>
  </div>,
}));

function fixture(): ComponentProps<typeof GameGuide> {
  return {
    data: { currentUserId: "player", layouts: [], economy: createTestEconomy(), organisation: createOrganisation(), gameSettings: createTestGameSettings() },
    floorId: "floor", grantedRoomIds: new Set(), unavailable: undefined,
    onStart: vi.fn(), onNavigate: vi.fn(), onFinish: vi.fn(),
  };
}

async function nextFrame() {
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.mocked(fetchGameGuideState).mockResolvedValue({ status: null });
  vi.mocked(saveGameGuideStatus).mockImplementation(async status => {
    vi.mocked(fetchGameGuideState).mockResolvedValue({ status });
    return { status };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("Database-backed game guide", () => {
  it("starts once in Strict Mode and remembers skipping across remounts while allowing replay", async () => {
    const props = fixture();
    const view = render(<StrictMode><GameGuide {...props} /></StrictMode>);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(saveGameGuideStatus).toHaveBeenLastCalledWith("started");
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    await nextFrame();
    expect(saveGameGuideStatus).toHaveBeenLastCalledWith("skipped");
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    view.unmount();
    localStorage.clear();
    render(<GameGuide {...props} />);
    await nextFrame();
    expect(screen.queryByRole("dialog")).toBeNull();
    const replay = screen.getByRole("button", { name: "How to play" });
    expect(replay.textContent).toBe("How to play");
    fireEvent.click(replay);
    expect(props.onStart).toHaveBeenCalledTimes(2);
  });

  it.each(["Reconnect to start the guide.", "Close your activity before starting the guide.", "Finish building before starting the guide.", "Close this panel before starting the guide."])("waits while unavailable: %s", async unavailable => {
    const props = fixture();
    const view = render(<GameGuide {...props} unavailable={unavailable} />);
    await nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
    expect(saveGameGuideStatus).not.toHaveBeenCalled();
    view.rerender(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    view.rerender(<GameGuide {...props} unavailable={unavailable} />);
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    view.rerender(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("waits for database state and ignores a response after unmount", async () => {
    let resolve!: (state: GameGuideState) => void;
    vi.mocked(fetchGameGuideState).mockReturnValue(new Promise(done => { resolve = done; }));
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    await nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(props.onStart).not.toHaveBeenCalled();
    view.unmount();
    await act(async () => resolve({ status: null }));
    await nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it.each(["started", "skipped", "completed"] as const)("does not auto-start a guide with saved status %s", async status => {
    vi.mocked(fetchGameGuideState).mockResolvedValue({ status });
    const props = fixture();
    render(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish guide" }));
    await nextFrame();
    expect(saveGameGuideStatus).toHaveBeenLastCalledWith("completed");
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it("loads progress again when the player or server changes", async () => {
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    await nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    await nextFrame();
    vi.mocked(fetchGameGuideState).mockResolvedValue({ status: null });
    view.rerender(<GameGuide {...props} data={{ ...props.data, currentUserId: "other-player" }} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    await nextFrame();
    view.rerender(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(2);
    localStorage.setItem("northstar.serverOrigin", "https://other.example.test");
    vi.mocked(fetchGameGuideState).mockResolvedValue({ status: null });
    view.rerender(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(3);
    expect(fetchGameGuideState).toHaveBeenCalledTimes(4);
  });

  it("allows dismissal when saving fails and retries the latest state", async () => {
    vi.mocked(saveGameGuideStatus).mockRejectedValue(new Error("Offline"));
    const props = fixture();
    render(<GameGuide {...props} />);
    await nextFrame();
    fireEvent.keyDown(document, { key: "Escape" });
    await nextFrame();
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
    vi.mocked(saveGameGuideStatus).mockResolvedValue({ status: "skipped" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await nextFrame();
    expect(saveGameGuideStatus).toHaveBeenLastCalledWith("skipped");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("retries failed reads without assuming the player is new", async () => {
    vi.mocked(fetchGameGuideState).mockRejectedValueOnce(new Error("Offline"));
    const props = fixture();
    render(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    vi.mocked(fetchGameGuideState).mockResolvedValue({ status: "completed" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await nextFrame();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onStart).not.toHaveBeenCalled();
  });

  it("saves transitions in order when skipping before the first save completes", async () => {
    let resolve!: (state: GameGuideState) => void;
    vi.mocked(saveGameGuideStatus).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<GameGuide {...fixture()} />);
    await nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "Skip guide" }));
    await nextFrame();
    expect(saveGameGuideStatus).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ status: "started" }));
    await nextFrame();
    expect(vi.mocked(saveGameGuideStatus).mock.calls.map(([status]) => status)).toEqual(["started", "skipped"]);
  });

  it("recovers from a missing target without repeatedly starting", async () => {
    const props = fixture();
    const view = render(<GameGuide {...props} />);
    await nextFrame();
    fireEvent.click(screen.getByRole("button", { name: "Missing target" }));
    expect(screen.getByRole("alert").textContent).toContain("Try How to play again");
    view.rerender(<GameGuide {...props} unavailable="Offline" />);
    view.rerender(<GameGuide {...props} />);
    await nextFrame();
    expect(props.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onStart).toHaveBeenCalledTimes(2);
  });
});
