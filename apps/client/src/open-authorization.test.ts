import { afterEach, describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { openAuthorization } from "./open-authorization";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("authorization browser", () => {
  it("opens a tab before requesting authorization and removes access to the app window", async () => {
    const tab = { opener: window, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    let resolve!: (url: string) => void;
    const connect = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const pending = openAuthorization(connect);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]!);
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).not.toHaveBeenCalled();
    resolve("https://accounts.spotify.com/authorize");
    await pending;
    expect(tab.location.replace).toHaveBeenCalledWith("https://accounts.spotify.com/authorize");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("reports blocked popups without starting authorization", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const connect = vi.fn();
    await expect(openAuthorization(connect)).rejects.toThrow("Allow popups");
    expect(connect).not.toHaveBeenCalled();
  });

  it("closes the empty tab when authorization fails", async () => {
    const tab = { opener: window, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    await expect(openAuthorization(() => Promise.reject(new Error("Connection failed")))).rejects.toThrow("Connection failed");
    expect(tab.close).toHaveBeenCalledOnce();
  });

  it("opens the default browser in Tauri and propagates launch failures", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    const open = vi.spyOn(window, "open");
    const url = "https://office.example/v1/github/browser?ticket=test";
    await openAuthorization(() => Promise.resolve(url));
    expect(openUrl).toHaveBeenCalledWith(url);
    expect(open).not.toHaveBeenCalled();
    vi.mocked(openUrl).mockRejectedValueOnce(new Error("Browser could not open"));
    await expect(openAuthorization(() => Promise.resolve(url))).rejects.toThrow("Browser could not open");
  });
});
