import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { DEFAULT_CHARACTER_APPEARANCE, type CharacterAppearance, type Member } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarDialog } from "./AvatarDialog";

vi.mock("./CharacterPreview", () => ({
  CharacterPreview: ({ appearance, onReady }: { appearance: CharacterAppearance; onReady?: (ready: boolean) => void }) => {
    useEffect(() => { onReady?.(true); }, [appearance, onReady]);
    return null;
  },
}));

const member: Member = {
  id: "user-maya", name: "Maya Chen", initials: "MC", character: { ...DEFAULT_CHARACTER_APPEARANCE },
  email: "maya@example.com", title: "Product Lead", role: "owner", permissions: ["manage_members", "build"],
  color: "#5b8def", availability: "available", online: true,
};

afterEach(cleanup);

describe("AvatarDialog", () => {
  it("opens the character editor without a photo or file-upload control", () => {
    const { container } = render(<AvatarDialog currentUser={member} onClose={vi.fn()} onSaveCharacter={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Use character" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Photo" })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("saves the character and keeps the dialog open when saving fails", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Connection lost. Try again.")).mockResolvedValue(undefined);
    render(<AvatarDialog currentUser={member} onClose={onClose} onSaveCharacter={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Fierce" }));
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connection lost");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, face: "fierce" });
  });

  it("prevents closing while the save is in flight", async () => {
    let finish!: () => void;
    const onClose = vi.fn();
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<AvatarDialog currentUser={member} onClose={onClose} onSaveCharacter={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
