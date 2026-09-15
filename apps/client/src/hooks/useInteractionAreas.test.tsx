import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInteractionAreas, type InteractionArea } from "./useInteractionAreas";

const game: InteractionArea = { id: "game", label: "Game", distance: 10, highlight: { type: "circle", x: 0, y: 0, radius: 100 } };
const person: InteractionArea = { ...game, id: "person", label: "Player", distance: 0 };

describe("interaction selection during multiplayer lobby changes", () => {
  it("keeps an explicitly selected lobby when a nearby player joins or reconnects", () => {
    const { result, rerender } = renderHook(useInteractionAreas, { initialProps: [game] });
    act(() => result.current.select(game.id));
    rerender([person, game]);
    expect(result.current.active?.id).toBe(game.id);
    rerender([game]);
    expect(result.current.active?.id).toBe(game.id);
  });

  it("releases the selection when its area disappears and still selects newly entered areas automatically", () => {
    const { result, rerender } = renderHook(useInteractionAreas, { initialProps: [game] });
    rerender([person, game]);
    expect(result.current.active?.id).toBe(person.id);
    act(() => result.current.select(game.id));
    rerender([person]);
    expect(result.current.active?.id).toBe(person.id);
    rerender([person, game]);
    expect(result.current.active?.id).toBe(game.id);
  });
});
