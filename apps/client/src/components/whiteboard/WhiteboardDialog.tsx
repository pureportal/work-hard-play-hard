import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Columns3, FileText, ImagePlus, LayoutDashboard, Presentation, Redo2, Smile, StickyNote, Undo2, X } from "lucide-react";
import { WHITEBOARD_CARD_LIMIT, WHITEBOARD_DOCUMENT_BYTES, WHITEBOARD_TEXT_LIMIT, type WhiteboardCard, type WhiteboardStatus, type WhiteboardView, type WorkObjectState } from "@workhard/shared";
import { useModalFocus } from "../../hooks/useModalFocus";
import { IconButton } from "../IconButton";
import type { WorkObjectDialogProps } from "../WorkObjectDialog";
import { WhiteboardBoard } from "./WhiteboardBoard";
import { WhiteboardCanvas } from "./WhiteboardCanvas";
import { WhiteboardCardEditor } from "./WhiteboardCardEditor";
import { WhiteboardImagePicker } from "./WhiteboardImagePicker";
import { createWhiteboardCard, moveBoardCard, positionCard } from "./whiteboard-model";
import { WhiteboardConflicts } from "./WhiteboardConflicts";
import { WhiteboardStickers } from "./WhiteboardStickers";
import { useWhiteboardDraft } from "./useWhiteboardDraft";
import "../../whiteboard.css";

const views = [{ id: "canvas", label: "Canvas", icon: LayoutDashboard }, { id: "board", label: "Board", icon: Columns3 }, { id: "notes", label: "Notes", icon: FileText }] as const;

export function WhiteboardDialog({ title, state, unavailable, onUpdate, onUploadImage, onClose, modal = true }: WorkObjectDialogProps & { state: Extract<WorkObjectState, { kind: "whiteboard" }> }) {
  const [view, setView] = useState<WhiteboardView>(state.document.text && !state.document.cards.length ? "notes" : "canvas");
  const [selectedId, setSelectedId] = useState<string>();
  const [imageOpen, setImageOpen] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const canvas = useRef<{ position: () => { x: number; y: number } }>(null);
  const [saving, setSaving] = useState(false);
  const editing = useWhiteboardDraft(state.document, state.revision, saving);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const close = () => {
    if (saving || uploading) return;
    if (editing.dirty) setDiscarding(true);
    else onClose();
  };
  const dialogRef = useModalFocus<HTMLElement>(close, true, modal);
  const disabled = uploading || Boolean(unavailable);
  const { cards } = editing.document;
  const selected = cards.find((card) => card.id === selectedId);
  const full = cards.length >= WHITEBOARD_CARD_LIMIT;
  const peers = selected ? cards.filter((card) => card.status === selected.status) : [];
  const selectedIndex = peers.findIndex((card) => card.id === selectedId);

  const closeCardEditor = () => {
    setSelectedId(undefined);
    dialogRef.current?.focus();
  };

  const change: typeof editing.change = (update) => {
    setSaved(false);
    setError("");
    editing.change(update);
  };

  const changeCard = (next: WhiteboardCard) => {
    if (disabled) return;
    change((current) => ({ ...current, cards: current.cards.map((card) => card.id === next.id ? next : card) }));
  };

  const addCard = (status: WhiteboardStatus = "todo", src?: string, position = canvas.current?.position(), sticker?: Pick<WhiteboardCard, "title" | "text" | "color">) => {
    if (unavailable || full) return;
    let card = { ...createWhiteboardCard(cards, status, src), ...sticker };
    if (position) card = positionCard(card, position.x, position.y);
    change((current) => ({ ...current, cards: [...current.cards, card] }));
    setSelectedId(card.id);
    setImageOpen(false);
    setStickersOpen(false);
  };

  const save = async () => {
    if ((!editing.dirty && !error) || disabled || saving || editing.conflicts.length) return;
    setError("");
    if (editing.document.cards.length > WHITEBOARD_CARD_LIMIT) {
      setError("The board is full. Remove a card before saving.");
      return;
    }
    if (new TextEncoder().encode(JSON.stringify(editing.document)).byteLength > WHITEBOARD_DOCUMENT_BYTES) {
      setError("The board is full. Shorten notes or remove cards before saving.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate(editing.revision, { type: "whiteboard.save", document: editing.document });
      editing.saved(editing.document, editing.revision + 1);
      setSaved(true);
    } catch (reason) {
      if (!(reason instanceof Error && "code" in reason && reason.code === "WORK_OBJECT_CONFLICT")) {
        setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!editing.dirty || saving || disabled || error || discarding || editing.conflicts.length) return;
    const timer = window.setTimeout(() => void saveRef.current(), 700);
    return () => window.clearTimeout(timer);
  }, [editing.document, editing.dirty, editing.conflicts.length, saving, disabled, error, discarding]);

  const shortcuts = (event: KeyboardEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    if (event.key.toLowerCase() !== "z" || disabled || (event.target instanceof Element && event.target.closest("input, textarea"))) return;
    event.preventDefault();
    setSaved(false);
    if (event.shiftKey) editing.redo();
    else editing.undo();
  };

  return <div className={modal ? "modal-backdrop" : "work-object-layer"}>
    <section ref={dialogRef} className="work-object-dialog whiteboard-dialog" role="dialog" aria-modal={modal || undefined} aria-labelledby="work-object-title" tabIndex={-1} aria-busy={saving || uploading} onKeyDown={shortcuts}>
      <header><Presentation size={23} aria-hidden="true" /><h2 id="work-object-title">{title}</h2><IconButton label="Close board" icon={X} onClick={close} disabled={saving || uploading} /></header>
      <div className="whiteboard-toolbar">
        <div className="whiteboard-views" role="group" aria-label="Whiteboard view">
          {views.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={view === id} disabled={uploading} onClick={() => { setView(id); setSelectedId(undefined); setImageOpen(false); setStickersOpen(false); }}>
            <Icon size={16} aria-hidden="true" />{label}
          </button>)}
        </div>
        <div className="whiteboard-history">
          <IconButton label="Undo" icon={Undo2} disabled={disabled || !editing.canUndo} onClick={() => { setSaved(false); editing.undo(); }} />
          <IconButton label="Redo" icon={Redo2} disabled={disabled || !editing.canRedo} onClick={() => { setSaved(false); editing.redo(); }} />
        </div>
        {view !== "notes" && <div className="whiteboard-tools">
          <button className="secondary-button" disabled={disabled || full} onClick={() => addCard()}><StickyNote size={16} aria-hidden="true" />Sticky note</button>
          <button className="secondary-button" disabled={disabled || full} aria-expanded={imageOpen} onClick={() => { setImageOpen((open) => !open); setStickersOpen(false); setSelectedId(undefined); }}><ImagePlus size={16} aria-hidden="true" />Image</button>
          <button className="secondary-button" disabled={disabled || full} aria-expanded={stickersOpen} onClick={() => { setStickersOpen((open) => !open); setImageOpen(false); setSelectedId(undefined); }}><Smile size={16} aria-hidden="true" />Funny notes</button>
        </div>}
      </div>
      {stickersOpen && <WhiteboardStickers onAdd={(sticker) => addCard("todo", undefined, canvas.current?.position(), sticker)} />}
      {imageOpen && <WhiteboardImagePicker disabled={saving || Boolean(unavailable) || full} onUpload={onUploadImage} onBusy={setUploading} onAdd={(src) => addCard("todo", src)} onClose={() => { setImageOpen(false); dialogRef.current?.focus(); }} />}
      <div className={`whiteboard-workspace${selected && view !== "notes" ? " has-editor" : ""}`}>
        <div className="whiteboard-surface">
          {view === "canvas" && <WhiteboardCanvas ref={canvas} cards={cards} disabled={disabled} selectedId={selectedId} onSelect={setSelectedId} onAdd={(position) => addCard("todo", undefined, position)} onChange={(position) => {
            if (!disabled) change((current) => ({ ...current, cards: current.cards.map((card) => card.id === position.id
              ? { ...card, x: position.x, y: position.y, width: position.width, height: position.height } : card) }));
          }} />}
          {view === "board" && <WhiteboardBoard cards={cards} disabled={disabled} full={full} selectedId={selectedId} onSelect={setSelectedId} onAdd={addCard}
            onMove={(id, status, beforeId) => { if (!disabled) change((current) => moveBoardCard(current, id, status, beforeId)); }} />}
          {view === "notes" && <textarea className="whiteboard-notes" aria-label="Notes" value={editing.document.text} maxLength={WHITEBOARD_TEXT_LIMIT} readOnly={disabled}
            onChange={(event) => change((current) => ({ ...current, text: event.target.value }))} />}
        </div>
        {selected && view !== "notes" && <WhiteboardCardEditor card={selected} disabled={disabled} full={full} onChange={changeCard} canMoveUp={selectedIndex > 0} canMoveDown={selectedIndex < peers.length - 1}
          onClose={closeCardEditor}
          onRemove={() => { change((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== selected.id) })); closeCardEditor(); }}
          onDuplicate={() => {
            const card = positionCard({ ...selected, id: crypto.randomUUID() }, selected.x + 30, selected.y + 30);
            change((current) => ({ ...current, cards: [...current.cards, card] }));
            setSelectedId(card.id);
          }}
          onReorder={(direction) => {
            const beforeId = direction < 0 ? peers[selectedIndex - 1]?.id : peers[selectedIndex + 2]?.id;
            change((current) => moveBoardCard(current, selected.id, selected.status, beforeId));
          }} />}
      </div>
      <footer>
        {full && <p className="work-object-error" role="status">Remove a card to add another.</p>}
        {unavailable && <p className="work-object-error" role="status">{unavailable}</p>}
        {error && <p className="work-object-error" role="alert">{error}</p>}
        {editing.conflicts.length > 0 && <WhiteboardConflicts conflicts={editing.conflicts} document={editing.document} remote={editing.base}
          onResolve={(conflict, theirs) => { editing.resolve(conflict, theirs); setError(""); }} />}
        {discarding ? <div className="work-object-discard">
          <p>Discard unsaved changes?</p>
          <div className="work-object-buttons"><button className="secondary-button" onClick={() => { setDiscarding(false); dialogRef.current?.focus(); }}>Keep editing</button><button className="primary-button" onClick={onClose}>Discard</button></div>
        </div> : <div className="work-object-form">
          {cards.length > 0 && <div className="whiteboard-progress"><progress aria-label="Cards completed" max={cards.length} value={cards.filter((card) => card.status === "done").length} /><span>{cards.filter((card) => card.status === "done").length}/{cards.length}</span></div>}
          <span className="work-object-save-state" role="status">{saving ? "Saving…" : editing.dirty ? "Unsaved changes" : saved ? "Saved" : ""}</span>
          {editing.dirty && <button className="secondary-button" disabled={saving || uploading} onClick={() => setDiscarding(true)}>Discard</button>}
          <button className="primary-button" disabled={disabled || saving || (!editing.dirty && !error) || Boolean(editing.conflicts.length)} onClick={() => void save()}>Save</button>
        </div>}
      </footer>
    </section>
  </div>;
}
