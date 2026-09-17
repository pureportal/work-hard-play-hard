import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractionArea } from "../hooks/useInteractionAreas";
import { InteractionPanel } from "./InteractionPanel";

const game: InteractionArea = { id: "game", label: "Falling Blocks", distance: 0, highlight: { type: "circle", x: 0, y: 0, radius: 100 } };
const person: InteractionArea = { ...game, id: "person", label: "Maya" };

afterEach(cleanup);

describe("InteractionPanel", () => {
  it("collapses with Escape and preserves the current controls when reopened", () => {
    render(<InteractionPanel areas={[game]} active={game} onSelect={vi.fn()}><input aria-label="Setting" defaultValue="Classic" /></InteractionPanel>);
    const input = screen.getByRole("textbox", { name: "Setting" });
    fireEvent.change(input, { target: { value: "Speed-up" } });
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    const reopen = screen.getByRole("button", { name: "Show Falling Blocks" });
    expect(document.activeElement).toBe(reopen);
    fireEvent.click(reopen);
    expect(screen.getByRole("textbox")).toHaveProperty("value", "Speed-up");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide nearby actions" }));
  });

  it("keeps a dismissed area collapsed during updates and expands after leaving and re-entering", () => {
    const panel = (active: InteractionArea, areas: InteractionArea[]) => <InteractionPanel areas={areas} active={active} onSelect={vi.fn()}><button>Play</button></InteractionPanel>;
    const view = render(panel(game, [game]));
    fireEvent.click(screen.getByRole("button", { name: "Hide nearby actions" }));
    view.rerender(panel({ ...game, distance: 20 }, [person, game]));
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    view.rerender(panel(person, [person]));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    view.rerender(panel(game, [game, person]));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("still cycles overlapping areas in both directions", () => {
    const select = vi.fn();
    render(<InteractionPanel areas={[game, person]} active={game} onSelect={select}><button>Play</button></InteractionPanel>);
    fireEvent.click(screen.getByRole("button", { name: "Next interaction" }));
    expect(select).toHaveBeenLastCalledWith(person.id);
    fireEvent.click(screen.getByRole("button", { name: "Previous interaction" }));
    expect(select).toHaveBeenLastCalledWith(person.id);
  });
});
