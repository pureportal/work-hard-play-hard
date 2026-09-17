import { Shuffle } from "lucide-react";
import { useState } from "react";
import {
  characterAppearanceKey, randomCharacterAppearance,
  type CharacterAppearance, type CharacterDirection, type CharacterMotion,
} from "@workhard/shared";
import { characterCategories as categories } from "./character-options";
import { CharacterPreview } from "./CharacterPreview";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";

interface CharacterEditorProps {
  appearance: CharacterAppearance;
  onSave: (appearance: CharacterAppearance) => Promise<void>;
  onClose: () => void;
}

export function CharacterEditor({ appearance, onSave, onClose }: CharacterEditorProps) {
  const scrollCategories = useHorizontalWheelScroll();
  const [draft, setDraft] = useState<CharacterAppearance>(() => ({ ...appearance }));
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [motion, setMotion] = useState<CharacterMotion>("idle");
  const [direction, setDirection] = useState<CharacterDirection>("down");
  const category = categories[categoryIndex]!;

  const change = <K extends keyof CharacterAppearance>(key: K, value: CharacterAppearance[K]) => {
    if (draft[key] === value) return;
    setReady(false);
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const randomize = () => {
    const randomized = randomCharacterAppearance();
    if (characterAppearanceKey(randomized) === characterAppearanceKey(draft)) return;
    setReady(false);
    setDraft(randomized);
    setError("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Character could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="character-editor" aria-busy={saving}>
      <div className="character-studio">
        <div className="character-stage">
          <CharacterPreview appearance={draft} label="Character preview" motion={motion} direction={direction} onReady={setReady} />
          <div className="character-playback">
            <select aria-label="Animation" value={motion} onChange={(event) => setMotion(event.target.value as CharacterMotion)}>
              {(["idle", "walk", "sit", "listen", "sit-listen"] as const).map((value) => <option key={value} value={value}>{{ idle: "Idle", walk: "Walk", sit: "Sit", listen: "Listen", "sit-listen": "Sit & listen" }[value]}</option>)}
            </select>
            <select aria-label="Facing direction" value={direction} onChange={(event) => setDirection(event.target.value as CharacterDirection)}>
              {([["down", "Front"], ["left", "Left"], ["up", "Back"], ["right", "Right"]] as const).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" className="character-shuffle secondary-button" disabled={saving} onClick={randomize}>
              <Shuffle size={15} />Randomize
            </button>
          </div>
        </div>
        <div className="character-controls">
          <div ref={scrollCategories} className="character-categories" role="tablist" aria-label="Appearance">
            {categories.map((item, index) => (
              <button key={item.id} id={`character-tab-${item.id}`} type="button" disabled={saving} role="tab" aria-selected={index === categoryIndex}
                aria-controls="character-options" tabIndex={index === categoryIndex ? 0 : -1}
                onClick={() => setCategoryIndex(index)} onKeyDown={(event) => {
                  const next = event.key === "ArrowRight" ? (index + 1) % categories.length : event.key === "ArrowLeft" ? (index + categories.length - 1) % categories.length : event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : undefined;
                  if (next === undefined) return;
                  event.preventDefault();
                  setCategoryIndex(next);
                  document.getElementById(`character-tab-${categories[next]!.id}`)?.focus();
                }}>{item.label}</button>
            ))}
          </div>
          <div className="character-options" id="character-options" role="tabpanel" aria-labelledby={`character-tab-${category.id}`} tabIndex={0}>
            {category.options.map(({ value: option, label }) => (
              <button key={option} type="button" disabled={saving} className="character-option" aria-pressed={draft[category.id] === option}
                onClick={() => change(category.id, option)}>
                <CharacterPreview appearance={{ ...draft, [category.id]: option }} crop={category.crop} direction={direction} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="avatar-dialog-error" role="alert">{error}</p>}
      <footer className="character-editor-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={saving || !ready} onClick={() => void save()}>{saving ? "Saving…" : "Use character"}</button>
      </footer>
    </div>
  );
}
