import { useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import type { AuthPreviewScene } from "../auth-preview-scene";

export function AuthWorldPreview() {
  const hostRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<AuthPreviewScene>(null);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visible) return;
    let app: Application | undefined;
    let disposed = false;
    let initialized = false;

    void Promise.all([import("pixi.js"), import("../auth-preview-scene")]).then(async ([pixi, scene]) => {
      if (disposed) return;
      app = new pixi.Application();
      await app.init({
        width: scene.PREVIEW_WIDTH,
        height: scene.PREVIEW_HEIGHT,
        backgroundAlpha: 0,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        preference: "webgl",
        antialias: true,
      });
      initialized = true;
      if (disposed) {
        app.destroy(true);
        return;
      }
      host.appendChild(app.canvas);
      sceneRef.current = new scene.AuthPreviewScene(app, () => setError(true));
    }).catch(() => {
      if (!disposed) setError(true);
    });

    return () => {
      disposed = true;
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (initialized) app?.destroy(true);
    };
  }, [visible]);

  return (
    <div className="auth-preview">
      <span ref={hostRef} className="auth-preview-canvas" aria-hidden="true" />
      {error && <span className="auth-preview-error" role="status">Preview unavailable</span>}
    </div>
  );
}
