import { afterEach, describe, expect, it, vi } from "vitest";
import { readMediaIceServers } from "./ice-servers.js";

afterEach(() => vi.unstubAllEnvs());

describe("media ICE configuration", () => {
  it.each([undefined, "", "   "])("provides STUN when configuration is %s", (configuration) => {
    vi.stubEnv("MEETING_ICE_SERVERS", configuration);
    expect(readMediaIceServers()).toEqual([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
  });

  it("uses the configured STUN and authenticated TURN servers", () => {
    const servers = [
      { urls: ["stun:media.example.test:3478"] },
      { urls: ["turn:media.example.test:3478", "turns:media.example.test:5349"], username: "participant", credential: "test-credential" },
    ];
    vi.stubEnv("MEETING_ICE_SERVERS", JSON.stringify(servers));
    expect(readMediaIceServers()).toEqual(servers);
  });

  it("allows an explicit host-only configuration", () => {
    vi.stubEnv("MEETING_ICE_SERVERS", "[]");
    expect(readMediaIceServers()).toEqual([]);
  });

  it.each(["invalid json", '[{"urls":["https://media.example.test"]}]', '[{"urls":["turn:media.example.test:3478"]}]'])("rejects invalid configuration instead of starting without it: %s", (configuration) => {
    vi.stubEnv("MEETING_ICE_SERVERS", configuration);
    expect(() => readMediaIceServers()).toThrow();
  });
});
