import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGitHubAdminSettings, updateGitHubAdminSettings } from "../../api";
import { GitHubAppEditor } from "./GitHubAppEditor";

vi.mock("../../api", () => ({ fetchGitHubAdminSettings: vi.fn(), updateGitHubAdminSettings: vi.fn() }));

const saved = { clientId: "Iv1.test", appSlug: "test-app", redirectUri: "https://office.example/v1/github/callback", hasClientSecret: true, encryptionReady: true, needsApply: false };
beforeEach(() => { vi.mocked(fetchGitHubAdminSettings).mockResolvedValue(saved); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function openEditor() {
  render(<GitHubAppEditor />);
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
}

describe("GitHubAppEditor", () => {
  it("saves a new app and clears the secret after saving", async () => {
    vi.mocked(fetchGitHubAdminSettings).mockResolvedValue({ clientId: "", appSlug: "", redirectUri: "", hasClientSecret: false, encryptionReady: true, needsApply: false });
    vi.mocked(updateGitHubAdminSettings).mockResolvedValue(saved);
    await openEditor();
    for (const [label, value] of [["Client ID", " Iv1.test "], ["Client secret", "new-secret"], ["App slug", "test-app"], ["Redirect URI", saved.redirectUri]]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    expect(screen.queryByText("Saving disconnects GitHub for everyone.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    await waitFor(() => expect(updateGitHubAdminSettings).toHaveBeenCalledWith({ clientId: saved.clientId, appSlug: saved.appSlug, redirectUri: saved.redirectUri, clientSecret: "new-secret" }));
    await waitFor(() => expect((screen.getByLabelText("Replace client secret") as HTMLInputElement).value).toBe(""));
    expect((screen.getByRole("button", { name: "Save GitHub" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retains the saved secret when editing other fields and requires a replacement for a new app", async () => {
    vi.mocked(updateGitHubAdminSettings).mockResolvedValue({ ...saved, appSlug: "renamed-app" });
    await openEditor();
    expect((screen.getByLabelText("Replace client secret") as HTMLInputElement).type).toBe("password");
    fireEvent.change(screen.getByLabelText("App slug"), { target: { value: "renamed-app" } });
    expect(screen.getByText("Saving disconnects GitHub for everyone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    await waitFor(() => expect(updateGitHubAdminSettings).toHaveBeenCalledWith({ clientId: saved.clientId, appSlug: "renamed-app", redirectUri: saved.redirectUri }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save GitHub" }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "Iv1.other" } });
    expect((screen.getByLabelText("Client secret") as HTMLInputElement).required).toBe(true);
  });

  it("clears app settings when disabling GitHub and shows the consequence before saving", async () => {
    vi.mocked(updateGitHubAdminSettings).mockResolvedValue({ clientId: "", appSlug: "", redirectUri: "", hasClientSecret: false, encryptionReady: true, needsApply: false });
    await openEditor();
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "" } });
    expect(screen.getByText("Saving disables GitHub and disconnects everyone.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    await waitFor(() => expect(updateGitHubAdminSettings).toHaveBeenCalledWith({ clientId: "", appSlug: "", redirectUri: "" }));
    await waitFor(() => expect((screen.getByLabelText("App slug") as HTMLInputElement).value).toBe(""));
  });

  it("preserves edits and the entered secret when saving fails so the user can retry", async () => {
    vi.mocked(updateGitHubAdminSettings).mockRejectedValueOnce(new Error("Settings could not be saved. Try again.")).mockResolvedValue(saved);
    await openEditor();
    fireEvent.change(screen.getByLabelText("Replace client secret"), { target: { value: "replacement-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Settings could not be saved. Try again.");
    expect((screen.getByLabelText("Replace client secret") as HTMLInputElement).value).toBe("replacement-secret");
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    await waitFor(() => expect(updateGitHubAdminSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByLabelText("Replace client secret") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains the missing server key and prevents enabling without it", async () => {
    vi.mocked(fetchGitHubAdminSettings).mockResolvedValue({ ...saved, encryptionReady: false });
    await openEditor();
    fireEvent.change(screen.getByLabelText("App slug"), { target: { value: "new-app" } });
    expect(screen.getByRole("status").textContent).toContain("GITHUB_TOKEN_KEY");
    expect((screen.getByRole("button", { name: "Save GitHub" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("permits retrying an interrupted update after reopening the form", async () => {
    vi.mocked(fetchGitHubAdminSettings).mockResolvedValue({ ...saved, needsApply: true });
    vi.mocked(updateGitHubAdminSettings).mockResolvedValue(saved);
    await openEditor();
    expect(screen.getByRole("alert").textContent).toContain("Save again to retry.");
    fireEvent.click(screen.getByRole("button", { name: "Save GitHub" }));
    await waitFor(() => expect(updateGitHubAdminSettings).toHaveBeenCalledWith({ clientId: saved.clientId, appSlug: saved.appSlug, redirectUri: saved.redirectUri }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("shows loading failures without enabling the form", async () => {
    vi.mocked(fetchGitHubAdminSettings).mockRejectedValue(new Error("Sign in to continue."));
    await openEditor();
    expect(screen.getByRole("alert").textContent).toBe("Sign in to continue.");
    expect(screen.getByLabelText("Client ID").closest("fieldset")!.disabled).toBe(true);
  });
});
