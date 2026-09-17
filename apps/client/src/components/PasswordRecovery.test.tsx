import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { PasswordRecovery } from "./PasswordRecovery";

const api = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("../api", async (importOriginal) => ({ ...await importOriginal<typeof import("../api")>(), ...api }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("password recovery", () => {
  it("requests an email while preserving the invitation and returns to sign-in", async () => {
    api.requestPasswordReset.mockResolvedValue({ message: "Check your email." });
    const onBack = vi.fn();
    render(<PasswordRecovery invitationToken="invitation" onTokenCleared={vi.fn()} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByRole("heading", { name: "Check your email" });
    expect(api.requestPasswordReset).toHaveBeenCalledWith("person@example.com", "invitation");
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("requires matching passwords before submitting and never automatically signs in", async () => {
    api.resetPassword.mockResolvedValue(undefined);
    const onTokenCleared = vi.fn();
    const onBack = vi.fn();
    render(<PasswordRecovery resetToken="reset-token" onTokenCleared={onTokenCleared} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByRole("alert").textContent).toContain("Passwords do not match");
    expect(api.resetPassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByRole("heading", { name: "Password changed" });
    expect(api.resetPassword).toHaveBeenCalledWith("reset-token", "new-password");
    expect(onTokenCleared).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New password")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("clears invalid reset tokens and offers a fresh email request", async () => {
    api.resetPassword.mockRejectedValue(new ApiError("Reset link is invalid or expired. Request a new link.", 401, "PASSWORD_RESET_EXPIRED"));
    const onTokenCleared = vi.fn();
    render(<PasswordRecovery resetToken="expired-token" onTokenCleared={onTokenCleared} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByRole("heading", { name: "Forgot password" });
    expect(onTokenCleared).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toContain("Request a new link");
    expect(screen.getByLabelText("Email")).toBeDefined();
  });

  it("keeps a failed request editable and shows its recovery instruction", async () => {
    api.requestPasswordReset.mockRejectedValue(new Error("Password recovery is unavailable. Contact the workspace owner."));
    render(<PasswordRecovery onTokenCleared={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Contact the workspace owner"));
    expect((screen.getByRole("button", { name: "Send reset link" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
