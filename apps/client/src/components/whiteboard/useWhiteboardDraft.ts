import { useEffect, useReducer } from "react";
import type { WhiteboardDocument } from "@workhard/shared";
import { conflictValue, mergeWhiteboard, resolveWhiteboardConflict, same, type WhiteboardConflict } from "./whiteboard-merge";

interface Change { before: WhiteboardDocument; after: WhiteboardDocument }
interface Draft {
  revision: number;
  base: WhiteboardDocument;
  document: WhiteboardDocument;
  past: Change[];
  future: Change[];
  conflicts: WhiteboardConflict[];
}
type Action =
  | { type: "remote"; document: WhiteboardDocument; revision: number }
  | { type: "saved"; document: WhiteboardDocument; revision: number }
  | { type: "change"; update: (current: WhiteboardDocument) => WhiteboardDocument }
  | { type: "resolve"; conflict: WhiteboardConflict; theirs: boolean }
  | { type: "undo" | "redo" | "reset" };

function reducer(state: Draft, action: Action): Draft {
  if (action.type === "remote") {
    if (action.revision <= state.revision) return state;
    const merged = mergeWhiteboard(state.base, state.document, action.document);
    const conflicts = [...state.conflicts, ...merged.conflicts].filter((conflict, index, all) =>
      all.findIndex((candidate) => same(candidate, conflict)) === index && !same(conflictValue(merged.document, conflict), conflictValue(action.document, conflict)));
    return { ...state, base: action.document, revision: action.revision, document: merged.document, conflicts };
  }
  if (action.type === "saved") return { ...state, base: action.document, revision: action.revision };
  if (action.type === "reset") return { ...state, document: state.base, conflicts: [], past: [], future: [] };
  if (action.type === "resolve") return {
    ...state,
    document: action.theirs ? resolveWhiteboardConflict(state.document, state.base, action.conflict) : state.document,
    conflicts: state.conflicts.filter((conflict) => !same(conflict, action.conflict)),
  };
  if (action.type === "change") {
    const document = action.update(state.document);
    if (same(state.document, document)) return state;
    return { ...state, document, past: [...state.past, { before: state.document, after: document }].slice(-50), future: [] };
  }
  const undo = action.type === "undo";
  const change = undo ? state.past.at(-1) : state.future[0];
  if (!change) return state;
  const merged = mergeWhiteboard(undo ? change.after : change.before, undo ? change.before : change.after, state.document);
  return { ...state, ...merged, past: undo ? state.past.slice(0, -1) : [...state.past, change], future: undo ? [change, ...state.future] : state.future.slice(1) };
}

export function useWhiteboardDraft(document: WhiteboardDocument, revision: number, saving: boolean) {
  const [draft, dispatch] = useReducer(reducer, { revision, base: document, document, past: [], future: [], conflicts: [] });
  const dirty = !same(draft.base, draft.document);

  useEffect(() => {
    if (!saving) dispatch({ type: "remote", document, revision });
  }, [document, revision, saving, draft.revision]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  return {
    ...draft, dirty,
    change: (update: (current: WhiteboardDocument) => WhiteboardDocument) => dispatch({ type: "change", update }),
    undo: () => dispatch({ type: "undo" }), redo: () => dispatch({ type: "redo" }),
    canUndo: Boolean(draft.past.length) && !draft.conflicts.length, canRedo: Boolean(draft.future.length) && !draft.conflicts.length,
    reset: () => dispatch({ type: "reset" }),
    saved: (saved: WhiteboardDocument, savedRevision: number) => dispatch({ type: "saved", document: saved, revision: savedRevision }),
    resolve: (conflict: WhiteboardConflict, theirs: boolean) => dispatch({ type: "resolve", conflict, theirs }),
  };
}
