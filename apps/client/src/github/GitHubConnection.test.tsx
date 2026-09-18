import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubStatus } from "@workhard/shared";
import { connectGitHub, disconnectGitHub, fetchGitHubStatus } from "../api";
import { GitHubConnection } from "./GitHubConnection";
import { openAuthorization } from "../open-authorization";

vi.mock("../open-authorization", () => ({ openAuthorization: vi.fn((connect: () => Promise<string>) => connect()) }));

vi.mock("../api", () => ({ fetchGitHubStatus: vi.fn(), connectGitHub: vi.fn(), disconnectGitHub: vi.fn() }));
const status: GitHubStatus = { configured: true, connected: false, login: null, needsReconnect: false, installationUrl: null };

beforeEach(() => {
  vi.mocked(fetchGitHubStatus).mockResolvedValue(status);
  vi.mocked(openAuthorization).mockImplementation(async (connect) => { await connect(); });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("GitHub connection", () => {
  it("connects from Tauri and refreshes the account when returning", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    vi.mocked(connectGitHub).mockResolvedValue("https://office.example/v1/github/browser?ticket=test");
    const view = render(<GitHubConnection />);
    const button = await view.findByRole("button", { name: "Connect GitHub" });
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    expect(openAuthorization).toHaveBeenCalledWith(connectGitHub);
    vi.mocked(fetchGitHubStatus).mockResolvedValue({ ...status, connected: true, login: "maya" });
    fireEvent.focus(window);
    expect(await view.findByRole("button", { name: "Disconnect GitHub" })).toBeTruthy();
  });

  it("recovers a failed status check when returning to the app", async () => {
    vi.mocked(fetchGitHubStatus).mockRejectedValueOnce(new Error("GitHub could not load. Try again."));
    const view = render(<GitHubConnection />);
    await view.findByRole("alert");
    fireEvent.focus(window);
    await view.findByRole("button", { name: "Connect GitHub" });
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("preserves history and other URL parameters when consuming a failed callback", async () => {
    window.history.replaceState({ navigation: "saved" }, "", "/?github=error&view=office#anchor");
    const view = render(<GitHubConnection />);
    await view.findByRole("button", { name: "Connect GitHub" });
    expect(view.getByRole("alert").textContent).toContain("GitHub could not connect");
    expect(window.location.search).toBe("?view=office");
    expect(window.location.hash).toBe("#anchor");
    expect(window.history.state).toEqual({ navigation: "saved" });
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
  });

  it("prevents repeated connect requests and restores the action after failure", async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(connectGitHub).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    const view = render(<GitHubConnection />);
    const button = await view.findByRole("button", { name: "Connect GitHub" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(connectGitHub).toHaveBeenCalledOnce();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fail(new Error("GitHub could not connect. Try again.")));
    expect(view.getByRole("alert")).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not restore a disconnected account from a late focus check", async () => {
    const connected = { ...status, connected: true, login: "maya" };
    vi.mocked(fetchGitHubStatus).mockResolvedValueOnce(connected);
    vi.mocked(disconnectGitHub).mockResolvedValue(status);
    const onStatus = vi.fn();
    const view = render(<GitHubConnection onStatus={onStatus} compact />);
    await view.findByRole("button", { name: "Disconnect GitHub" });
    let finish!: (next: GitHubStatus) => void;
    vi.mocked(fetchGitHubStatus).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.focus(window);
    fireEvent.click(view.getByRole("button", { name: "Disconnect GitHub" }));
    await view.findByRole("button", { name: "Connect GitHub" });
    await act(async () => finish(connected));
    expect(onStatus).toHaveBeenLastCalledWith(status);
    expect(view.queryByRole("button", { name: "Disconnect GitHub" })).toBeNull();
  });
});
