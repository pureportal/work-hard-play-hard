import { afterEach, describe, expect, it, vi } from "vitest";
import { removePlayerAvatar, uploadPlayerAvatar } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avatar client API", () => {
  it("uploads the original file body and removes the current avatar", async () => {
    const member = {
      id: "user-maya",
      name: "Maya Chen",
      initials: "MC",
      avatarUrl: "/v1/members/user-maya/avatar.webp?v=one",
      email: "maya@example.com",
      title: "Product Lead",
      role: "owner",
      permissions: ["manage_members", "build"],
      color: "#5b8def",
      availability: "available",
      online: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(member), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...member, avatarUrl: undefined }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.webp", { type: "image/webp" });

    await expect(uploadPlayerAvatar(file)).resolves.toMatchObject({ avatarUrl: member.avatarUrl });
    await expect(removePlayerAvatar()).resolves.not.toHaveProperty("avatarUrl");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/members/me/avatar");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body: file,
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
