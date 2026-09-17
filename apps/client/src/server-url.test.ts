import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearServerOrigin,
  getDefaultServerOrigin,
  getServerOrigin,
  normalizeServerOrigin,
  resolveRealtimeUrl,
  resolveServerUrl,
  setServerOrigin,
} from "./server-url";

describe("server URL configuration", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires a server in native clients even when a browser default is configured", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    vi.stubEnv("VITE_SERVER_URL", "https://browser.example.com");
    expect(getDefaultServerOrigin()).toBeNull();
    expect(getServerOrigin()).toBeNull();
    expect(() => resolveServerUrl("/v1/auth/session")).toThrow("Enter your server URL");
    expect(() => resolveRealtimeUrl("/v1/realtime")).toThrow("Enter your server URL");
    setServerOrigin("https://private.example.com");
    expect(getServerOrigin()).toBe("https://private.example.com");
    expect(clearServerOrigin()).toBeNull();
  });

  it("returns to server selection for an invalid saved address", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    localStorage.setItem("northstar.serverOrigin", "not a URL");
    expect(getServerOrigin()).toBeNull();
    setServerOrigin("https://private.example.com");
    expect(getServerOrigin()).toBe("https://private.example.com");
  });

  it("rejects HTTP for native session cookies without replacing the active server", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    setServerOrigin("https://private.example.com");
    expect(() => setServerOrigin("http://192.168.1.2:3001")).toThrow("HTTPS address");
    expect(getServerOrigin()).toBe("https://private.example.com");
  });

  it("normalizes and persists a custom server origin", () => {
    expect(setServerOrigin("https://office.example.com:8443/")).toBe("https://office.example.com:8443");
    expect(getServerOrigin()).toBe("https://office.example.com:8443");
    expect(resolveServerUrl("/v1/auth/session")).toBe("https://office.example.com:8443/v1/auth/session");
    expect(resolveRealtimeUrl("/v1/realtime")).toBe("wss://office.example.com:8443/v1/realtime");
  });

  it("rejects values that are not server origins", () => {
    expect(() => normalizeServerOrigin("ftp://office.example.com")).toThrow("HTTP or HTTPS");
    expect(() => normalizeServerOrigin("https://user@office.example.com")).toThrow("without credentials");
    expect(() => normalizeServerOrigin("https://office.example.com/api")).toThrow("without credentials");
  });

  it("uses a matching WebSocket protocol", () => {
    setServerOrigin("http://127.0.0.1:3001");
    expect(resolveRealtimeUrl("/v1/realtime")).toBe("ws://127.0.0.1:3001/v1/realtime");
  });

  it("returns to the default origin after clearing a custom server", () => {
    setServerOrigin("https://office.example.com");

    expect(clearServerOrigin()).toBe(getDefaultServerOrigin());
    expect(getServerOrigin()).toBe(getDefaultServerOrigin());
  });
});
