import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Member } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarDialog } from "./AvatarDialog";

const member: Member = {
  id: "user-maya",
  name: "Maya Chen",
  initials: "MC",
  email: "maya@example.com",
  title: "Product Lead",
  role: "owner",
  permissions: ["manage_members", "build"],
  color: "#5b8def",
  availability: "available",
  online: true,
};

afterEach(cleanup);

describe("AvatarDialog", () => {
  it("uploads a selected image", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <AvatarDialog currentUser={member} onClose={vi.fn()} onUpload={onUpload} onRemove={vi.fn()} />,
    );
    const file = new File([new Uint8Array([1, 2, 3])], "portrait.png", { type: "image/png" });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the customized image and removes it", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const customized = {
      ...member,
      avatarUrl: "/v1/members/user-maya/avatar.webp?v=one",
    };
    const { container } = render(
      <AvatarDialog currentUser={customized} onClose={vi.fn()} onUpload={vi.fn()} onRemove={onRemove} />,
    );

    expect(container.querySelector<HTMLImageElement>(".avatar-preview img")?.src).toContain(customized.avatarUrl);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
  });

  it("rejects unsupported files before upload", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <AvatarDialog currentUser={member} onClose={vi.fn()} onUpload={onUpload} onRemove={vi.fn()} />,
    );
    const file = new File(["portrait"], "portrait.svg", { type: "image/svg+xml" });

    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });

    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("PNG, JPEG, GIF, or WebP");
  });
});
