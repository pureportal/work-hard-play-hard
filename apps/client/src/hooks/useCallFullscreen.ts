import { useEffect, useState, type RefObject } from "react";

export function useCallFullscreen<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = async () => {
    setError("");
    try {
      if (document.fullscreenElement === ref.current) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
    } catch {
      setError("Fullscreen unavailable. Check your browser settings and try again.");
    }
  };

  return { fullscreen, error, toggleFullscreen };
}
