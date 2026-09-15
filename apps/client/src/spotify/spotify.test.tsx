import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { SpotifyActivity, SpotifyStatus } from "@workhard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { SpotifySettings } from "./SpotifySettings";
import { SpotifySongDetails } from "./SpotifySongDetails";
import { useSpotifyPresence } from "./useSpotifyPresence";

const api = vi.hoisted(() => ({
  fetchSpotifyStatus: vi.fn(), connectSpotify: vi.fn(), disconnectSpotify: vi.fn(),
  setSpotifySharing: vi.fn(), setSpotifyJam: vi.fn(), playSpotifySong: vi.fn(),
}));
vi.mock("../api", async (original) => ({ ...await original<typeof import("../api")>(), ...api }));
const status: SpotifyStatus = { configured: true, connected: true, sharing: false, needsReconnect: false, error: null, jamUrl: null };
const activity: SpotifyActivity = {
  userId: "listener", trackId: "4iV5W9uYEdYUVa79Axb7Rh", title: "Night drive", artist: "Test artist",
  album: "Test album", artworkUrl: "https://i.scdn.co/image/test", trackUrl: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",
  expiresAt: Date.now() + 30_000, jamUrl: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  api.fetchSpotifyStatus.mockResolvedValue(status);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Spotify controls", () => {
  it("confirms sharing changes on the server and disconnects without keeping activity controls", async () => {
    api.setSpotifySharing.mockResolvedValue({ ...status, sharing: true });
    api.disconnectSpotify.mockResolvedValue({ ...status, connected: false });
    render(<SpotifySettings />);
    const sharing = await screen.findByRole("checkbox", { name: "Share listening activity" });
    expect((sharing as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sharing);
    await waitFor(() => expect((sharing as HTMLInputElement).checked).toBe(true));
    expect(api.setSpotifySharing).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Spotify" }));
    expect(await screen.findByRole("button", { name: "Connect Spotify" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("keeps the confirmed setting and shows recovery when saving fails", async () => {
    api.setSpotifySharing.mockRejectedValue(new Error("Spotify settings could not be saved. Try again."));
    render(<SpotifySettings />);
    fireEvent.click(await screen.findByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Spotify settings could not be saved. Try again.");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("explains missing setup only where connection would appear", async () => {
    api.fetchSpotifyStatus.mockResolvedValue({ ...status, connected: false, configured: false });
    render(<SpotifySettings />);
    expect(await screen.findByText("Spotify has not been set up for this workspace.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Spotify" })).toBeNull();
  });

  it("collects a Jam invite on demand and rejects other domains", async () => {
    const invite = "https://open.spotify.com/socialsession/invite?si=test";
    api.fetchSpotifyStatus.mockResolvedValue({ ...status, sharing: true });
    api.setSpotifyJam.mockResolvedValue({ ...status, sharing: true, jamUrl: invite });
    render(<SpotifySettings />);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Share Jam invite" }));
    const input = screen.getByRole("textbox", { name: "Jam invite" });
    fireEvent.change(input, { target: { value: "https://attacker.example/invite" } });
    fireEvent.submit(input.closest("form")!);
    expect(api.setSpotifyJam).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: invite } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByRole("button", { name: "Remove Jam invite" })).toBeTruthy();
    expect(api.setSpotifyJam).toHaveBeenCalledWith(invite);
  });

  it("shows artwork and supported actions, then clears old details on pause", async () => {
    api.playSpotifySong.mockResolvedValue(undefined);
    const view = render(<SpotifySongDetails activity={{ ...activity, jamUrl: "https://spotify.link/invite" }} own={false} onClose={vi.fn()} onSettings={vi.fn()} />);
    expect(screen.getByText("Night drive")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe(activity.artworkUrl);
    expect(screen.getByRole("link", { name: "Join Jam" }).getAttribute("href")).toBe("https://spotify.link/invite");
    fireEvent.click(screen.getByRole("button", { name: "Play on my Spotify" }));
    await waitFor(() => expect(api.playSpotifySong).toHaveBeenCalledWith(activity.userId, activity.trackId));
    view.rerender(<SpotifySongDetails activity={undefined} own={false} onClose={vi.fn()} onSettings={vi.fn()} />);
    expect(screen.queryByText("Night drive")).toBeNull();
    expect(screen.queryByRole("link", { name: "Join Jam" })).toBeNull();
    expect(screen.getByText("No listening activity.")).toBeTruthy();
  });

  it("recovers a disconnected listener through Settings and removes errors when the song changes", async () => {
    const settings = vi.fn();
    api.playSpotifySong.mockRejectedValue(new ApiError("Connect Spotify in Settings to play this song.", 409, "SPOTIFY_RECONNECT"));
    const view = render(<SpotifySongDetails activity={activity} own={false} onClose={vi.fn()} onSettings={settings} />);
    fireEvent.click(screen.getByRole("button", { name: "Play on my Spotify" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open Spotify settings" }));
    expect(settings).toHaveBeenCalledOnce();
    view.rerender(<SpotifySongDetails activity={{ ...activity, trackId: "0VjIjW4GlUZAMYd2vXMi3b", title: "Next song" }} own={false} onClose={vi.fn()} onSettings={settings} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Spotify presence and animation", () => {
  it("translates server deadlines, replaces snapshots and expires stale details without another event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { result } = renderHook(useSpotifyPresence);
    act(() => result.current.handleEvent({ type: "spotify.snapshot", serverTime: 1_000_000, activities: [{ ...activity, expiresAt: 1_002_000 }] }));
    expect(result.current.activities.listener?.expiresAt).toBe(12_000);
    act(() => { vi.advanceTimersByTime(2001); });
    expect(result.current.activities).toEqual({});
    act(() => result.current.handleEvent({ type: "spotify.activity", serverTime: 0, userId: "listener", activity: { ...activity, expiresAt: 30_000 } }));
    act(() => result.current.handleEvent({ type: "spotify.snapshot", serverTime: 0, activities: [] }));
    expect(result.current.activities).toEqual({});
  });

});
