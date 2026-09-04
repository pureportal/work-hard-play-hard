import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionError } from "./api";
import { App } from "./App";
import { createTestCorporateIdentity } from "./test-fixtures";

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
  apiMocks.fetchSession.mockReset();
});

describe("App startup recovery", () => {
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
      corporateIdentity: configuredIdentity,
    });

    const { container } = render(<App />);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("heading", { name: "Acme Spaces" })).toBeDefined();
    expect(container.querySelector(".auth-shell.centered .corporate-logo")).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#123abc");
  });

  it("shows first-user setup when the server is unconfigured", async () => {
    apiMocks.fetchSession.mockResolvedValue({ user: undefined, setupRequired: true, registration, corporateIdentity });

    render(<App />);
    await act(async () => Promise.resolve());

    expect(screen.getByRole("heading", { name: "Set up Northstar" })).toBeDefined();
  });

  it("retries a transient connection failure without treating it as sign-out", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    apiMocks.fetchSession
      .mockRejectedValueOnce(new ConnectionError("Server could not be reached."))
      .mockResolvedValueOnce({ user: undefined, setupRequired: false, registration, corporateIdentity });

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
      .mockResolvedValueOnce({ user: undefined, setupRequired: false, registration, corporateIdentity });

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
      .mockResolvedValueOnce({ user: undefined, setupRequired: false, registration, corporateIdentity });

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
