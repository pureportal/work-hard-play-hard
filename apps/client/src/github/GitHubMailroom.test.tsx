import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubMailroom as Mailroom, GitHubStatus, WorldObject } from "@workhard/shared";
import { ApiError, disconnectGitHub, fetchGitHubMailroom, fetchGitHubRepositories, fetchGitHubStatus } from "../api";
import { GitHubMailroom } from "./GitHubMailroom";
import { getMailroomArrival } from "./mailroom-events";

vi.mock("../api", async (load) => ({ ...await load<typeof import("../api")>(), fetchGitHubStatus: vi.fn(), fetchGitHubRepositories: vi.fn(), fetchGitHubMailroom: vi.fn(), disconnectGitHub: vi.fn() }));

const status: GitHubStatus = { configured: true, connected: true, needsReconnect: false, login: "maya", installationUrl: "https://github.com/apps/tray/installations/new" };
const object: WorldObject = { id: "tray", assetId: "decor-pr-tray", floorId: "floor-studio", x: 192, y: 192, rotation: 0, variantId: "ivory" };
const mailroom: Mailroom = { repository: { fullName: "team/private", private: true }, total: 1, nextCursor: null, pullRequests: [{ number: 12, title: "Private launch", url: "https://github.com/team/private/pull/12", author: "maya", draft: true, state: "OPEN", reviewDecision: "REVIEW_REQUIRED", updatedAt: "2026-09-15T10:00:00Z", mergedAt: null }] };

function Tray({ unavailable }: { unavailable?: string }) {
  const [repository, setRepository] = useState("team/private");
  return <GitHubMailroom object={object} repository={repository} onRepositoryChange={setRepository} unavailable={unavailable} onClose={vi.fn()} />;
}

beforeEach(() => {
  vi.mocked(fetchGitHubStatus).mockResolvedValue(status);
  vi.mocked(fetchGitHubRepositories).mockResolvedValue({ repositories: [mailroom.repository], nextPage: null });
  vi.mocked(fetchGitHubMailroom).mockResolvedValue(mailroom);
  vi.mocked(disconnectGitHub).mockResolvedValue({ ...status, connected: false, login: null });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("PR tray", () => {
  it("shows review information and direct GitHub links, with server-side filters and pagination", async () => {
    vi.mocked(fetchGitHubMailroom).mockResolvedValue({ ...mailroom, total: 26, nextCursor: "next" });
    const view = render(<Tray />);
    await view.findByText("Private launch");
    expect(view.getByText("Draft")).toBeTruthy();
    expect(view.getByRole("link", { name: /Private launch/ }).getAttribute("href")).toBe(mailroom.pullRequests[0]!.url);
    expect(view.getByText("26 pull requests")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchGitHubMailroom).toHaveBeenLastCalledWith("tray", "team/private", "repository", "next", expect.any(AbortSignal)));
    fireEvent.click(view.getByRole("button", { name: "Review requests" }));
    await waitFor(() => expect(fetchGitHubMailroom).toHaveBeenLastCalledWith("tray", "team/private", "reviews", null, expect.any(AbortSignal)));
  });

  it("removes stale PR information on a failed refresh or when leaving the tray", async () => {
    const view = render(<Tray />);
    await view.findByText("Private launch");
    vi.mocked(fetchGitHubMailroom).mockRejectedValueOnce(new ApiError("Repository unavailable. Choose another.", 403, "GITHUB_ACCESS_DENIED"));
    fireEvent.click(view.getByRole("button", { name: "Refresh pull requests" }));
    await view.findByRole("alert");
    expect(view.queryByText("Private launch")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Refresh pull requests" }));
    await view.findByText("Private launch");
    view.rerender(<Tray unavailable="Move closer to the PR tray to open it." />);
    expect(view.queryByText("Private launch")).toBeNull();
    expect(view.queryByLabelText("Repository")).toBeNull();
  });

  it("keeps the current list during refresh and removes it when changing views", async () => {
    const view = render(<Tray />);
    await view.findByText("Private launch");
    let finish!: (value: Mailroom) => void;
    vi.mocked(fetchGitHubMailroom).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(view.getByRole("button", { name: "Refresh pull requests" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(view.getByText("Private launch")).toBeTruthy();
    expect(view.getByRole("list", { name: "Pull requests" }).getAttribute("aria-busy")).toBe("true");
    await act(async () => finish(mailroom));
    let finishView!: (value: Mailroom) => void;
    vi.mocked(fetchGitHubMailroom).mockImplementationOnce(() => new Promise((resolve) => { finishView = resolve; }));
    fireEvent.click(view.getByRole("button", { name: "Mine" }));
    await waitFor(() => expect(finishView).toBeTypeOf("function"));
    expect(view.queryByText("Private launch")).toBeNull();
    await act(async () => finishView({ ...mailroom, total: 0, pullRequests: [] }));
    expect(view.getByText("Tray clear.")).toBeTruthy();
  });

  it("offers reconnect when repository discovery finds an expired connection", async () => {
    vi.mocked(fetchGitHubStatus).mockResolvedValueOnce(status).mockResolvedValue({ ...status, connected: false, needsReconnect: true });
    vi.mocked(fetchGitHubRepositories).mockRejectedValueOnce(new ApiError("Connect GitHub again.", 401, "GITHUB_RECONNECT"));
    const view = render(<GitHubMailroom object={object} repository="" onRepositoryChange={vi.fn()} unavailable={undefined} onClose={vi.fn()} />);
    await view.findByRole("button", { name: "Reconnect GitHub" });
    expect(fetchGitHubMailroom).not.toHaveBeenCalled();
    expect(view.queryByRole("combobox")).toBeNull();
  });

  it("allows returning from a failed PR page without exposing stale results", async () => {
    vi.mocked(fetchGitHubMailroom).mockResolvedValueOnce({ ...mailroom, nextCursor: "next" })
      .mockRejectedValueOnce(new Error("Pull requests could not load. Try again."));
    const view = render(<Tray />);
    await view.findByText("Private launch");
    fireEvent.click(view.getByRole("button", { name: "Next" }));
    await view.findByRole("alert");
    expect(view.queryByText("Private launch")).toBeNull();
    expect((view.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Previous" }));
    await view.findByText("Private launch");
    expect(fetchGitHubMailroom).toHaveBeenLastCalledWith("tray", "team/private", "repository", null, expect.any(AbortSignal));
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("cancels a hidden tab's request and immediately reloads when returning", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const view = render(<Tray />);
    await view.findByText("Private launch");
    let finish!: (value: Mailroom) => void;
    vi.mocked(fetchGitHubMailroom).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(view.getByRole("button", { name: "Refresh pull requests" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const signal = vi.mocked(fetchGitHubMailroom).mock.calls.at(-1)![4]!;
    hidden.mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(signal.aborted).toBe(true);
    expect(view.queryByText("Private launch")).toBeNull();
    vi.mocked(fetchGitHubMailroom).mockResolvedValueOnce({ ...mailroom, pullRequests: [{ ...mailroom.pullRequests[0]!, title: "Updated launch" }] });
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    await view.findByText("Updated launch");
    await act(async () => finish(mailroom));
    expect(view.queryByText("Private launch")).toBeNull();
    expect(view.getByText("Updated launch")).toBeTruthy();
  });

  it("pauses polling and merge feedback while the tab is hidden", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const previous = { ...mailroom, pullRequests: [{ ...mailroom.pullRequests[0]!, state: "MERGED" as const, mergedAt: "2026-09-15T09:00:00Z" }] };
    vi.mocked(fetchGitHubMailroom).mockResolvedValue(previous);
    const view = render(<Tray />);
    await view.findByText("Private launch");
    fireEvent.click(view.getByRole("button", { name: "Merged" }));
    await view.findByText("Private launch");
    const requests = vi.mocked(fetchGitHubMailroom).mock.calls.length;
    hidden.mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(fetchGitHubMailroom).toHaveBeenCalledTimes(requests);
    vi.mocked(fetchGitHubMailroom).mockResolvedValueOnce({ ...mailroom, pullRequests: [{ ...previous.pullRequests[0]!, number: 15, url: "https://github.com/team/private/pull/15", mergedAt: "2026-09-15T10:00:00Z" }] });
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    await view.findByText("Private launch");
    expect(view.queryByText("Merged #15")).toBeNull();
  });

  it("does not leave a failed repository page stuck loading and allows returning", async () => {
    vi.mocked(fetchGitHubRepositories).mockResolvedValueOnce({ repositories: [mailroom.repository], nextPage: 2 })
      .mockRejectedValueOnce(new Error("Repositories could not load. Try again."));
    const view = render(<Tray />);
    await view.findByText("Private launch");
    fireEvent.click(view.getByRole("button", { name: "More repositories" }));
    await view.findByRole("alert");
    expect((view.getByRole("button", { name: "Previous repositories" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "Previous repositories" }));
    await waitFor(() => expect(fetchGitHubRepositories).toHaveBeenLastCalledWith(1, expect.any(AbortSignal)));
    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
  });

  it("discards a late response after disconnect and offers reconnect for revoked tokens", async () => {
    let finish!: (value: Mailroom) => void;
    vi.mocked(fetchGitHubMailroom).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<Tray />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(view.getByRole("button", { name: "Disconnect GitHub" }));
    await view.findByRole("button", { name: "Connect GitHub" });
    await act(async () => finish(mailroom));
    expect(view.queryByText("Private launch")).toBeNull();
    view.unmount();
    vi.mocked(fetchGitHubStatus).mockResolvedValueOnce(status).mockResolvedValue({ ...status, connected: false, needsReconnect: true });
    vi.mocked(fetchGitHubMailroom).mockRejectedValueOnce(new ApiError("Connect GitHub again.", 401, "GITHUB_RECONNECT"));
    const revoked = render(<Tray />);
    await revoked.findByRole("button", { name: "Reconnect GitHub" });
    expect(revoked.queryByText("Private launch")).toBeNull();
  });

  it("never requests PRs until GitHub is connected", async () => {
    vi.mocked(fetchGitHubStatus).mockResolvedValue({ ...status, connected: false, login: null });
    const view = render(<Tray />);
    await view.findByRole("button", { name: "Connect GitHub" });
    expect(fetchGitHubRepositories).not.toHaveBeenCalled();
    expect(fetchGitHubMailroom).not.toHaveBeenCalled();
  });

  it("announces only newly observed merges and combines a batch into one effect", () => {
    const old: Mailroom = { ...mailroom, pullRequests: [{ ...mailroom.pullRequests[0]!, state: "MERGED", mergedAt: "2026-09-15T09:00:00Z" }] };
    const fresh: Mailroom = { ...old, pullRequests: [{ ...old.pullRequests[0]!, number: 15, mergedAt: "2026-09-15T10:00:00Z" }, ...old.pullRequests] };
    expect(getMailroomArrival(undefined, fresh, "merged")).toBeUndefined();
    expect(getMailroomArrival(old, fresh, "repository")).toBeUndefined();
    expect(getMailroomArrival(old, fresh, "merged")?.number).toBe(15);
    expect(getMailroomArrival({ ...old, pullRequests: [] }, fresh, "merged")?.number).toBe(15);
    expect(getMailroomArrival(fresh, fresh, "merged")).toBeUndefined();
    expect(getMailroomArrival(old, { ...fresh, repository: { fullName: "other/repo", private: true } }, "merged")).toBeUndefined();
  });
});
