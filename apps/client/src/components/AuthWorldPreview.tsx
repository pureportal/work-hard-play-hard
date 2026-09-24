import { DEFAULT_CHARACTER_APPEARANCE, type CharacterDirection } from "@workhard/shared";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import officePreview from "../assets/blockbench-office.webp";
import { CharacterPreview } from "./CharacterPreview";

interface Point {
  x: number;
  y: number;
}

const startingPoint: Point = { x: 43, y: 43 };
const keyboardDestinations: Point[] = [
  { x: 36, y: 39 },
  { x: 70, y: 40 },
  { x: 37, y: 76 },
  { x: 73, y: 75 },
];
const ambientDestinations: Point[] = [
  { x: 33, y: 45 },
  startingPoint,
];

export function AuthWorldPreview() {
  const [position, setPosition] = useState(startingPoint);
  const [destination, setDestination] = useState<Point>();
  const [direction, setDirection] = useState<CharacterDirection>("down");
  const [walking, setWalking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [keyboardDestination, setKeyboardDestination] = useState(0);
  const [ambientDestination, setAmbientDestination] = useState(0);
  const [explored, setExplored] = useState(false);

  useEffect(() => {
    if (!walking) return;
    const timeout = window.setTimeout(() => setWalking(false), duration);
    return () => window.clearTimeout(timeout);
  }, [walking, duration, position]);

  const moveTo = useCallback((next: Point) => {
    const dx = next.x - position.x;
    const dy = next.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    setDirection(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up");
    setDuration(Math.min(1500, Math.max(420, distance * 26)));
    setWalking(true);
    setDestination(next);
    setPosition(next);
  }, [position]);

  useEffect(() => {
    if (explored || walking || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timeout = window.setTimeout(() => {
      moveTo(ambientDestinations[ambientDestination % ambientDestinations.length]!);
      setAmbientDestination((current) => current + 1);
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [ambientDestination, explored, moveTo, walking]);

  const explore = (event: MouseEvent<HTMLButtonElement>) => {
    setExplored(true);
    if (event.detail === 0) {
      const nextIndex = keyboardDestination % keyboardDestinations.length;
      moveTo(keyboardDestinations[nextIndex]!);
      setKeyboardDestination(nextIndex + 1);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    moveTo({
      x: Math.max(20, Math.min(80, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(23, Math.min(78, ((event.clientY - bounds.top) / bounds.height) * 100)),
    });
  };

  return (
    <button type="button" className="auth-preview" onClick={explore} aria-label="Explore the office">
      <span className="auth-preview-art" style={{ backgroundImage: `url(${officePreview})` }} />
      <span className="auth-preview-arcade-glow" />
      <span className="auth-preview-pond-ripple" />
      {destination && walking && <span className="auth-preview-destination" style={{ left: `${destination.x}%`, top: `${destination.y}%` }} />}
      <span
        className="auth-preview-player"
        style={{ left: `${position.x}%`, top: `${position.y}%`, transitionDuration: `${duration}ms` }}
      >
        <span className="auth-preview-shadow" />
        <CharacterPreview appearance={DEFAULT_CHARACTER_APPEARANCE} motion={walking ? "walk" : "idle"} direction={direction} />
      </span>
      <span className="auth-preview-hint">Click to explore</span>
    </button>
  );
}
