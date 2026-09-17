import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubAdminSettings, fetchSpotifyAdminSettings, updateGitHubAdminSettings, updateSpotifyAdminSettings } from "../../api";
import { setServerOrigin } from "../../server-url";
import { GitHubAppEditor } from "./GitHubAppEditor";
import { SpotifyAppEditor } from "./SpotifyAppEditor";
import { getRecommendedRedirectUri } from "./oauth-redirect-uri";

vi.mock("../../api", () => ({ fetchGitHubAdminSettings: vi.fn(), fetchSpotifyAdminSettings: vi.fn(), updateGitHubAdminSettings: vi.fn(), updateSpotifyAdminSettings: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  setServerOrigin("https://server.example:8443");
  vi.mocked(fetchGitHubAdminSettings).mockResolvedValue({ clientId: "", appSlug: "", redirectUri: "", encryptionReady: true, hasClientSecret: false, needsApply: false });
  vi.mocked(fetchSpotifyAdminSettings).mockResolvedValue({ clientId: "", redirectUri: "", encryptionReady: true });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.each([
  { provider: "github" as const, name: "GitHub", Editor: GitHubAppEditor, update: updateGitHubAdminSettings },
  { provider: "spotify" as const, name: "Spotify", Editor: SpotifyAppEditor, update: updateSpotifyAdminSettings },
])("$name setup", ({ provider, name, Editor, update }) => {
  it("prefills the connected server's callback without enabling save until credentials are entered", async () => {
    render(<Editor />);
    const redirectUri = `https://server.example:8443/v1/${provider}/callback`;
    await waitFor(() => expect((screen.getByLabelText("Redirect URI") as HTMLInputElement).value).toBe(redirectUri));
    const save = screen.getByRole("button", { name: `Save ${name}` }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.submit(save.closest("form")!);
    expect(update).not.toHaveBeenCalled();
    const values = { clientId: "newclient", redirectUri };
    if (provider === "github") {
      vi.mocked(updateGitHubAdminSettings).mockResolvedValue({ ...values, appSlug: "my-app", encryptionReady: true, hasClientSecret: true, needsApply: false });
    } else {
      vi.mocked(updateSpotifyAdminSettings).mockResolvedValue({ ...values, encryptionReady: true });
    }
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "newclient" } });
    if (provider === "github") {
      fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "app-secret" } });
      fireEvent.change(screen.getByLabelText("App slug"), { target: { value: "my-app" } });
    }
    fireEvent.click(save);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ ...values, ...(provider === "github" ? { appSlug: "my-app", clientSecret: "app-secret" } : {}) }));
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it("preserves a registered callback and only replaces it on request", async () => {
    const redirectUri = `https://registered.example/v1/${provider}/callback`;
    vi.mocked(fetchGitHubAdminSettings).mockResolvedValue({ clientId: "existing", appSlug: "my-app", redirectUri, encryptionReady: true, hasClientSecret: true, needsApply: false });
    vi.mocked(fetchSpotifyAdminSettings).mockResolvedValue({ clientId: "existing", redirectUri, encryptionReady: true });
    render(<Editor />);
    await waitFor(() => expect((screen.getByLabelText("Redirect URI") as HTMLInputElement).value).toBe(redirectUri));
    expect((screen.getByRole("button", { name: `Save ${name}` }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use recommended URI" }));
    expect((screen.getByLabelText("Redirect URI") as HTMLInputElement).value).toBe(`https://server.example:8443/v1/${provider}/callback`);
    expect(update).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: `Save ${name}` }) as HTMLButtonElement).disabled).toBe(false);
  });
});

it("copies the entered URI and offers recovery when the clipboard is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Clipboard blocked"));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<SpotifyAppEditor />);
  const redirectUri = "https://registered.example/v1/spotify/callback";
  await waitFor(() => expect((screen.getByLabelText("Redirect URI") as HTMLInputElement).value).toBe("https://server.example:8443/v1/spotify/callback"));
  fireEvent.change(screen.getByLabelText("Redirect URI"), { target: { value: redirectUri } });
  fireEvent.click(screen.getByRole("button", { name: "Copy URI" }));
  await screen.findByRole("button", { name: "Copied" });
  expect(writeText).toHaveBeenCalledWith(redirectUri);
  fireEvent.change(screen.getByLabelText("Redirect URI"), { target: { value: `${redirectUri}2` } });
  fireEvent.click(screen.getByRole("button", { name: "Copy URI" }));
  expect((await screen.findByRole("alert")).textContent).toContain("copy it manually");
  expect(updateSpotifyAdminSettings).not.toHaveBeenCalled();
});

it("clears Spotify credentials when disabling without treating the suggested URI as an unsaved change", async () => {
  vi.mocked(fetchSpotifyAdminSettings).mockResolvedValue({ clientId: "existing", redirectUri: "https://registered.example/v1/spotify/callback", encryptionReady: true });
  vi.mocked(updateSpotifyAdminSettings).mockResolvedValue({ clientId: "", redirectUri: "", encryptionReady: true });
  render(<SpotifyAppEditor />);
  await waitFor(() => expect((screen.getByLabelText("Client ID") as HTMLInputElement).value).toBe("existing"));
  fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "" } });
  const save = screen.getByRole("button", { name: "Save Spotify" }) as HTMLButtonElement;
  fireEvent.click(save);
  await waitFor(() => expect(updateSpotifyAdminSettings).toHaveBeenCalledWith({ clientId: "", redirectUri: "" }));
  await waitFor(() => expect(save.disabled).toBe(true));
});

describe("recommended callback address", () => {
  it.each(["https://office.example", "https://office.example:8443", "http://127.0.0.1:5173", "http://[::1]:3001"])("preserves the server origin %s", (origin) => {
    setServerOrigin(origin);
    expect(getRecommendedRedirectUri("github")).toBe(`${origin}/v1/github/callback`);
    expect(getRecommendedRedirectUri("spotify")).toBe(`${origin}/v1/spotify/callback`);
  });

  it.each(["http://localhost:5173", "https://localhost", "http://office.example", "http://192.168.1.5:3001"])("does not suggest an unsupported origin %s", (origin) => {
    setServerOrigin(origin);
    expect(getRecommendedRedirectUri("spotify")).toBeNull();
  });

  it("uses the selected server in the installed app", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    expect(getRecommendedRedirectUri("github")).toBe("https://server.example:8443/v1/github/callback");
    localStorage.clear();
    expect(getRecommendedRedirectUri("github")).toBeNull();
  });
});
