import { useEffect, useRef, useState } from "react";
import { CHARACTER_CANVAS_SIZE, CHARACTER_DIRECTIONS, CHARACTER_FOOT_ANCHOR, CHARACTER_PORTRAIT_SCALE, CHARACTER_PORTRAIT_SIZE, characterAppearanceKey, getCharacterFrame, getCharacterIdleTransform, type CharacterAppearance, type CharacterDirection, type CharacterMotion } from "@workhard/shared";
import { loadCharacterLayers } from "../character-renderer";
import { CharacterAnimation } from "../character-animation";

const crops = {
  full: [36, 0, 108, 180],
  portrait: [67, 1, 46, 48],
  face: [72, 10, 36, 35],
  hair: [69, 2, 42, 45],
  headwear: [62, 0, 56, 46],
  upper: [58, 38, 64, 70],
  lower: [66, 71, 48, 84],
  shoes: [64, 126, 52, 49],
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
  const canvasWidth = crop === "full" ? 240 : 400;

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
    context.clearRect(0, 0, 400, 400);
    const portrait = !motion || motion === "idle";
    void loadCharacterLayers(appearanceRef.current, portrait ? "portrait" : "animation").then((layers) => {
      if (cancelled) return;
      const [x, y, width, height] = crops[crop];
      const scale = Math.min(canvasWidth / width, 400 / height);
      const startedAt = performance.now();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let previousFrame = "";
      const draw = (now: number) => {
        if (cancelled) return;
        const animate = motion && !reducedMotion.matches;
        const animation = animate ? animationRef.current.frame(now, motion!, direction) : getCharacterFrame(motion ?? "idle", direction, 0);
        const frame = portrait ? { x: CHARACTER_DIRECTIONS.indexOf(direction) * CHARACTER_PORTRAIT_SIZE, y: 0 } : animation;
        const sourceScale = portrait ? CHARACTER_PORTRAIT_SCALE : 1;
        const frameKey = `${animation.x}:${animation.y}`;
        if (frameKey !== previousFrame) {
          previousFrame = frameKey;
          context.clearRect(0, 0, 400, 400);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.save();
          if (motion === "idle") {
            const { scaleY } = getCharacterIdleTransform(animation.x / CHARACTER_CANVAS_SIZE);
            const footY = (400 - height * scale) / 2 + (CHARACTER_FOOT_ANCHOR.y - y) * scale;
            context.translate(0, footY);
            context.scale(1, scaleY);
            context.translate(0, -footY);
          }
          for (const layer of layers) context.drawImage(layer, frame.x + x * sourceScale, frame.y + y * sourceScale, width * sourceScale, height * sourceScale, (canvasWidth - width * scale) / 2, (400 - height * scale) / 2, width * scale, height * scale);
          context.restore();
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
  }, [key, crop, canvasWidth, attempt, motion, direction]);

  return (
    <span className={`character-preview${crop === "full" ? " character-preview-full" : ""} ${className}`}>
      <canvas ref={ref} width={canvasWidth} height={400} role={label ? "img" : undefined} aria-label={label} aria-hidden={!label || undefined} />
      {error && label && (
        <span className="character-preview-error" role="alert">
          {error}<button type="button" className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
        </span>
      )}
    </span>
  );
}
