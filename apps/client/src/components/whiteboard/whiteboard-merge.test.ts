import { describe, expect, it } from "vitest";
import type { WhiteboardCard, WhiteboardDocument } from "@workhard/shared";
import { mergeWhiteboard, resolveWhiteboardConflict } from "./whiteboard-merge";

const card: WhiteboardCard = { id: "one", kind: "note", title: "Idea", text: "", color: "yellow", status: "todo", dueDate: "", x: 60, y: 60, width: 240, height: 220 };
const base: WhiteboardDocument = { text: "Notes", cards: [card] };

describe("shared whiteboard merging", () => {
  it("keeps simultaneous additions and edits to different fields of a card", () => {
    const local = { ...base, cards: [{ ...card, title: "My title" }, { ...card, id: "two" }] };
    const remote = { text: "Their notes", cards: [{ ...card, color: "mint" as const }, { ...card, id: "three" }] };
    const merged = mergeWhiteboard(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.document.text).toBe("Their notes");
    expect(merged.document.cards.map((card) => card.id)).toEqual(["one", "three", "two"]);
    expect(merged.document.cards[0]).toMatchObject({ title: "My title", color: "mint" });
  });

  it("requires a choice for same-field changes while preserving independent changes", () => {
    const local = { ...base, cards: [{ ...card, title: "Mine", color: "pink" as const }] };
    const remote = { ...base, cards: [{ ...card, title: "Theirs", status: "doing" as const }] };
    const merged = mergeWhiteboard(base, local, remote);
    expect(merged.conflicts).toEqual([{ cardId: "one", field: "title" }]);
    expect(resolveWhiteboardConflict(merged.document, remote, merged.conflicts[0]!).cards[0]).toMatchObject({ title: "Theirs", color: "pink", status: "doing" });
  });

  it("does not silently delete a card a teammate edited", () => {
    const remote = { ...base, cards: [{ ...card, text: "Please keep this" }] };
    const merged = mergeWhiteboard(base, { ...base, cards: [] }, remote);
    expect(merged.conflicts).toEqual([{ cardId: "one", field: "card" }]);
    expect(resolveWhiteboardConflict(merged.document, remote, merged.conflicts[0]!).cards).toEqual(remote.cards);
  });

  it("undoes only the local field and keeps a teammate's later edit", () => {
    const changed = { ...base, cards: [{ ...card, color: "blue" as const }] };
    const latest = { ...changed, cards: [{ ...changed.cards[0]!, title: "Teammate's title" }] };
    expect(mergeWhiteboard(changed, base, latest)).toEqual({ document: { ...base, cards: [{ ...card, title: "Teammate's title" }] }, conflicts: [] });
  });

  it("keeps concurrent additions when a card is reordered", () => {
    const original = { text: "", cards: [card, { ...card, id: "two" }] };
    const local = { ...original, cards: [...original.cards].reverse() };
    const remote = { ...original, cards: [...original.cards, { ...card, id: "three" }] };
    const merged = mergeWhiteboard(original, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.document.cards.map((card) => card.id)).toEqual(["two", "one", "three"]);
  });

  it("reports conflicting moves as a single position and size choice", () => {
    expect(mergeWhiteboard(base, { ...base, cards: [{ ...card, x: 1000 }] }, { ...base, cards: [{ ...card, width: 480 }] }).conflicts).toEqual([{ cardId: "one", field: "geometry" }]);
  });
});
