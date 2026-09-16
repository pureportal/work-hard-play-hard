import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorldObject, WorldPlayer } from "@workhard/shared";
import { SpecialPropAction } from "./components/SpecialPropAction";
import { useSpecialProps } from "./special-props";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const object: WorldObject = { id: "toy", assetId: "special-bubbles", variantId: "mint", floorId: "floor", x: 128, y: 128, rotation: 90 };
const player = { floorId: "floor", x: 112, y: 144 } as WorldPlayer;

describe("special prop controls", () => {
  it("walks to a distant toy and uses it once close enough", () => {
    const onUse = vi.fn(), onApproach = vi.fn();
    const props = { object, player: { ...player, x: 400 }, uses: [], now: 1000, unavailable: false, onUse, onApproach };
    const view = render(<SpecialPropAction {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Walk to object" }));
    expect(onApproach).toHaveBeenCalledOnce();
    view.rerender(<SpecialPropAction {...props} player={player} />);
    fireEvent.click(screen.getByRole("button", { name: "Blow bubbles" }));
    expect(onUse).toHaveBeenCalledOnce();
  });

  it("expires shared cooldowns and releases timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const { result, unmount } = renderHook(() => useSpecialProps());
    act(() => result.current.handleEvent({ type: "interaction.prop_used", use: { id: "use", objectId: object.id, assetId: object.assetId, userId: "other", floorId: object.floorId, usedAt: 0, cooldownUntil: 6000 } }));
    const view = render(<SpecialPropAction object={object} player={player} unavailable={false} uses={result.current.uses} now={result.current.now} onUse={vi.fn()} onApproach={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Ready in 6s" }) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(6000));
    view.rerender(<SpecialPropAction object={object} player={player} unavailable={false} uses={result.current.uses} now={result.current.now} onUse={vi.fn()} onApproach={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Blow bubbles" }) as HTMLButtonElement).disabled).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
