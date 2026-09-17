import { useEffect, useRef, useState } from "react";
import { characterAppearanceKey, getCharacterFrame, type CharacterAppearance, type CharacterDirection, type CharacterMotion } from "@workhard/shared";
import { renderCharacter } from "../character-renderer";
import { CharacterAnimation } from "../character-animation";

const crops = {
  full: [24, 0, 72, 120],
  portrait: [36, 18, 48, 48],
  face: [42, 33, 36, 34],
  hair: [26, 8, 68, 80],
  headwear: [32, 4, 56, 54],
  upper: [38, 61, 44, 30],
  lower: [40, 82, 40, 25],
  shoes: [42, 103, 36, 15],
} as const;

interface CharacterPreviewProps {
  appearance: CharacterAppearance;
  crop?: keyof typeof crops;
  className?: string;
  label?: string;
  motion?: CharacterMotion;
  direction?: CharacterDirection;
  onReady?: (ready: boolean) => void;
}

export function CharacterPreview({ appearance, crop = "full", className = "", label, motion, direction = "down", onReady }: CharacterPreviewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(new CharacterAnimation());
  const appearanceRef = useRef(appearance);
  const onReadyRef = useRef(onReady);
  appearanceRef.current = appearance;
  onReadyRef.current = onReady;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const key = characterAppearanceKey(appearance);
  const [cropX, cropY, cropWidth, cropHeight] = crops[crop];
  const canvasWidth = crop === "full" ? cropWidth : Math.max(cropWidth, cropHeight);
  const canvasHeight = crop === "full" ? cropHeight : canvasWidth;

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let removeMotionListener: (() => void) | undefined;
    setError("");
    onReadyRef.current?.(false);
    const context = ref.current?.getContext("2d");
    if (!context) {
      setError("Character preview is unavailable in this browser.");
      return;
    }
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const still = getCharacterFrame("idle", direction, 0);
    const region = motion ? undefined : { x: still.x + cropX, y: still.y + cropY, width: cropWidth, height: cropHeight };
    void renderCharacter(appearanceRef.current, region).then((atlas) => {
      if (cancelled) return;
      const startedAt = performance.now();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let previousFrame = "";
      const draw = (now: number) => {
        if (cancelled) return;
        const animate = motion && !reducedMotion.matches;
        const animation = animate ? animationRef.current.frame(now, motion!, direction) : getCharacterFrame(motion ?? "idle", direction, 0);
        const frame = animation;
        const frameKey = `${animation.x}:${animation.y}`;
        if (frameKey !== previousFrame) {
          previousFrame = frameKey;
          context.clearRect(0, 0, canvasWidth, canvasHeight);
          context.imageSmoothingEnabled = false;
          context.drawImage(atlas, region ? 0 : frame.x + cropX, region ? 0 : frame.y + cropY, cropWidth, cropHeight, Math.floor((canvasWidth - cropWidth) / 2), Math.floor((canvasHeight - cropHeight) / 2), cropWidth, cropHeight);
        }
        if (animate) animationFrame = requestAnimationFrame(draw);
      };
      if (motion) {
        const redraw = () => { cancelAnimationFrame(animationFrame); draw(performance.now()); };
        reducedMotion.addEventListener("change", redraw);
        removeMotionListener = () => reducedMotion.removeEventListener("change", redraw);
      }
      draw(startedAt);
      onReadyRef.current?.(true);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Character could not load. Try again.");
    });
    return () => { cancelled = true; cancelAnimationFrame(animationFrame); removeMotionListener?.(); };
  }, [key, cropX, cropY, cropWidth, cropHeight, canvasWidth, canvasHeight, attempt, motion, direction]);

  return (
    <span className={`character-preview${crop === "full" ? " character-preview-full" : ""} ${className}`}>
      <canvas ref={ref} width={canvasWidth} height={canvasHeight} role={label ? "img" : undefined} aria-label={label} aria-hidden={!label || undefined} />
      {error && label && (
        <span className="character-preview-error" role="alert">
          {error}<button type="button" className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
        </span>
      )}
    </span>
  );
}
