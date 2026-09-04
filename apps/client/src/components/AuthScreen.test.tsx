import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultServerOrigin, getServerOrigin, setServerOrigin } from "../server-url";
import { createTestCorporateIdentity } from "../test-fixtures";
import { AuthScreen } from "./AuthScreen";

const apiMocks = vi.hoisted(() => ({
  login: vi.fn(),
  registerAccount: vi.fn(),
  requestMagicLink: vi.fn(),
}));
const corporateIdentity = createTestCorporateIdentity();

vi.mock("../api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api")>(),
  login: apiMocks.login,
  registerAccount: apiMocks.registerAccount,
  requestMagicLink: apiMocks.requestMagicLink,
}));

beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  apiMocks.login.mockReset();
  apiMocks.registerAccount.mockReset();
  apiMocks.requestMagicLink.mockReset();
});

describe("AuthScreen setup", () => {
  it("applies the configured name, logo, and centered authentication layout", () => {
    const { container } = render(
      <AuthScreen
        corporateIdentity={{
          applicationName: "Acme Spaces",
          primaryColor: "#123abc",
          secondaryColor: "#f28c28",
          authenticationLayout: "centered",
          logoUrl: "/v1/branding/logo.webp?v=one",
        }}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Acme Spaces" })).toBeDefined();
    expect(container.querySelector(".auth-shell.centered")).not.toBeNull();
    expect(container.querySelector<HTMLImageElement>(".auth-brand .corporate-logo")?.src)
      .toContain("/v1/branding/logo.webp?v=one");
  });

  it("reveals and hides the password without clearing it", () => {
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
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
        corporateIdentity={corporateIdentity}
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
        corporateIdentity={corporateIdentity}
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
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("returns from email sign-in to the password form without reloading", () => {
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Email sign-in link" }));
    expect(screen.getByRole("heading", { name: "Sign in by email" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Use password" }));

    expect(screen.getByRole("textbox", { name: "Username or email" })).toBeDefined();
    expect(screen.getByLabelText("Password")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Sign in by email" })).toBeNull();
  });

  it("returns from the sent email state to the password form", async () => {
    apiMocks.requestMagicLink.mockResolvedValue({ magicLink: "https://office.example.com/#magic=token" });
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Email sign-in link" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "maya@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

    await screen.findByRole("heading", { name: "Check your email" });
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(screen.getByRole("textbox", { name: "Username or email" })).toBeDefined();
  });

  it("keeps the login state clear while a request fails", async () => {
    let rejectLogin: ((reason: Error) => void) | undefined;
    apiMocks.login.mockImplementation(() => new Promise((_, reject) => {
      rejectLogin = reject;
    }));
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Username or email" }), { target: { value: "maya" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    rejectLogin?.(new Error("Invalid username or password."));

    expect((await screen.findByRole("alert")).textContent).toContain("Invalid username or password.");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("accepts an invitation code from public account creation", async () => {
    const token = "b".repeat(43);
    apiMocks.registerAccount.mockResolvedValue({ id: "invited", username: "invited", email: "invited@example.com" });
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
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
        corporateIdentity={corporateIdentity}
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
    expect(screen.getByRole("button", { name: "Server: https://office.example.com" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Use default" })).toBeDefined();
  });

  it("returns an active custom server to the default", async () => {
    setServerOrigin("https://office.example.com");
    const onServerChanged = vi.fn();
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
        onServerChanged={onServerChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Server: https://office.example.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Use default" }));

    await waitFor(() => expect(onServerChanged).toHaveBeenCalledOnce());
    expect(getServerOrigin()).toBe(getDefaultServerOrigin());
    expect(screen.getByRole("button", { name: "Server" })).toBeDefined();
  });

  it("shows invalid custom URLs beside the server field", async () => {
    render(
      <AuthScreen
        corporateIdentity={corporateIdentity}
        setupRequired={false}
        registrationsEnabled={false}
        invitationRequired
        onAuthenticated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Server" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), {
      target: { value: "https://office.example.com/path" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect((await screen.findByRole("alert")).textContent).toContain("without credentials");
    expect(screen.getByRole("textbox", { name: "Server URL" }).getAttribute("aria-invalid")).toBe("true");
    expect(getServerOrigin()).toBe(getDefaultServerOrigin());
  });
});
