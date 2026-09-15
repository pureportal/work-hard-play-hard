import { describe, expect, it } from "vitest";
import { WHITEBOARD_CARD_LIMIT, WHITEBOARD_DOCUMENT_BYTES, type WhiteboardCard } from "@workhard/shared";
import { whiteboardDocumentSchema } from "./whiteboard-schema.js";
import { applyWorkObjectEdit, workObjectEditSchema, workObjectStateSchema } from "./work-object-state.js";

const card: WhiteboardCard = { id: "idea", kind: "note", title: "Ship it", text: "Review the prototype", color: "yellow", status: "doing", dueDate: "2026-10-01", x: 80, y: 120, width: 240, height: 220 };

describe("whiteboard documents", () => {
  it("saves structured cards without sharing mutable references", () => {
    const document = { text: "Meeting notes", cards: [card, { ...card, id: "reference", kind: "image" as const, src: "https://example.test/art.png" }] };
    const edit = workObjectEditSchema.parse({ type: "whiteboard.save", document });
    const state = applyWorkObjectEdit({ kind: "whiteboard", revision: 7, document: { text: "", cards: [] } }, edit);
    expect(state).toEqual({ kind: "whiteboard", revision: 8, document });
    expect(workObjectStateSchema.safeParse(state).success).toBe(true);
    document.cards[0]!.title = "Changed outside the board";
    expect(state).toMatchObject({ document: { cards: [{ title: "Ship it" }, { title: "Ship it" }] } });
  });

  it.each([
    { id: "" }, { x: -1 }, { y: NaN }, { width: 179 }, { height: 481 }, { x: 1590 }, { y: 990 },
    { status: "unknown" }, { color: "red" }, { dueDate: "2026-02-30" }, { dueDate: "next week" }, { title: "x".repeat(121) }, { text: "x".repeat(1001) },
  ])("rejects invalid card fields: %j", (fields) => {
    expect(whiteboardDocumentSchema.safeParse({ text: "", cards: [{ ...card, ...fields }] }).success).toBe(false);
  });

  it.each(["javascript:alert(1)", "data:image/svg+xml,hello", "file:///tmp/image.png", "http://example.test/image.png", "//example.test/image.png", "https://user:password@example.test/image.png", "https://example.test\\@evil.test/image.png", "/v1/whiteboards/images/../../secret"])("rejects unsafe image sources: %s", (src) => {
    expect(whiteboardDocumentSchema.safeParse({ text: "", cards: [{ ...card, kind: "image", src }] }).success).toBe(false);
  });

  it("accepts stored images and rejects duplicate IDs and excessive document sizes", () => {
    expect(whiteboardDocumentSchema.safeParse({ text: "", cards: [{ ...card, kind: "image", src: `/v1/whiteboards/images/${"a".repeat(64)}` }] }).success).toBe(true);
    expect(whiteboardDocumentSchema.safeParse({ text: "", cards: [card, card] }).success).toBe(false);
    const cards = Array.from({ length: WHITEBOARD_CARD_LIMIT + 1 }, (_, index) => ({ ...card, id: String(index) }));
    expect(whiteboardDocumentSchema.safeParse({ text: "", cards }).success).toBe(false);
    const document = { text: "", cards: cards.slice(0, WHITEBOARD_CARD_LIMIT).map((value) => ({ ...value, title: "界".repeat(120), text: "界".repeat(1000) })) };
    expect(Buffer.byteLength(JSON.stringify(document))).toBeGreaterThan(WHITEBOARD_DOCUMENT_BYTES);
    expect(whiteboardDocumentSchema.safeParse(document).success).toBe(false);
  });
});
