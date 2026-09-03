import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServerOrigin } from "../server-url";
import { AuthScreen } from "./AuthScreen";

const apiMocks = vi.hoisted(() => ({
  registerAccount: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api")>(),
  registerAccount: apiMocks.registerAccount,
}));

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  apiMocks.registerAccount.mockReset();
});

describe("AuthScreen setup", () => {
  it("reveals and hides the password without clearing it", () => {
    render(
      <AuthScreen
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    const password = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(password, { target: { value: "northstar" } });
    expect(password.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    expect(password.value).toBe("northstar");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
    expect(password.value).toBe("northstar");
  });

  it("opens first-user account creation without requiring an invitation", async () => {
    apiMocks.registerAccount.mockResolvedValue({ id: "owner", username: "owner", email: "owner@example.com" });
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthScreen
        setupRequired
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={onAuthenticated}
      />,
    );

    expect(screen.getByRole("heading", { name: "Set up Northstar" })).toBeDefined();
    expect(screen.queryByRole("tab")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "owner" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(apiMocks.registerAccount).toHaveBeenCalledWith(
      "owner",
      "owner@example.com",
      "correct-horse",
      undefined,
    ));
    expect(onAuthenticated).toHaveBeenCalledWith(false);
  });

  it("keeps account creation available for invited users", () => {
    render(
      <AuthScreen
        setupRequired={false}
        registrationsEnabled
        invitationRequired
        invitationToken={"a".repeat(43)}
        onAuthenticated={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Create account" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Username" })).toBeDefined();
  });

  it("hides account creation when registrations are disabled", () => {
    render(
      <AuthScreen
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("accepts an invitation code from public account creation", async () => {
    const token = "b".repeat(43);
    apiMocks.registerAccount.mockResolvedValue({ id: "invited", username: "invited", email: "invited@example.com" });
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthScreen
        setupRequired={false}
        registrationsEnabled
        invitationRequired
        onAuthenticated={onAuthenticated}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "invited" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "invited@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Invitation code" }), { target: { value: token } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(apiMocks.registerAccount).toHaveBeenCalledWith(
      "invited",
      "invited@example.com",
      "correct-horse",
      token,
    ));
    expect(onAuthenticated).toHaveBeenCalledWith(true);
  });

  it("connects to a custom server before authentication", async () => {
    const onServerChanged = vi.fn();
    render(
      <AuthScreen
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
        onServerChanged={onServerChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), {
      target: { value: "https://office.example.com/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(onServerChanged).toHaveBeenCalledOnce());
    expect(getServerOrigin()).toBe("https://office.example.com");
  });
});
