import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInvitation, ApiError, changeMemberAccess, fetchSession, inviteMember, isConnectionError, registerAccount, requestMagicLink, updateRegistrationSettings } from "./api";

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("client requests", () => {
  it("distinguishes an offline browser from an unreachable server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    online = false;
    await expect(fetchSession()).rejects.toMatchObject({
      name: "ConnectionError",
      message: "Connection unavailable.",
    });

    online = true;
    await expect(fetchSession()).rejects.toMatchObject({
      name: "ConnectionError",
      message: "Server could not be reached.",
    });
  });

  it("treats temporary gateway responses as recoverable connection failures", () => {
    expect(isConnectionError(new ApiError("Unavailable", 503))).toBe(true);
    expect(isConnectionError(new ApiError("Too many requests", 429))).toBe(false);
  });

  it("aborts a request that exceeds its deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const expectation = expect(fetchSession()).rejects.toMatchObject({
      name: "ConnectionError",
      message: "Request timed out.",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;
  });

  it("rejects malformed successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));

    await expect(fetchSession()).rejects.toThrow("Server returned an invalid response.");
  });

  it("encodes identifiers used in request paths", async () => {
    const invitation = {
      id: "invitation-one",
      teamId: "team/one",
      email: "person@example.com",
      role: "member" as const,
      permissions: [],
      status: "pending" as const,
      expiresAt: "2026-09-09T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(invitation), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(inviteMember("team/one", invitation.email)).resolves.toEqual(invitation);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/teams/team%2Fone/invitations");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: invitation.email,
      role: "member",
      permissions: [],
    });
  });

  it("keeps invitation tokens in request bodies", async () => {
    const token = "a".repeat(43);
    const invitation = {
      id: "invitation-one",
      teamId: "team-one",
      email: "person@example.com",
      role: "member" as const,
      permissions: [],
      status: "accepted" as const,
      expiresAt: "2026-09-09T00:00:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Check your email." }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(invitation), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: "user-one", username: "person", email: invitation.email },
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await requestMagicLink(invitation.email, token);
    await expect(acceptInvitation(token)).resolves.toEqual(invitation);
    await registerAccount("person", invitation.email, "correct-horse", token);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: invitation.email,
      invitationToken: token,
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/v1/invitations/accept");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ token });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      username: "person",
      email: invitation.email,
      password: "correct-horse",
      invitationToken: token,
    });
  });

  it("sends role and build permission together when access changes", async () => {
    const member = {
      id: "member/one",
      name: "Member",
      initials: "ME",
      email: "member@example.com",
      title: "",
      role: "member" as const,
      permissions: ["build" as const],
      color: "#123456",
      availability: "available" as const,
      online: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(member), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(changeMemberAccess("team/one", "member/one", "member", ["build"])).resolves.toEqual(member);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/teams/team%2Fone/members/member%2Fone");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ role: "member", permissions: ["build"] });
  });

  it("replaces registration settings through the administrator endpoint", async () => {
    const settings = {
      enabled: true,
      invitationRequired: false,
      whitelistedDomains: ["example.com"],
      defaultRole: "guest" as const,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(settings), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateRegistrationSettings(settings)).resolves.toEqual(settings);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/admin/registration-settings");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(settings);
  });
});
