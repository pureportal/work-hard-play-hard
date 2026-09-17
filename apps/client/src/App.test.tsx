import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionError } from "./api";
import { App } from "./App";
import { createTestCorporateIdentity } from "./test-fixtures";
import { getServerOrigin, setServerOrigin } from "./server-url";

const apiMocks = vi.hoisted(() => ({
  fetchSession: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    fetchSession: apiMocks.fetchSession,
  };
});

vi.mock("./components/WorldCanvasLoader", () => ({
  WorldCanvas: () => null,
}));

let online = true;
const registration = { enabled: false, invitationRequired: true };
const corporateIdentity = createTestCorporateIdentity();

beforeEach(() => {
  localStorage.clear();
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  apiMocks.fetchSession.mockReset();
});

describe("App startup recovery", () => {
  it("waits for an explicit native server and preserves it across relaunches", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    apiMocks.fetchSession.mockResolvedValue({ user: undefined, setupRequired: false, registration,
      magicLinkEnabled: false, passwordResetEnabled: false, corporateIdentity });
    const app = render(<App />);
    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use default" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), { target: { value: "https://private.example.com" } });
    expect(apiMocks.fetchSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(getServerOrigin()).toBe("https://private.example.com");
    app.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Sign in" });
    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Server: https://private.example.com" }));
    expect(screen.queryByRole("button", { name: "Use default" })).toBeNull();
  });

  it("can replace an unreachable native server without retaining its authentication tokens", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    setServerOrigin("https://offline.example.com");
    apiMocks.fetchSession.mockRejectedValueOnce(new ConnectionError("Server could not be reached."))
      .mockResolvedValue({ user: undefined, setupRequired: false, registration,
        magicLinkEnabled: false, passwordResetEnabled: false, corporateIdentity });
    render(<App />);
    await screen.findByRole("alert");
    window.history.replaceState({ northstarAuthTokens: { invitation: "old-server-token" } }, "");
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), { target: { value: "https://next.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("button", { name: "Sign in" });
    expect(getServerOrigin()).toBe("https://next.example.com");
    expect(window.history.state.northstarAuthTokens).toBeUndefined();
    await waitFor(() => expect(apiMocks.fetchSession).toHaveBeenCalledTimes(2));
  });
  it("reflects public corporate identity on the authentication experience", async () => {
    const configuredIdentity = {
      applicationName: "Acme Spaces",
      primaryColor: "#123abc",
      secondaryColor: "#f28c28",
      authenticationLayout: "centered" as const,
      logoUrl: "/v1/branding/logo.webp?v=one",
    };
    apiMocks.fetchSession.mockResolvedValue({
      user: undefined,
      setupRequired: false,
      registration,
      magicLinkEnabled: true,
      passwordResetEnabled: true,
      corporateIdentity: configuredIdentity,
    });

    const { container } = render(<App />);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("heading", { name: "Acme Spaces" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Email sign-in link" })).toBeDefined();
    expect(container.querySelector(".auth-shell.centered .corporate-logo")).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#123abc");
  });

  it("shows first-user setup when the server is unconfigured", async () => {
    apiMocks.fetchSession.mockResolvedValue({
      user: undefined,
      setupRequired: true,
      registration,
      magicLinkEnabled: true,
      passwordResetEnabled: true,
      corporateIdentity,
    });

    render(<App />);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("heading", { name: "Set up Northstar" })).toBeDefined();
  });

  it("retries a transient connection failure without treating it as sign-out", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    apiMocks.fetchSession
      .mockRejectedValueOnce(new ConnectionError("Server could not be reached."))
      .mockResolvedValueOnce({
        user: undefined,
        setupRequired: false,
        registration,
        magicLinkEnabled: true,
      passwordResetEnabled: true,
        corporateIdentity,
      });

    render(<App />);
    await act(async () => Promise.resolve());
    expect(screen.getByRole("heading", { name: "Server could not be reached." })).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole("heading", { name: "Northstar" })).toBeDefined();
    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(2);
  });

  it("probes for recovery when the browser remains incorrectly marked offline", async () => {
    vi.useFakeTimers();
    online = false;
    apiMocks.fetchSession
      .mockRejectedValueOnce(new ConnectionError("Connection unavailable."))
      .mockResolvedValueOnce({
        user: undefined,
        setupRequired: false,
        registration,
        magicLinkEnabled: true,
      passwordResetEnabled: true,
        corporateIdentity,
      });

    render(<App />);
    await act(async () => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(apiMocks.fetchSession).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole("heading", { name: "Northstar" })).toBeDefined();
    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(2);
  });

  it("retries immediately when an offline startup returns to the foreground", async () => {
    vi.useFakeTimers();
    online = false;
    apiMocks.fetchSession
      .mockRejectedValueOnce(new ConnectionError("Connection unavailable."))
      .mockResolvedValueOnce({
        user: undefined,
        setupRequired: false,
        registration,
        magicLinkEnabled: true,
      passwordResetEnabled: true,
        corporateIdentity,
      });

    render(<App />);
    await act(async () => Promise.resolve());
    expect(apiMocks.fetchSession).toHaveBeenCalledOnce();

    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Northstar" })).toBeDefined();
    expect(apiMocks.fetchSession).toHaveBeenCalledTimes(2);
  });
});
