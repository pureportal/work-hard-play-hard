import { useEffect, useState } from "react";
import type { FallingBlocksClear } from "@workhard/shared";

export function FallingBlocksClearNotice({ clear }: { clear: FallingBlocksClear }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1800);
    return () => window.clearTimeout(timer);
  }, [clear.id]);
  if (!visible) return null;
  const lineLabel = ["", "Single", "Double", "Triple", "Four-line clear"][clear.lines];
  const label = clear.spin === "none" ? lineLabel : `${clear.spin === "mini" ? "Mini T-spin" : "T-spin"} ${lineLabel}`.trim();
  return (
    <div className="falling-blocks-clear-notice" role="status">
      <strong>{clear.perfectClear ? "Perfect clear" : label}</strong>
      {clear.backToBack && <span>Back-to-back</span>}
      {clear.combo > 0 && <span>Combo {clear.combo}</span>}
      <span>+{clear.points.toLocaleString()}</span>
    </div>
  );
}
