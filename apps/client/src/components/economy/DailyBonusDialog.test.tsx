import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDailyRewardStatus } from "@workhard/shared";
import { DailyBonusDialog } from "./DailyBonusDialog";

afterEach(cleanup);

describe("Daily bonus", () => {
  const today = new Date("2026-09-18T12:00:00Z");
  const props = () => ({ reward: getDailyRewardStatus({ streak: 0 }, today), pending: false, online: true,
    error: undefined, onClaim: vi.fn(), onClose: vi.fn() });

  it("celebrates the collected amount rather than the next reward", () => {
    const initial = props();
    const view = render(<DailyBonusDialog {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim 10 coins" }));
    expect(initial.onClaim).toHaveBeenCalledOnce();
    view.rerender(<DailyBonusDialog {...initial} reward={getDailyRewardStatus({ streak: 1, lastClaimedDay: "2026-09-18" }, today)} />);
    expect(screen.getByRole("status").textContent).toContain("+10coins");
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    expect(screen.getByRole("dialog").className).toContain("is-celebrating");
    fireEvent.click(screen.getByRole("button", { name: "Let’s play" }));
    expect(initial.onClose).toHaveBeenCalledOnce();
  });

  it("keeps the maximum reward on streaks beyond seven days", () => {
    render(<DailyBonusDialog {...props()} reward={getDailyRewardStatus({ streak: 12, lastClaimedDay: "2026-09-18" }, today)} />);
    expect(screen.getByRole("status").textContent).toContain("+50coins");
    expect(screen.getByText("12-day streak")).toBeTruthy();
    expect(screen.getByRole("dialog").className).not.toContain("is-celebrating");
  });

  it("allows dismissal while a claim is pending", () => {
    const initial = props();
    render(<DailyBonusDialog {...initial} pending />);
    expect(screen.getByRole("button", { name: "Collecting…" }).hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(initial.onClose).toHaveBeenCalledOnce();
  });

  it("blocks disconnected claims and exposes a server error for retry", () => {
    const initial = props();
    const view = render(<DailyBonusDialog {...initial} online={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim 10 coins" }));
    expect(initial.onClaim).not.toHaveBeenCalled();
    view.rerender(<DailyBonusDialog {...initial} error="Could not collect. Try again." />);
    expect(screen.getByRole("alert").textContent).toContain("Try again");
    fireEvent.click(screen.getByRole("button", { name: "Claim 10 coins" }));
    expect(initial.onClaim).toHaveBeenCalledOnce();
  });
});
