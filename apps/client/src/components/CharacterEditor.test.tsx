import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { DEFAULT_CHARACTER_APPEARANCE, characterAppearanceKey, type CharacterAppearance } from "@workhard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterEditor } from "./CharacterEditor";

vi.mock("./CharacterPreview", () => ({
  CharacterPreview: ({ appearance, label, onReady }: { appearance: CharacterAppearance; label?: string; onReady?: (ready: boolean) => void }) => {
    const key = characterAppearanceKey(appearance);
    useEffect(() => { onReady?.(true); }, [key, onReady]);
    return label ? <span data-testid="character-preview">{JSON.stringify(appearance)}</span> : null;
  },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("CharacterEditor", () => {
  it("offers appearance choices without gender or size selectors", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /breast size/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^(No Breast|Flat|Medium|Big)$/ })).toBeNull();
    expect(screen.queryByText("Gender")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Female|Male)$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fierce" }));
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_CHARACTER_APPEARANCE, face: "fierce" }));
  });

  it("previews interchangeable options and saves only on request", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Fierce" }));
    for (const [tab, option] of [["Hair", "Silver tousle"], ["Tops", "Moon armor"], ["Bottoms", "Ranger breeches"], ["Shoes", "Leather boots"], ["Headwear", "Star cap"]] as const) {
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      fireEvent.click(screen.getByRole("button", { name: option }));
    }
    const expected: CharacterAppearance = { face: "fierce", hairstyle: "tousled", upperBody: "arcane", lowerBody: "ranger", shoes: "ranger", headwear: "cap" };
    expect(JSON.parse(screen.getByTestId("character-preview").textContent!)).toEqual(expected);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expected));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("keeps the draft after a failed save and lets the user retry", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("Connection lost. Try again.")).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={onSave} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Bright" }));
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connection lost");
    expect(onClose).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId("character-preview").textContent!).face).toBe("bright");
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("cancels without saving and supports keyboard navigation between categories", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={onSave} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Face" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Headwear" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Headwear" }));
    fireEvent.click(screen.getByRole("button", { name: "Moon hat" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("leaves saving enabled when reselecting the active face", () => {
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Calm" }));
    expect((screen.getByRole("button", { name: "Use character" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("can still save when randomization picks the same appearance again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CharacterEditor appearance={DEFAULT_CHARACTER_APPEARANCE} onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Randomize" }));
    fireEvent.click(screen.getByRole("button", { name: "Randomize" }));
    fireEvent.click(screen.getByRole("button", { name: "Use character" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(DEFAULT_CHARACTER_APPEARANCE));
  });
});
