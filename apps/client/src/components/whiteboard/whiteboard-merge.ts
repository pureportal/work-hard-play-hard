import type { WhiteboardCard, WhiteboardDocument } from "@workhard/shared";

export interface WhiteboardConflict {
  cardId?: string;
  field: "card" | "order" | "text" | "title" | "color" | "status" | "dueDate" | "geometry" | "src";
}

export function same(first: unknown, second: unknown): boolean {
  if (first === second) return true;
  if (!first || !second || typeof first !== "object" || typeof second !== "object") return false;
  if (Array.isArray(first) !== Array.isArray(second)) return false;
  const left = first as Record<string, unknown>, right = second as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]));
}

const fields = ["title", "text", "color", "status", "dueDate", "geometry", "src"] as const;

function cardValue(card: WhiteboardCard | undefined, field: WhiteboardConflict["field"]): unknown {
  if (!card || field === "card") return card;
  if (field === "geometry") return [card.x, card.y, card.width, card.height];
  if (field === "src") return card.kind === "image" ? card.src : undefined;
  return field === "order" ? undefined : card[field];
}

export function conflictValue(document: WhiteboardDocument, conflict: WhiteboardConflict): unknown {
  if (conflict.cardId) return cardValue(document.cards.find((card) => card.id === conflict.cardId), conflict.field);
  return conflict.field === "order" ? document.cards.map((card) => card.id) : document.text;
}

function copyField(target: WhiteboardCard, source: WhiteboardCard, field: typeof fields[number]): WhiteboardCard {
  if (field === "geometry") return { ...target, x: source.x, y: source.y, width: source.width, height: source.height };
  if (field === "src") return target.kind === "image" && source.kind === "image" ? { ...target, src: source.src } : target;
  return { ...target, [field]: source[field] };
}

export function resolveWhiteboardConflict(document: WhiteboardDocument, remote: WhiteboardDocument, conflict: WhiteboardConflict): WhiteboardDocument {
  if (!conflict.cardId) {
    if (conflict.field === "text") return { ...document, text: remote.text };
    const ids = remote.cards.map((card) => card.id);
    return { ...document, cards: [...document.cards].sort((a, b) => (ids.indexOf(a.id) < 0 ? ids.length : ids.indexOf(a.id)) - (ids.indexOf(b.id) < 0 ? ids.length : ids.indexOf(b.id))) };
  }
  const other = remote.cards.find((card) => card.id === conflict.cardId);
  if (conflict.field === "card") return { ...document, cards: [...document.cards.filter((card) => card.id !== conflict.cardId), ...(other ? [other] : [])] };
  if (!other || conflict.field === "order") return document;
  const field = conflict.field;
  return { ...document, cards: document.cards.map((card) => card.id === conflict.cardId ? copyField(card, other, field) : card) };
}

export function mergeWhiteboard(base: WhiteboardDocument, local: WhiteboardDocument, remote: WhiteboardDocument) {
  const conflicts: WhiteboardConflict[] = [];
  const choose = (before: unknown, mine: unknown, theirs: unknown, conflict: WhiteboardConflict) => {
    if (same(before, mine)) return false;
    if (!same(before, theirs) && !same(mine, theirs)) conflicts.push(conflict);
    return true;
  };
  const text = choose(base.text, local.text, remote.text, { field: "text" }) ? local.text : remote.text;
  const byId = (document: WhiteboardDocument) => new Map(document.cards.map((card) => [card.id, card]));
  const before = byId(base), mine = byId(local), theirs = byId(remote);
  const cards = new Map<string, WhiteboardCard>();
  for (const id of new Set([...theirs.keys(), ...mine.keys(), ...before.keys()])) {
    const original = before.get(id), left = mine.get(id), right = theirs.get(id);
    if (!original || !left || !right || left.kind !== right.kind) {
      const card = choose(original, left, right, { cardId: id, field: "card" }) ? left : right;
      if (card) cards.set(id, card);
      continue;
    }
    let card = right;
    for (const field of fields) {
      if (choose(cardValue(original, field), cardValue(left, field), cardValue(right, field), { cardId: id, field })) card = copyField(card, left, field);
    }
    cards.set(id, card);
  }
  const common = new Set(base.cards.filter((card) => mine.has(card.id) && theirs.has(card.id)).map((card) => card.id));
  const order = (document: WhiteboardDocument) => document.cards.filter((card) => common.has(card.id)).map((card) => card.id);
  const localOrder = choose(order(base), order(local), order(remote), { field: "order" });
  const primary = localOrder ? local : remote;
  const secondary = localOrder ? remote : local;
  const ids = primary.cards.map((card) => card.id).filter((id) => cards.has(id));
  for (let index = 0; index < secondary.cards.length; index++) {
    const id = secondary.cards[index]!.id;
    if (ids.includes(id) || !cards.has(id)) continue;
    const next = secondary.cards.slice(index + 1).find((card) => ids.includes(card.id));
    ids.splice(next ? ids.indexOf(next.id) : ids.length, 0, id);
  }
  return { document: { text, cards: ids.map((id) => cards.get(id)!) }, conflicts };
}
