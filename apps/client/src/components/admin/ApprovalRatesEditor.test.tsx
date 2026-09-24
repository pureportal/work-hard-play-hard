import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { fetchApprovalRates, updateApprovalRates } from "../../api";
import { ApprovalRatesEditor } from "./ApprovalRatesEditor";

vi.mock("../../api", () => ({ fetchApprovalRates: vi.fn(), updateApprovalRates: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchApprovalRates).mockResolvedValue({ serverSettings: 51, building: 51, organisation: 51, funds: 51 });
  vi.mocked(updateApprovalRates).mockResolvedValue({ serverSettings: 0, building: 75, organisation: 51, funds: 51 });
});

it("saves separate approval rates including immediate approval", async () => {
  render(<ApprovalRatesEditor />);
  fireEvent.change(await screen.findByRole("spinbutton", { name: "Server settings" }), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Building and rooms" }), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "Save approval rates" }));
  await waitFor(() => expect(updateApprovalRates).toHaveBeenCalledWith({ serverSettings: 0, building: 75, organisation: 51, funds: 51 }));
  expect(screen.getByRole("spinbutton", { name: "Server settings" })).toHaveProperty("value", "0");
});
