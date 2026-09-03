import { beforeEach, describe, expect, it } from "vitest";
import {
  getServerOrigin,
  normalizeServerOrigin,
  resolveRealtimeUrl,
  resolveServerUrl,
  setServerOrigin,
} from "./server-url";

describe("server URL configuration", () => {
  beforeEach(() => localStorage.clear());

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
});
