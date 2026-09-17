import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  CHECKLIST_ITEM_LIMIT,
  CHECKLIST_TEXT_LIMIT,
  type WorkObjectEdit,
  type WorkObjectState,
} from "@workhard/shared";
import { useModalFocus } from "../hooks/useModalFocus";
import { IconButton } from "./IconButton";
import { SurfaceHeader } from "./SurfaceHeader";
import "../work-objects.css";
import { WhiteboardDialog } from "./whiteboard/WhiteboardDialog";

export interface WorkObjectDialogProps {
  title: string;
  modal?: boolean;
  state: WorkObjectState;
  unavailable?: string | undefined;
  onUpdate: (baseRevision: number, edit: WorkObjectEdit) => Promise<void>;
  onUploadImage?: ((file: File) => Promise<string>) | undefined;
  onClose: () => void;
}

export function WorkObjectDialog(props: WorkObjectDialogProps) {
  return props.state.kind === "whiteboard"
    ? <WhiteboardDialog {...props} state={props.state} />
    : <ChecklistDialog {...props} state={props.state} />;
}

function ChecklistDialog({ title, state, unavailable, onUpdate, onClose, modal = true }: WorkObjectDialogProps & { state: Extract<WorkObjectState, { kind: "checklist" }> }) {
  const [draft, setDraft] = useState<{ revision: number; text: string; itemId?: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [saved, setSaved] = useState(false);
  const close = () => {
    if (saving) return;
    if (draft) setDiscarding(true);
    else onClose();
  };
  const dialogRef = useModalFocus<HTMLElement>(close, true, modal);
  const stale = Boolean(draft && draft.revision !== state.revision);
  const disabled = saving || Boolean(unavailable);
  const text = draft?.text ?? "";

  useEffect(() => {
    if (!draft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [draft]);

  const save = async (edit: WorkObjectEdit, baseRevision = state.revision) => {
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await onUpdate(baseRevision, edit);
      setDraft(undefined);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const changeText = (value: string) => {
    setSaved(false);
    setDraft((current) => ({ revision: current?.revision ?? state.revision, ...current, text: value }));
  };

  const submitDraft = () => {
    if (!draft || disabled || stale) return;
    if (draft.text.trim()) void save(draft.itemId
      ? { type: "checklist.rename", itemId: draft.itemId, text: draft.text.trim() }
      : { type: "checklist.add", text: draft.text.trim() }, draft.revision);
  };

  return (
    <div className={modal ? "modal-backdrop" : "work-object-layer"}>
      <section ref={dialogRef} className="work-object-dialog" role="dialog" aria-modal={modal || undefined} aria-labelledby="work-object-title" tabIndex={-1} aria-busy={saving}>
        <SurfaceHeader className="work-object-header" title={title} titleId="work-object-title" closeLabel="Close board" closeDisabled={saving} onClose={close} />
        <div className="work-object-content">
          {state.items.length > 0 && (
            <div className="checklist-progress">
              <progress aria-label="Checklist progress" value={state.items.filter((item) => item.completed).length} max={state.items.length} />
              <span>{state.items.filter((item) => item.completed).length}/{state.items.length}</span>
            </div>
          )}
          <ul className="checklist-items">
            {state.items.map((item) => (
              <li key={item.id} className={item.completed ? "completed" : ""}>
                <label><input type="checkbox" checked={item.completed} disabled={disabled || Boolean(draft)}
                  onChange={(event) => void save({ type: "checklist.complete", itemId: item.id, completed: event.target.checked })} />
                  <span>{item.text}</span></label>
                <IconButton label={`Edit ${item.text}`} icon={Pencil} disabled={disabled || Boolean(draft)}
                  onClick={() => { setSaved(false); setDraft({ revision: state.revision, itemId: item.id, text: item.text }); }} />
                <IconButton label={`Remove ${item.text}`} icon={Trash2} disabled={disabled || Boolean(draft)}
                  onClick={() => void save({ type: "checklist.remove", itemId: item.id })} />
              </li>
            ))}
          </ul>
          {stale && (
            <div className="work-object-conflict" role="alert">
              <p>The board changed. Your draft is kept.</p>
              <div className="work-object-buttons">
                <button className="secondary-button" onClick={() => { setDraft(undefined); setError(""); }}>Use latest</button>
                <button className="secondary-button" disabled={disabled} onClick={() => {
                  setDraft((current) => current ? { ...current, revision: state.revision } : current);
                  setError("");
                }}>Keep draft</button>
              </div>
            </div>
          )}
        </div>
        <footer>
          {unavailable && <p role="status" className="work-object-error">{unavailable}</p>}
          {error && <p role="alert" className="work-object-error">{error}</p>}
          {discarding ? (
            <div className="work-object-discard">
              <p>Discard unsaved changes?</p>
              <div className="work-object-buttons">
                <button className="secondary-button" onClick={() => setDiscarding(false)}>Keep editing</button>
                <button className="primary-button" onClick={onClose}>Discard</button>
              </div>
            </div>
          ) : (
            <form className="work-object-form" onSubmit={(event) => { event.preventDefault(); submitDraft(); }}>
              <input aria-label={draft?.itemId ? "Edit item" : "New item"} placeholder={draft?.itemId ? "Edit item" : "New item"}
                maxLength={CHECKLIST_TEXT_LIMIT} value={text} disabled={disabled || (!draft?.itemId && state.items.length >= CHECKLIST_ITEM_LIMIT)}
                onChange={(event) => changeText(event.target.value)} />
              {state.items.length >= CHECKLIST_ITEM_LIMIT && !draft?.itemId
                && <p className="work-object-error">Remove an item to add another.</p>}
              <span className="work-object-save-state" role="status">{saving ? "Saving…" : saved ? "Saved" : ""}</span>
              {draft && <button className="secondary-button" type="button" disabled={saving}
                onClick={() => { setDraft(undefined); setError(""); }}>Cancel</button>}
              <button className="primary-button" type="submit" disabled={disabled || !draft || stale || !text.trim()}>
                {!draft?.itemId ? "Add" : "Save"}
              </button>
            </form>
          )}
        </footer>
      </section>
    </div>
  );
}
