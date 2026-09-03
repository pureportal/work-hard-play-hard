import { lazy, Suspense } from "react";
import type { WorldCanvasProps } from "./WorldCanvas";

const loadWorldCanvas = () => import("./WorldCanvas");
const LoadedWorldCanvas = lazy(async () => {
  const module = await loadWorldCanvas();
  return { default: module.WorldCanvas };
});

export function preloadWorldCanvas(): void {
  void loadWorldCanvas().catch(() => undefined);
}

export function WorldCanvas(props: WorldCanvasProps) {
  return (
    <Suspense fallback={<div className={`world-viewport ${props.editing ? "editing" : ""}`} />}>
      <LoadedWorldCanvas {...props} />
    </Suspense>
  );
}
