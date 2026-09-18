import type { GameGuideStatus } from "@workhard/shared";
import { useEffect, useRef, useState } from "react";
import { fetchGameGuideState, saveGameGuideStatus } from "../../api";

export function useGuideProgress() {
  const [status, setStatus] = useState<GameGuideStatus | null>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const latestSave = useRef<GameGuideStatus | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchGameGuideState().then(state => {
      if (!cancelled) setStatus(state.status);
    }).catch(() => {
      if (!cancelled) setError("Guide progress could not be loaded. Try again.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  const save = (nextStatus: GameGuideStatus) => {
    latestSave.current = nextStatus;
    const version = ++saveVersion.current;
    setStatus(nextStatus);
    setError(undefined);
    saveQueue.current = saveQueue.current.then(async () => {
      if (!mounted.current) return;
      try {
        await saveGameGuideStatus(nextStatus);
        if (mounted.current && version === saveVersion.current) setError(undefined);
      } catch {
        if (mounted.current && version === saveVersion.current) setError("Guide progress could not be saved. Try again.");
      }
    });
  };

  const retry = () => {
    if (latestSave.current) save(latestSave.current);
    else {
      setError(undefined);
      setLoading(true);
      setLoadAttempt(attempt => attempt + 1);
    }
  };

  return { status, loading, error, save, retry, dismissError: () => setError(undefined) };
}
