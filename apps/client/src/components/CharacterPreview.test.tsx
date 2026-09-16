import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_CHARACTER_APPEARANCE } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCharacter } from "../character-renderer";
import { CharacterPreview } from "./CharacterPreview";

vi.mock("../character-renderer", () => ({ renderCharacter: vi.fn() }));

const context = {
  clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
  translate: vi.fn(), scale: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: "high",
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  vi.mocked(renderCharacter).mockReset().mockResolvedValue(document.createElement("canvas"));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("character preview recovery", () => {
  it("reports an unavailable canvas and retries without marking the blank preview ready", async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
    const onReady = vi.fn();
    render(<CharacterPreview appearance={DEFAULT_CHARACTER_APPEARANCE} label="Character preview" onReady={onReady} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Character preview is unavailable");
    expect(onReady).not.toHaveBeenCalledWith(true);
    expect(renderCharacter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retains the appearance when retrying failed artwork", async () => {
    vi.mocked(renderCharacter).mockRejectedValueOnce(new Error("Character could not load. Try again."));
    const appearance = { ...DEFAULT_CHARACTER_APPEARANCE, hairstyle: "spiky" as const };
    const onReady = vi.fn();
    render(<CharacterPreview appearance={appearance} label="Character preview" onReady={onReady} />);
    await screen.findByRole("alert");
    expect(onReady).not.toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    expect(renderCharacter).toHaveBeenLastCalledWith(appearance, { x: 24, y: 0, width: 72, height: 120 });
  });

  it("renders the selected direction at the displayed crop size", async () => {
    const onReady = vi.fn();
    render(<CharacterPreview appearance={DEFAULT_CHARACTER_APPEARANCE} crop="hair" direction="up" onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    expect(renderCharacter).toHaveBeenLastCalledWith(DEFAULT_CHARACTER_APPEARANCE, { x: 28, y: 376, width: 64, height: 68 });
  });

  it("retains the full atlas for animated previews", async () => {
    const onReady = vi.fn();
    render(<CharacterPreview appearance={DEFAULT_CHARACTER_APPEARANCE} motion="sit-listen" direction="left" onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenLastCalledWith(true));
    expect(renderCharacter).toHaveBeenLastCalledWith(DEFAULT_CHARACTER_APPEARANCE, undefined);
  });
});
