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

it("requires a structure change and at least one CEO for a hierarchical company", () => {
  setup();
  const submit = screen.getByRole("button", { name: "Propose structure" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByText("CEOs (1)", { exact: true }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Alice" }));
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByRole("combobox", { name: "Structure" }), { target: { value: "equal" } });
  expect(submit.disabled).toBe(false);
});
