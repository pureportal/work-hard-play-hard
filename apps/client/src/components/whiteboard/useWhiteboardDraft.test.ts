import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWhiteboardDraft } from "./useWhiteboardDraft";

describe("whiteboard save history", () => {
  it("preserves typing during a save and undo after acknowledgement", () => {
    const original = { text: "", cards: [] };
    const { result, rerender } = renderHook(({ document, revision, saving }) => useWhiteboardDraft(document, revision, saving), { initialProps: { document: original, revision: 0, saving: false } });
    act(() => result.current.change((document) => ({ ...document, text: "First" })));
    rerender({ document: original, revision: 0, saving: true });
    act(() => result.current.change((document) => ({ ...document, text: "Still typing" })));
    act(() => result.current.saved({ text: "First", cards: [] }, 1));
    rerender({ document: { text: "First", cards: [] }, revision: 1, saving: false });
    expect(result.current.document.text).toBe("Still typing");
    expect(result.current.dirty).toBe(true);
    expect(result.current.conflicts).toEqual([]);
    act(() => result.current.undo());
    expect(result.current.document.text).toBe("First");
    expect(result.current.dirty).toBe(false);
    act(() => result.current.undo());
    expect(result.current.document.text).toBe("");
    expect(result.current.dirty).toBe(true);
  });

  it("keeps unresolved conflicts through additional remote updates", () => {
    const original = { text: "Start", cards: [] };
    const { result, rerender } = renderHook(({ document, revision }) => useWhiteboardDraft(document, revision, false), { initialProps: { document: original, revision: 0 } });
    act(() => result.current.change((document) => ({ ...document, text: "Mine" })));
    rerender({ document: { text: "Theirs", cards: [] }, revision: 1 });
    rerender({ document: { text: "Their next edit", cards: [] }, revision: 2 });
    expect(result.current.conflicts).toEqual([{ field: "text" }]);
    act(() => result.current.resolve(result.current.conflicts[0]!, true));
    expect(result.current.document.text).toBe("Their next edit");
    expect(result.current.dirty).toBe(false);
  });
});
