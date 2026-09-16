import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createOrganisation, createPublicEconomy, DEFAULT_CHARACTER_APPEARANCE, type Member } from "@workhard/shared";
import { afterEach, expect, it, vi } from "vitest";
import { FundSettings } from "./FundSettings";

afterEach(cleanup);
const members: Member[] = [{ id: "alice", name: "Alice", initials: "A", character: DEFAULT_CHARACTER_APPEARANCE,
  email: "alice@example.test", title: "", role: "member", permissions: [], color: "#445566", availability: "available", online: false }];

function setup() {
  const economy = createPublicEconomy("hierarchical");
  const organisation = createOrganisation("alice");
  const onPropose = vi.fn();
  render(<FundSettings economy={economy} fund={economy.funds[0]!} organisation={organisation} members={members} pending={false} onPropose={onPropose} />);
  return onPropose;
}

it("updates inherited weekly limits with the allowance while keeping explicit limits", () => {
  const onPropose = setup();
  expect((screen.getByRole("button", { name: "Propose rules" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Individual limits", { exact: true }));
  const allowance = screen.getByRole("spinbutton", { name: "Weekly allowance" });
  const personal = screen.getByRole("spinbutton", { name: "Alice weekly limit" });
  fireEvent.change(allowance, { target: { value: "100" } });
  expect((personal as HTMLInputElement).value).toBe("100");
  fireEvent.change(personal, { target: { value: "12" } });
  fireEvent.change(allowance, { target: { value: "200" } });
  expect((personal as HTMLInputElement).value).toBe("12");
  fireEvent.click(screen.getByRole("button", { name: "Propose rules" }));
  expect(onPropose).toHaveBeenCalledWith("Change spending rules", expect.objectContaining({ weeklyAllowance: 200, spendingLimits: [{ userId: "alice", amount: 12 }] }));
});

it("requires a governance change and at least one CEO for hierarchical decisions", () => {
  setup();
  const submit = screen.getByRole("button", { name: "Propose decision-making" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByText("CEOs (1)", { exact: true }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Alice" }));
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "Decision-making" }), { target: { value: "equal" } });
  expect(submit.disabled).toBe(false);
});
