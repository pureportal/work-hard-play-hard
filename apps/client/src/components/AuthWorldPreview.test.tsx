import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthWorldPreview } from "./AuthWorldPreview";

const preview = vi.hoisted(() => ({ destroyScene: vi.fn(), destroyApp: vi.fn() }));

vi.mock("pixi.js", () => ({
  Application: class {
    canvas = document.createElement("canvas");
    init = () => Promise.resolve();
    destroy = preview.destroyApp;
    renderer = {};
  },
}));
vi.mock("pixi.js/unsafe-eval", () => ({}));
vi.mock("../auth-preview-scene", () => ({
  PREVIEW_WIDTH: 512,
  PREVIEW_HEIGHT: 426,
  AuthPreviewScene: class {
    destroy = preview.destroyScene;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("auth world preview", () => {
  it("mounts a decorative canvas without an interaction target", async () => {
    const { container } = render(<AuthWorldPreview />);
    await waitFor(() => expect(container.querySelector(".auth-preview-canvas canvas")).not.toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".auth-preview-canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("cleans up the renderer", async () => {
    const { container, unmount } = render(<AuthWorldPreview />);
    await waitFor(() => expect(container.querySelector(".auth-preview-canvas canvas")).not.toBeNull());
    unmount();
    expect(preview.destroyScene).toHaveBeenCalledOnce();
    expect(preview.destroyApp).toHaveBeenCalledOnce();
  });
});
