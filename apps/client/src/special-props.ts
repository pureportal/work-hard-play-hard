import { useCallback, useEffect, useState } from "react";
import { SPECIAL_PROP_COOLDOWN_MS, type ServerEvent, type SpecialPropUse } from "@workhard/shared";

export interface DisplaySpecialPropUse extends SpecialPropUse {
  startedAt: number;
}

export function useSpecialProps() {
  const [uses, setUses] = useState<DisplaySpecialPropUse[]>([]);
  const [now, setNow] = useState(Date.now);
  const handleEvent = useCallback((event: ServerEvent) => {
    if (event.type !== "interaction.prop_used") return;
    const startedAt = Date.now();
    setNow(startedAt);
    setUses(current => [...current.filter(use => use.objectId !== event.use.objectId && use.cooldownUntil > startedAt),
      { ...event.use, startedAt, cooldownUntil: startedAt + SPECIAL_PROP_COOLDOWN_MS }]);
  }, []);
  const active = uses.length > 0;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      setUses(current => current.filter(use => use.cooldownUntil > time));
    }, 200);
    return () => window.clearInterval(timer);
  }, [active]);
  const reset = useCallback(() => setUses([]), []);
  return { uses, now, handleEvent, reset };
}
