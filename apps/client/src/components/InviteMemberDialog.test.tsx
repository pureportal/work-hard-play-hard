import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InviteMemberDialog } from "./InviteMemberDialog";

afterEach(cleanup);

it("sends an invitation and closes back to People", async () => {
  const onInvite = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(<InviteMemberDialog onInvite={onInvite} onClose={onClose} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "sam@example.com" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Role" }), { target: { value: "guest" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
  await waitFor(() => expect(onInvite).toHaveBeenCalledWith("sam@example.com", "guest"));
  expect(onClose).toHaveBeenCalledOnce();
});
