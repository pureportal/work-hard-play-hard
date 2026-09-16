import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Shuffle } from "lucide-react";
import { useState } from "react";
import {
  CHARACTER_FACES, CHARACTER_HAIRSTYLES,
  CHARACTER_HEADWEAR, CHARACTER_OUTFITS, characterAppearanceKey, randomCharacterAppearance,
  type CharacterAppearance, type CharacterDirection, type CharacterMotion,
} from "@workhard/shared";
import { CharacterPreview } from "./CharacterPreview";
import { useHorizontalWheelScroll } from "../hooks/useHorizontalWheelScroll";

const categories = [
  { id: "face", label: "Face", crop: "face", options: CHARACTER_FACES, names: ["Calm", "Bright", "Fierce", "Dreamy", "Wink", "Shy"] },
  { id: "hairstyle", label: "Hair", crop: "hair", options: CHARACTER_HAIRSTYLES, names: ["Rose bob", "Midnight spikes", "Lavender ponytail", "Pink twintails", "Honey waves", "Mint braid", "Ash pixie", "Chestnut curtains", "Ink hime cut", "Silver tousle", "Peach buns", "Copper side sweep", "Cocoa curls", "Pearl braid"] },
  { id: "upperBody", label: "Tops", crop: "upper", options: CHARACTER_OUTFITS, names: ["Bomber jacket", "Ranger jacket", "Moon armor", "Sailor blouse", "Honey cardigan", "Lilac kimono", "Traveler jacket", "Festival haori", "Neon runner", "Corsair coat", "Orbital suit", "Dragon armor", "Harlequin tunic", "Froggy hoodie", "Biker vest", "Velvet corset", "Starlight halter", "Sunset crop top"] },
  { id: "lowerBody", label: "Bottoms", crop: "lower", options: CHARACTER_OUTFITS, names: ["Denim trousers", "Ranger breeches", "Moon breeches", "Sailor trousers", "Plum trousers", "Petal hakama", "Travel breeches", "Indigo hakama", "Circuit cargos", "Corsair trousers", "Orbital trousers", "Dragon greaves", "Harlequin trousers", "Lily-pad shorts", "Ripped black jeans", "Velvet slit skirt", "Starlight mini", "Sunset shorts"] },
  { id: "shoes", label: "Shoes", crop: "shoes", options: CHARACTER_OUTFITS, names: ["Sneakers", "Leather boots", "Moon boots", "Navy shoes", "Honey shoes", "Rose shoes", "Travel boots", "Tabi sandals", "Neon high-tops", "Corsair boots", "Moonwalk boots", "Dragon claws", "Jester slippers", "Frog slippers", "Studded boots", "Velvet heels", "Silver platforms", "Sunset sandals"] },
  { id: "headwear", label: "Headwear", crop: "headwear", options: CHARACTER_HEADWEAR, names: ["None", "Star cap", "Moon hat", "Beret", "Ribbon", "Cat ears", "Blossom clip", "Goggles"] },
] as const;

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
            <div className="character-segmented" role="group" aria-label="Animation">
              {(["idle", "walk", "sit", "listen", "sit-listen"] as const).map((value) => <button key={value} type="button" aria-pressed={motion === value} onClick={() => setMotion(value)}>{{ idle: "Idle", walk: "Walk", sit: "Sit", listen: "Listen", "sit-listen": "Sit & listen" }[value]}</button>)}
            </div>
            <div className="character-directions" role="group" aria-label="Facing direction">
              {([["down", "Front", ArrowDown], ["left", "Left", ArrowLeft], ["up", "Back", ArrowUp], ["right", "Right", ArrowRight]] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" aria-label={label} aria-pressed={direction === value} onClick={() => setDirection(value)}><Icon size={16} /></button>
              ))}
            </div>
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
            {category.options.map((option, index) => (
              <button key={option} type="button" disabled={saving} className="character-option" aria-pressed={draft[category.id] === option}
                onClick={() => change(category.id, option)}>
                <CharacterPreview appearance={{ ...draft, [category.id]: option }} crop={category.crop} direction={direction} />
                <span>{category.names[index]}</span>
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
