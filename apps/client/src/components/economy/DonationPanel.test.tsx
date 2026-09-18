import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrganisation, createPublicEconomy } from "@workhard/shared";
import { DonationPanel } from "./DonationPanel";

afterEach(cleanup);

describe("Build donations", () => {
  it("requires confirmation before donating to the selected fund", () => {
    const onCommand = vi.fn();
    const organisation = createOrganisation();
    organisation.units.push({ id: "design", name: "Design", kind: "department", parentId: null });
    const economy = createPublicEconomy();
    economy.funds.push({ ...economy.funds[0]!, id: "design-fund", unitId: "design" });
    render(<DonationPanel economy={economy} organisation={organisation} balance={250} initialFundId="workspace"
      pending={false} onCommand={onCommand} onViewChange={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Fund" }), { target: { value: "design-fund" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Donation" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Review donation" }));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Donate 25 coins to Design?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit amount" }));
    expect(screen.queryByRole("dialog", { name: "Donate 25 coins to Design?" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review donation" }));
    fireEvent.click(screen.getByRole("button", { name: "Donate coins" }));
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "economy.donate", amount: 25, fundId: "design-fund" }));
  });
});
