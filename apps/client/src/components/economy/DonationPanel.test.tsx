import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicEconomy } from "@workhard/shared";
import { DonationPanel } from "./DonationPanel";

afterEach(cleanup);

describe("Build donations", () => {
  it("requires confirmation before transferring coins to Shared", () => {
    const onCommand = vi.fn();
    const economy = createPublicEconomy();
    render(<DonationPanel economy={economy} balance={250}
      pending={false} onCommand={onCommand} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Transfer 25 coins to Shared?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit amount" }));
    expect(screen.queryByRole("dialog", { name: "Transfer 25 coins to Shared?" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer coins" }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "economy.donate", amount: 25, fundId: "workspace" }));
  });
});
