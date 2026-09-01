import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactionPicker } from "./ReactionPicker";

afterEach(cleanup);

describe("ReactionPicker", () => {
  it("offers concise reactions and closes after choosing one", () => {
    const onReact = vi.fn();
    render(<ReactionPicker onReact={onReact} />);

    fireEvent.click(screen.getByRole("button", { name: "React" }));
    expect(screen.getByRole("group", { name: "Reactions" }).querySelectorAll("button")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Celebrate (3)" }));
    expect(onReact).toHaveBeenCalledWith("celebrate");
    expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "React" }));
  });

  it("returns focus to the trigger when dismissed", () => {
    render(<ReactionPicker onReact={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "React" });

    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Wave (1)" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
