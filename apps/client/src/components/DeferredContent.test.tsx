import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { lazy, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredContent } from "./DeferredContent";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("deferred content", () => {
  it("keeps the world mounted and allows closing while a dialog loads", async () => {
    let resolve!: (module: { default: ComponentType }) => void;
    const Panel = lazy(() => new Promise<{ default: ComponentType }>((finish) => { resolve = finish; }));
    const close = vi.fn();
    const view = render(<><div>World</div><DeferredContent onClose={close}><Panel /></DeferredContent></>);
    expect(view.getByText("World")).toBeTruthy();
    expect(view.getByRole("status").textContent).toBe("Loading…");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    await act(async () => resolve({ default: () => <p>Loaded panel</p> }));
    expect(view.getByText("Loaded panel")).toBeTruthy();
    expect(view.queryByRole("status")).toBeNull();
  });

  it("offers recovery for a failed import without replacing the world", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Panel = lazy(() => Promise.reject(new Error("Chunk unavailable")));
    const close = vi.fn();
    const view = render(<><div>World</div><DeferredContent sidebar onClose={close}><Panel /></DeferredContent></>);
    await view.findByRole("alert");
    expect(view.getByText("World")).toBeTruthy();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.getByRole("button", { name: "Reload" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Close" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
